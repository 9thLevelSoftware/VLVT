# Architecture Patterns: v2.0 Beta Readiness Integration

**Domain:** Operational resilience, accessibility, and UX polish for existing dating app
**Researched:** 2026-02-27
**Confidence:** HIGH (based on codebase analysis + official pg/Railway/Flutter documentation)

## Executive Summary

The v2.0 milestone adds four capabilities to the existing VLVT architecture: resilient DB pools, graceful shutdown, tooltip accessibility, and page transitions. None of these require new services or architectural changes -- they are surgical modifications to existing components. The key architectural decisions are:

1. **Shared DB pool module in `@vlvt/shared`** -- The identical Pool configuration is copy-pasted across all 3 services (auth, profile, chat). A shared `createResilientPool()` factory eliminates this duplication and guarantees consistent reconnection behavior.
2. **Per-service page transition utilities** -- `VlvtPageRoute` and `VlvtFadeRoute` as simple utility classes in `frontend/lib/utils/` rather than in the widget library, since they are route factories not widgets.
3. **Tooltips are a per-file fix** -- No architectural component needed; tooltips are a property on existing `IconButton` widgets across 14 files.

## Current State Analysis

### Backend: DB Pool Architecture (All 3 Services)

Each service independently creates an identical `pg.Pool` with the same configuration:

```typescript
// IDENTICAL in auth-service/src/index.ts:173, chat-service/src/index.ts:236, profile-service/src/index.ts:262
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '2000', 10),
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});
```

Each service also registers identical event handlers: `pool.on('connect')`, `pool.on('acquire')`, `pool.on('remove')`, `pool.on('error')`.

**Current problem:** The `pool.on('error')` handler logs the error but does nothing to recover. When Railway cold starts or the DB restarts, all idle connections in the pool emit errors and are destroyed. The pool then auto-creates new connections on the next `pool.query()` call -- this is built into `pg.Pool` by default. However, there is no retry logic for queries that fail during the transient disconnect window, no health monitoring of pool state, and no integration with the existing health check endpoints.

### Backend: Graceful Shutdown (Inconsistent Across Services)

| Service | Has SIGTERM? | Has SIGINT? | Closes Pool? | Closes HTTP Server? | Closes Background Jobs? | Force Timeout? |
|---------|-------------|------------|-------------|--------------------|-----------------------|----------------|
| auth-service | NO | NO | NO | NO | N/A (no bg jobs) | NO |
| profile-service | YES | YES | NO | NO (calls `process.exit(0)` directly) | YES (schedulers) | NO |
| chat-service | YES | YES | NO | YES (via `httpServer.close()`) | YES (cleanup job) | YES (10s) |

**Critical gaps:**
- auth-service has ZERO signal handlers -- Railway deployments force-kill it
- None of the services call `pool.end()` during shutdown, leaving orphaned DB connections
- profile-service's shutdown skips HTTP server close -- in-flight requests are dropped
- Only chat-service has a force timeout (10s), which is good practice

### Frontend: Page Transition Patterns

**Existing patterns found in codebase (11 instances of PageRouteBuilder):**

1. **SlideTransition from right** (`Offset(1.0, 0.0) -> zero`) -- Used for forward navigation (profile_screen.dart lines 358, 384)
2. **SlideTransition from bottom** (`Offset(0.0, 1.0) -> zero`) -- Used for modal-like screens (safety_settings_screen.dart lines 449, 476, 505)
3. **FadeTransition** -- Used for After Hours chat transition (after_hours_tab_screen.dart line 173)
4. **Plain MaterialPageRoute** -- Used in 22 of 33 Navigator.push calls (no custom transition)

All custom transitions use `Curves.easeOutCubic`. The boilerplate for each PageRouteBuilder is 8-12 lines of identical transition code.

**Existing navigation methods used:**
- `Navigator.push()` -- Most common (forward navigation)
- `Navigator.pushReplacement()` -- Used for auth flow transitions
- `Navigator.pushAndRemoveUntil()` -- Used for deep link handling from notifications
- `Navigator.pop()` -- Standard back navigation

### Frontend: Tooltip Coverage

35 total `IconButton(` instances across 19 files. A subset already have `tooltip:` properties (verified in chats_screen.dart, chat_screen.dart, discovery_screen.dart, after_hours_chat_screen.dart, after_hours_tab_screen.dart). The milestone context identifies 20 missing tooltips across 14 files.

---

## Recommended Architecture

### Component 1: Shared Resilient Pool Factory (`@vlvt/shared`)

**Location:** `backend/shared/src/utils/resilient-pool.ts`
**Exported from:** `backend/shared/src/index.ts`

```typescript
import { Pool, PoolConfig, PoolClient } from 'pg';
import { createLogger } from './logger';

interface ResilientPoolOptions {
  serviceName: string;
  connectionString: string;
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
  maxRetries?: number;
  retryDelayMs?: number;
}

export function createResilientPool(options: ResilientPoolOptions): Pool {
  const logger = createLogger({ service: options.serviceName });

  const pool = new Pool({
    connectionString: options.connectionString,
    max: options.max ?? parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    idleTimeoutMillis: options.idleTimeoutMillis ?? parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '5000', 10),
    ssl: options.connectionString?.includes('railway')
      ? { rejectUnauthorized: false }
      : false,
  });

  // Existing event handlers (consolidate from 3 services)
  pool.on('connect', () => logger.info('New database connection established'));
  pool.on('error', (err) => {
    logger.error('Database pool error (connection will be removed and recreated on next use)', {
      error: err.message,
    });
    // pg.Pool automatically removes errored idle clients and creates new ones
    // on the next pool.query() or pool.connect() call. No manual reconnection needed.
  });

  return pool;
}
```

**Why a shared module, not per-service:**
- The Pool configuration is literally copy-pasted 3 times today
- The `@vlvt/shared` package already exists and all 3 services import from it
- Any reconnection/resilience improvements apply to all services at once
- The shared module already exports middleware, auth, rate limiting, error handling -- a pool factory fits naturally

**Why NOT a connection wrapper with retry logic:**
`pg.Pool` already handles reconnection. When an idle connection drops, the pool destroys it and creates a new one on the next `.query()`. Adding retry-on-query-failure would mask real DB errors and complicate debugging. The real gap is:
1. Missing `connectionTimeoutMillis` increase (2s is too aggressive for Railway cold starts, recommend 5s)
2. Missing `pool.end()` on shutdown
3. Missing pool stats in health check responses

**What changes in each service:**

```
BEFORE (in each service's index.ts):
  import { Pool } from 'pg';
  const pool = new Pool({ ...20 lines of config... });
  pool.on('connect', ...);
  pool.on('acquire', ...);
  pool.on('remove', ...);
  pool.on('error', ...);

AFTER:
  import { createResilientPool } from '@vlvt/shared';
  const pool = createResilientPool({
    serviceName: 'auth-service',  // or profile-service, chat-service
    connectionString: process.env.DATABASE_URL!,
  });
```

Each service goes from ~30 lines of pool setup to ~4 lines.

### Component 2: Shared Graceful Shutdown Handler (`@vlvt/shared`)

**Location:** `backend/shared/src/utils/graceful-shutdown.ts`
**Exported from:** `backend/shared/src/index.ts`

```typescript
import { Pool } from 'pg';
import { Server } from 'http';

interface ShutdownResource {
  name: string;
  close: () => Promise<void>;
}

interface GracefulShutdownOptions {
  serviceName: string;
  pool: Pool;
  server?: Server;              // HTTP server (Express app.listen returns this, or httpServer for chat-service)
  resources?: ShutdownResource[]; // Background jobs, schedulers, etc.
  timeoutMs?: number;           // Force-kill timeout (default: 10s)
}

export function registerGracefulShutdown(options: GracefulShutdownOptions): void {
  // Implementation: registers SIGTERM + SIGINT handlers
  // Shutdown order:
  //   1. Stop accepting new connections (server.close())
  //   2. Close background resources (schedulers, cleanup jobs)
  //   3. Drain DB pool (pool.end())
  //   4. Exit 0
  //   Force exit 1 after timeoutMs
}
```

**How it integrates with each service:**

| Service | `server` | `resources` (background jobs to close) |
|---------|----------|---------------------------------------|
| auth-service | Return value of `app.listen()` | None |
| profile-service | Return value of `app.listen()` | `closeMatchingScheduler`, `closeSessionScheduler`, `closeSessionCleanupJob` |
| chat-service | `httpServer` (already a variable) | `closeMessageCleanupJob` |

**Changes per service:**

```typescript
// auth-service: ADD (currently has zero signal handlers)
const server = app.listen(PORT, () => { ... });
registerGracefulShutdown({
  serviceName: 'auth-service',
  pool,
  server,
});

// profile-service: REPLACE existing SIGTERM/SIGINT handlers
registerGracefulShutdown({
  serviceName: 'profile-service',
  pool,
  server,
  resources: [
    { name: 'matching-scheduler', close: closeMatchingScheduler },
    { name: 'session-scheduler', close: closeSessionScheduler },
    { name: 'session-cleanup', close: closeSessionCleanupJob },
  ],
});

// chat-service: REPLACE existing gracefulShutdown function
registerGracefulShutdown({
  serviceName: 'chat-service',
  pool,
  server: httpServer,
  resources: [
    { name: 'message-cleanup', close: closeMessageCleanupJob },
  ],
});
```

**Railway-specific considerations:**
- Railway sends SIGTERM during deployments. If using `npm start`, the signal goes to npm, not Node. The existing `package.json` scripts should use `node dist/index.js` for production start commands. Verify this.
- Railway does not document its grace period, but industry standard is 10-30s. The 10s force timeout from chat-service is appropriate.

### Component 3: Page Transition Utilities (Flutter)

**Location:** `frontend/lib/utils/page_transitions.dart` (NEW FILE)

```dart
import 'package:flutter/material.dart';

/// Slide-in from right transition for forward navigation.
/// Matches existing pattern in profile_screen.dart.
class VlvtPageRoute<T> extends PageRouteBuilder<T> {
  VlvtPageRoute({required Widget child})
      : super(
          pageBuilder: (context, animation, secondaryAnimation) => child,
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return SlideTransition(
              position: Tween<Offset>(
                begin: const Offset(1.0, 0.0),
                end: Offset.zero,
              ).animate(CurvedAnimation(
                parent: animation,
                curve: Curves.easeOutCubic,
              )),
              child: child,
            );
          },
        );
}

/// Fade transition for modal-like navigation and overlays.
/// Matches existing pattern in after_hours_tab_screen.dart.
class VlvtFadeRoute<T> extends PageRouteBuilder<T> {
  VlvtFadeRoute({required Widget child})
      : super(
          pageBuilder: (context, animation, secondaryAnimation) => child,
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(opacity: animation, child: child);
          },
        );
}
```

**Why `lib/utils/` not `lib/widgets/`:**
Route factories are not widgets -- they are navigation utilities. The `lib/widgets/` directory contains visual components (buttons, cards, overlays). Putting route factories there would be a category error. `lib/utils/` does not currently exist but is the standard Flutter convention for utility classes.

**What changes in each screen file:**

```dart
// BEFORE (22 instances of this pattern):
Navigator.push(
  context,
  MaterialPageRoute(
    builder: (context) => const SomeScreen(),
  ),
);

// AFTER:
Navigator.push(context, VlvtPageRoute(child: const SomeScreen()));

// BEFORE (existing PageRouteBuilder with 8+ lines):
Navigator.push(
  context,
  PageRouteBuilder<void>(
    pageBuilder: (context, animation, secondaryAnimation) => const SomeScreen(),
    transitionsBuilder: (context, animation, secondaryAnimation, child) {
      return SlideTransition(
        position: Tween<Offset>(begin: const Offset(1.0, 0.0), end: Offset.zero)
          .animate(CurvedAnimation(parent: animation, curve: Curves.easeOutCubic)),
        child: child,
      );
    },
  ),
);

// AFTER:
Navigator.push(context, VlvtPageRoute(child: const SomeScreen()));
```

**Decision: Which transition for which navigation?**

| Navigation Type | Route Class | Current Instances | Example |
|----------------|-------------|-------------------|---------|
| Forward navigation (push to detail/edit/settings) | `VlvtPageRoute` (slide right) | 22 plain MaterialPageRoute + 6 SlideTransition(1,0) | ChatsScreen -> ChatScreen |
| Modal/overlay navigation (preferences, legal docs) | `VlvtFadeRoute` (fade) | 4 FadeTransition + 3 SlideTransition(0,1) | AfterHoursTab -> AfterHoursChat |
| Auth flow transitions | Keep `MaterialPageRoute` | 5 in auth flows | AuthScreen -> ForgotPasswordScreen |
| Deep link / pushAndRemoveUntil | Keep `MaterialPageRoute` | 2 in main.dart | Notification -> MainScreen |

**Rationale for keeping MaterialPageRoute in auth flows:** Auth screens (login, register, forgot password, verification) are one-time flows that should feel platform-native. Custom transitions on auth screens can feel jarring to new users who have not yet learned the app's visual language. The `pushAndRemoveUntil` calls in main.dart replace the entire navigation stack -- custom transitions add no value here.

### Component 4: Tooltip Accessibility (No New Component)

This is not an architectural change. It is 20 property additions across 14 files. Each `IconButton` that is missing a `tooltip:` property gets one added.

**Pattern to follow (from existing codebase):**

```dart
// EXISTING GOOD EXAMPLE (chat_screen.dart:692):
IconButton(
  icon: const Icon(Icons.more_vert),
  onPressed: _showUserActionSheet,
  tooltip: 'More options',  // <-- This is what 20 buttons are missing
),
```

**Tooltip naming convention (from existing examples in the codebase):**
- Action verbs: "Go back", "Clear search", "Search chats", "Sort chats", "Filter profiles"
- Object descriptions: "More options", "Propose a Date", "Retry", "Delete"
- No brand names in tooltips, no technical jargon

---

## Component Boundaries

| Component | Responsibility | Location | New/Modified | Communicates With |
|-----------|---------------|----------|--------------|-------------------|
| `createResilientPool()` | Pool factory with consistent config, error logging | `@vlvt/shared` | NEW | Each service's index.ts |
| `registerGracefulShutdown()` | SIGTERM/SIGINT handling, ordered resource cleanup | `@vlvt/shared` | NEW | Each service's index.ts |
| auth-service/index.ts | Use shared pool, add shutdown handler | auth-service | MODIFIED (replace ~30 lines pool setup, add ~5 lines shutdown) | `@vlvt/shared` |
| profile-service/index.ts | Use shared pool, replace shutdown handlers | profile-service | MODIFIED (replace ~30 lines pool setup, replace ~15 lines shutdown) | `@vlvt/shared` |
| chat-service/index.ts | Use shared pool, replace shutdown function | chat-service | MODIFIED (replace ~30 lines pool setup, replace ~25 lines shutdown) | `@vlvt/shared` |
| `VlvtPageRoute` / `VlvtFadeRoute` | Page transition factories | `frontend/lib/utils/` | NEW | 14+ screen files |
| 14 screen/widget files | Add missing tooltips | `frontend/lib/screens/` and `frontend/lib/widgets/` | MODIFIED (1-line additions per IconButton) | N/A |

## Data Flow Changes

### DB Pool Lifecycle (NEW)

```
Service Startup:
  index.ts -> createResilientPool(config) -> pg.Pool instance
  pool.on('error') handler registered (by factory)
  pool passed to route handlers, jobs, Socket.IO init

Normal Operation (unchanged):
  Route handler -> pool.query() -> PostgreSQL
  Socket handler -> pool.query() -> PostgreSQL

Connection Drop (Railway cold start / DB restart):
  Idle client emits error -> pool removes client -> pool.on('error') logs it
  Next pool.query() -> pool auto-creates new connection -> query succeeds
  (This is built into pg.Pool; the improvement is consistent error logging
   and increased connectionTimeoutMillis from 2s to 5s for cold starts)

Service Shutdown (NEW):
  SIGTERM received -> registerGracefulShutdown kicks in
    1. server.close() -- stop accepting new connections
    2. resources[].close() -- close background jobs
    3. pool.end() -- drain connections, wait for active queries
    4. process.exit(0)
    5. setTimeout -> process.exit(1) at 10s (force)
```

### Health Check Enhancement

The existing health checks (`GET /health`) already query the DB to verify connectivity. The `createResilientPool()` factory can optionally expose pool statistics (`pool.totalCount`, `pool.idleCount`, `pool.waitingCount`) that health check endpoints can include in responses. This is a minor enhancement, not a data flow change.

---

## Build Order (Dependency-Driven)

```
Step 1: @vlvt/shared additions (no service changes yet)
   |--- createResilientPool() in shared/src/utils/resilient-pool.ts
   |--- registerGracefulShutdown() in shared/src/utils/graceful-shutdown.ts
   |--- Export both from shared/src/index.ts
   |--- npm run build in shared package
   |
Step 2: Backend service integration (depends on Step 1)
   |--- Can be done in parallel across all 3 services:
   |    auth-service: replace pool + add shutdown
   |    profile-service: replace pool + replace shutdown
   |    chat-service: replace pool + replace shutdown
   |--- Run existing tests per service to verify no regression
   |
Step 3: Frontend page transition utilities (independent of Steps 1-2)
   |--- Create frontend/lib/utils/page_transitions.dart
   |--- Replace MaterialPageRoute calls in screen files
   |--- Replace existing PageRouteBuilder boilerplate
   |--- Run flutter analyze + flutter test
   |
Step 4: Frontend tooltip accessibility (independent of Steps 1-3)
   |--- Add tooltip: property to 20 IconButtons across 14 files
   |--- Run flutter analyze + flutter test
```

**Parallelization opportunities:**
- Steps 3 and 4 are completely independent of Steps 1-2 (frontend vs backend)
- Steps 3 and 4 are independent of each other (different files, no overlap)
- Within Step 2, the 3 services can be modified in parallel (they don't share source code)
- Step 1 must complete before Step 2 begins (shared package must be built first)

**Suggested agent assignment (4 agents):**
1. Agent A: Step 1 (shared package), then Step 2 auth-service
2. Agent B: Step 2 profile-service (waits for Step 1)
3. Agent C: Step 2 chat-service (waits for Step 1)
4. Agent D: Steps 3 + 4 (frontend, no backend dependency)

Or simpler with 2 agents:
1. Agent A: Steps 1 + 2 (all backend)
2. Agent B: Steps 3 + 4 (all frontend)

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Custom Retry Wrapper Around Pool

**What:** Creating a `queryWithRetry(pool, sql, params, { maxRetries: 3 })` function that catches query errors and retries.

**Why bad:** `pg.Pool` already handles connection-level failures by destroying bad connections and creating new ones. A retry wrapper masks genuine query errors (constraint violations, syntax errors, timeout on legitimately slow queries) and can cause duplicate writes in non-idempotent operations (e.g., inserting a message twice).

**Instead:** Increase `connectionTimeoutMillis` from 2s to 5s to handle Railway cold starts. Let `pg.Pool`'s built-in connection management handle reconnection. If a query fails, it should fail -- the error handler will log it and return 500 to the client.

### Anti-Pattern 2: Global Page Transition Theme

**What:** Setting a global `pageTransitionsTheme` on the `MaterialApp` that applies to ALL routes.

**Why bad:** Different navigation types warrant different transitions. Forward navigation should slide, modals should fade, auth flows should use platform defaults. A global theme forces one transition everywhere or requires explicit overrides for exceptions.

**Instead:** Use `VlvtPageRoute` and `VlvtFadeRoute` explicitly at each call site. This is more verbose (one extra import) but makes the intent clear and allows per-navigation decisions.

### Anti-Pattern 3: Shutdown Without Timeout

**What:** Calling `pool.end()` and `server.close()` without a force-kill timeout.

**Why bad:** If a long-running query or hanging connection prevents `pool.end()` from resolving, the process hangs indefinitely. Railway will eventually SIGKILL it, but the process is zombie-like until then.

**Instead:** Always set a force timeout (10s). The chat-service already does this correctly; apply the same pattern to all services via the shared shutdown handler.

### Anti-Pattern 4: Wrapping IconButton for Tooltip

**What:** Creating a `VlvtIconButton` widget that auto-generates tooltips from the icon name.

**Why bad:** Tooltips need human-readable, context-specific text. An auto-generated tooltip from `Icons.arrow_back` would be "Arrow back" instead of "Go back". Additionally, creating a wrapper widget means finding and replacing 35 IconButton instances across 19 files, which is far more invasive than adding a `tooltip:` property to 20 buttons.

**Instead:** Add `tooltip:` property directly to each `IconButton` that needs one. This is a 1-line change per button, requires no new abstraction, and guarantees human-quality tooltip text.

---

## Scalability Considerations

These changes are all at the "correct scale" for the current architecture. No over-engineering needed.

| Concern | Now (beta, <100 users) | At 10K users | At 1M users |
|---------|----------------------|--------------|-------------|
| DB pool size | `max: 20` per service (60 total) -- fine | May need tuning per service; monitor `waitingCount` | Connection pooler (PgBouncer) in front of Postgres |
| Graceful shutdown | 10s timeout -- fine | Same | Health check + load balancer drain before SIGTERM |
| Page transitions | 2 route classes -- fine | Same | Same (no scalability concern) |
| Tooltips | Manual strings -- fine | Same | i18n with `AppLocalizations` when going multi-language |

---

## Sources

- [node-postgres Pool API documentation](https://node-postgres.com/apis/pool) -- Pool auto-reconnection behavior, configuration options (HIGH confidence)
- [node-postgres Issue #1324: Auto-reconnect discussion](https://github.com/brianc/node-postgres/issues/1324) -- Confirms Pool handles reconnection automatically (HIGH confidence)
- [Railway SIGTERM troubleshooting](https://docs.railway.com/deployments/troubleshooting/nodejs-sigterm) -- Railway-specific signal handling guidance (HIGH confidence)
- [Express.js Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) -- Official Express guidance on shutdown ordering (HIGH confidence)
- VLVT codebase analysis: `backend/*/src/index.ts` (pool creation, signal handlers), `frontend/lib/screens/*.dart` (navigation patterns, IconButton instances)

---

*Architecture research: 2026-02-27 -- v2.0 Beta Readiness milestone*
