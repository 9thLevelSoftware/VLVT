# Technology Stack: VLVT v2.0 Beta Readiness

**Project:** VLVT Dating App - Operational Resilience, Accessibility, UX Polish
**Researched:** 2026-02-27
**Overall Confidence:** HIGH

## Executive Summary

This document covers the targeted stack additions needed for v2.0: resilient database pooling, graceful shutdown, Flutter tooltip accessibility, and page transitions. The key finding is that **no new npm packages are needed** for any of the backend work. The existing `pg` Pool (v8.16.3) has all the configuration options required for resilient reconnection, and Express/Node.js provides everything needed for graceful shutdown natively. On the Flutter side, the built-in `Tooltip` widget and `PageRouteBuilder` class handle both features without additional packages.

This is a "configuration and patterns" milestone, not a "new dependencies" milestone.

---

## 1. Resilient Database Pool (Backend)

### Recommended Approach: Enhanced pg Pool Configuration

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **pg (Pool)** | ^8.16.3 (current) | Connection pooling | Already in stack; has all needed resilience features built-in since v8.12+ | HIGH |

**No new packages needed.** The `pg` Pool already handles:
- Automatic eviction of dead connections (via `pool.on('error')` -- connections that error while idle are automatically removed from the pool)
- Lazy connection creation on next `pool.query()` or `pool.connect()`
- Connection lifetime management via `maxLifetimeSeconds` (prevents Railway/GKE 60-minute connection resets)
- Pool exhaustion protection via `connectionTimeoutMillis`

### Current State (What Exists)

All three services use identical pool config:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

pool.on('error', (err, client) => {
  logger.error('Unexpected database connection error', { error: err.message, stack: err.stack });
});
```

### What to Add

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
  min: parseInt(process.env.DATABASE_POOL_MIN || '2', 10),                    // NEW: Warm pool prevents cold-start latency
  idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '5000', 10), // CHANGED: 2s -> 5s for Railway cold starts
  maxLifetimeSeconds: parseInt(process.env.DATABASE_MAX_LIFETIME_S || '1800', 10),            // NEW: 30min, forces rotation before Railway timeouts
  allowExitOnIdle: false,                                                      // NEW: Keep pool alive even when idle
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});
```

Key changes:
1. **`min: 2`** -- Keeps 2 warm connections to avoid cold-start latency on first request after idle period
2. **`connectionTimeoutMillis: 5000`** -- Increase from 2s to 5s; Railway cold starts can take 3-4s
3. **`maxLifetimeSeconds: 1800`** -- Force connection rotation every 30 minutes; prevents stale connections from Railway infrastructure resets (60-min timeout documented in cloud PostgreSQL providers)
4. **`allowExitOnIdle: false`** -- Prevents Node.js event loop from exiting when all connections are idle (important for long-running services)

### Query Retry Wrapper

For handling transient connection failures during Railway deploys or database restarts, add a retry wrapper to `backend/shared/`:

```typescript
// backend/shared/src/utils/resilient-pool.ts
import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import logger from './logger';

const RETRYABLE_ERROR_CODES = [
  '57P01', // admin_shutdown
  '57P02', // crash_shutdown
  '57P03', // cannot_connect_now
  '08000', // connection_exception
  '08003', // connection_does_not_exist
  '08006', // connection_failure
  '08001', // sqlclient_unable_to_establish_sqlconnection
  '08004', // sqlserver_rejected_establishment_of_sqlconnection
];

export async function queryWithRetry<T extends QueryResultRow = any>(
  pool: Pool,
  text: string,
  params?: any[],
  maxRetries = 3,
  baseDelayMs = 100
): Promise<QueryResult<T>> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await pool.query<T>(text, params);
    } catch (err: any) {
      const isRetryable = RETRYABLE_ERROR_CODES.includes(err.code) ||
        err.message?.includes('Connection terminated') ||
        err.message?.includes('connection refused') ||
        err.message?.includes('ECONNRESET');

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }

      const delay = baseDelayMs * Math.pow(2, attempt - 1); // Exponential backoff: 100ms, 200ms, 400ms
      logger.warn('Retrying database query after transient error', {
        attempt,
        maxRetries,
        errorCode: err.code,
        errorMessage: err.message,
        delayMs: delay,
      });
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}
```

### Alternatives Considered

| Option | Recommended | Alternative | Why Not |
|--------|-------------|-------------|---------|
| Connection pooling | `pg` Pool (built-in) | `postgres-pool` npm package | postgres-pool adds retry features but is a less-maintained fork (last updated 2023); pg Pool's built-in eviction + our retry wrapper achieves the same result without adding a dependency |
| Connection pooling | `pg` Pool | PgBouncer (external) | Railway recommends PgBouncer for "more important use cases," but with 3 services at max 20 connections each = 60 total, well within PostgreSQL's default 100 limit. PgBouncer adds operational complexity (separate service to deploy/monitor) for no benefit at beta scale |
| Pool wrapper | Custom retry wrapper | `knex` ORM with retry | Would require rewriting all ~200+ raw SQL queries. Massive scope creep for a config improvement |

### Health Check Integration

The existing `/health` endpoints already check pool connectivity via `pool.query('SELECT 1')`. Enhance to report pool metrics:

```typescript
app.get('/health', async (req, res) => {
  const health = { /* existing fields */ };

  // Add pool metrics
  health.checks.pool = {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };

  // Pool exhaustion warning
  if (pool.waitingCount > 0) {
    health.status = 'degraded';
    logger.warn('Database pool has waiting clients', {
      waiting: pool.waitingCount,
      total: pool.totalCount,
      idle: pool.idleCount,
    });
  }
});
```

### Sources

- [node-postgres Pool API](https://node-postgres.com/apis/pool) -- Official docs confirming `maxLifetimeSeconds`, `min`, `allowExitOnIdle` config options, pool event semantics
- [node-postgres Issue #1324: Reconnection handling](https://github.com/brianc/node-postgres/issues/1324) -- Confirms pool auto-evicts errored idle clients
- [node-postgres Issue #2027: maxLifetimeSeconds](https://github.com/brianc/node-postgres/issues/2027) -- Feature addition for connection rotation
- [Railway Database Connection Pooling Guide](https://blog.railway.com/p/database-connection-pooling) -- Railway's own recommendations
- [Connection Pooling Best Practices 2026](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view) -- Production pool config patterns

---

## 2. Graceful Shutdown (Backend)

### Recommended Approach: Native Node.js Pattern (No Library)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Node.js http.Server.close()** | (built-in) | Stop accepting connections | Native, zero dependencies, recommended by Express official docs | HIGH |
| **pg Pool.end()** | ^8.16.3 (current) | Drain connection pool | Built into pg, waits for active queries to complete | HIGH |

**No new packages needed.** The official [Express graceful shutdown documentation](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) explicitly recommends the native `server.close()` pattern without any third-party library.

### Current State

| Service | Has Shutdown Handler | Closes Server | Drains Pool | Closes Jobs |
|---------|---------------------|---------------|-------------|-------------|
| auth-service | NO | NO | NO | N/A |
| profile-service | YES (partial) | NO | NO | YES (schedulers) |
| chat-service | YES (partial) | YES | NO | YES (cleanup job) |

**Critical gaps:**
- **auth-service** has no shutdown handler at all
- **profile-service** closes schedulers but not the HTTP server or pool
- **chat-service** closes the HTTP server but not the pool
- **None** of the services call `pool.end()` -- connections are orphaned on every Railway deploy

### Implementation Pattern

Create a shared utility in `backend/shared/`:

```typescript
// backend/shared/src/utils/graceful-shutdown.ts
import { Server } from 'http';
import { Pool } from 'pg';
import logger from './logger';

interface ShutdownOptions {
  server: Server;
  pool: Pool;
  timeoutMs?: number;
  onShutdown?: () => Promise<void>; // Custom cleanup (close schedulers, Redis, etc.)
}

export function setupGracefulShutdown(options: ShutdownOptions): void {
  const { server, pool, timeoutMs = 15000, onShutdown } = options;
  let isShuttingDown = false;

  const shutdown = async (signal: string) => {
    if (isShuttingDown) return; // Prevent double shutdown
    isShuttingDown = true;

    logger.info(`${signal} received, starting graceful shutdown...`);

    // Force exit after timeout
    const forceTimer = setTimeout(() => {
      logger.error('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);
    forceTimer.unref(); // Don't keep process alive just for this timer

    try {
      // 1. Stop accepting new connections
      await new Promise<void>((resolve) => {
        server.close(() => {
          logger.info('HTTP server closed, no longer accepting connections');
          resolve();
        });
      });

      // 2. Run custom cleanup (schedulers, Redis, etc.)
      if (onShutdown) {
        await onShutdown();
        logger.info('Custom cleanup completed');
      }

      // 3. Drain database pool (waits for active queries)
      await pool.end();
      logger.info('Database pool drained');

      process.exit(0);
    } catch (err) {
      logger.error('Error during graceful shutdown', {
        error: err instanceof Error ? err.message : 'Unknown',
      });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}
```

**Usage per service:**

```typescript
// auth-service/src/index.ts
import { setupGracefulShutdown } from '@vlvt/shared';

const server = app.listen(PORT, () => { ... });

setupGracefulShutdown({
  server,
  pool,
  timeoutMs: 15000,
});
```

```typescript
// profile-service/src/index.ts
setupGracefulShutdown({
  server,
  pool,
  timeoutMs: 15000,
  onShutdown: async () => {
    await closeMatchingScheduler();
    await closeSessionScheduler();
    await closeSessionCleanupJob();
  },
});
```

```typescript
// chat-service/src/index.ts
setupGracefulShutdown({
  server: httpServer,
  pool,
  timeoutMs: 15000,
  onShutdown: async () => {
    await closeMessageCleanupJob();
    // Socket.IO closes automatically with server.close()
  },
});
```

### Alternatives Considered

| Option | Recommended | Alternative | Why Not |
|--------|-------------|-------------|---------|
| Shutdown handler | Custom shared utility | `http-terminator` (v3.2.0) | Last published 4+ years ago. It tracks individual socket connections and sends `Connection: close` headers, which is useful for long-lived HTTP/1.1 keep-alive connections. But Railway's proxy layer already handles this. Adding a dependency for no benefit. |
| Shutdown handler | Custom shared utility | `lightship` | Designed for Kubernetes readiness/liveness probes. VLVT uses Railway, which has its own health check mechanism via the existing `/health` endpoint. Lightship adds a separate HTTP server (extra port, extra complexity) for a problem already solved. |
| Shutdown handler | Custom shared utility | `http-graceful-shutdown` | More recent (v4.x) but still a wrapper around `server.close()` + timeout. The 30-line shared utility above does the same thing with zero dependencies. |

### Shutdown Order

The order matters to prevent errors:

```
1. SIGTERM received
2. server.close()         -- Stop accepting NEW requests (in-flight complete)
3. Custom cleanup         -- Close schedulers, background jobs, Redis
4. pool.end()             -- Wait for active queries, then close all connections
5. process.exit(0)        -- Clean exit
```

If `pool.end()` is called before `server.close()`, in-flight requests will fail with connection errors.

### Sources

- [Express Official: Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html) -- Recommends native `server.close()` pattern, no third-party libraries
- [Graceful Shutdown in Express](https://www.codeconcisely.com/posts/graceful-shutdown-in-express/) -- Detailed pattern with connection tracking
- [Node.js Graceful Shutdown Handler 2026](https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view) -- Modern patterns with timeout protection
- [http-terminator npm](https://www.npmjs.com/package/http-terminator) -- Evaluated and rejected (stale, unnecessary for Railway)

---

## 3. Flutter Tooltip Accessibility

### Recommended Approach: IconButton.tooltip Property

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **Flutter Tooltip** | (SDK, Flutter 3.38.3) | Screen reader labels for icon buttons | Built-in, serves as both visual tooltip and semantic label; single property change per button | HIGH |

**No new packages needed.** The `IconButton` widget has a built-in `tooltip` property that simultaneously:
1. Shows a visual tooltip on long-press/hover
2. Provides a semantic label for TalkBack (Android) and VoiceOver (iOS)
3. Adds the button to the accessibility tree with a descriptive label

### Current State

The project has **37 IconButton instances across 19 files**. Some already have tooltips (e.g., in design system widgets), but approximately 20 are missing them based on the milestone requirements.

### Implementation Pattern

**Simple case -- just add the tooltip property:**

```dart
// BEFORE (inaccessible)
IconButton(
  icon: const Icon(Icons.arrow_back),
  onPressed: () => Navigator.pop(context),
)

// AFTER (accessible)
IconButton(
  icon: const Icon(Icons.arrow_back),
  onPressed: () => Navigator.pop(context),
  tooltip: 'Go back',
)
```

**Dynamic state labels:**

```dart
IconButton(
  icon: Icon(isFavorite ? Icons.favorite : Icons.favorite_border),
  onPressed: toggleFavorite,
  tooltip: isFavorite ? 'Remove from favorites' : 'Add to favorites',
)
```

### Tooltip vs Semantics: When to Use Which

| Widget Type | Use Tooltip | Use Semantics | Why |
|-------------|-------------|---------------|-----|
| `IconButton` | YES (via `tooltip:` property) | NO | Tooltip auto-provides semantic label; adding Semantics wrapper causes duplicate announcements in TalkBack |
| `FloatingActionButton` | YES (via `tooltip:` property) | NO | Same as IconButton |
| `PopupMenuButton` | YES (via `tooltip:` property) | NO | Same as IconButton |
| Custom `GestureDetector` | NO | YES (wrap in Semantics) | No built-in tooltip support |
| `Container` with `onTap` | NO | YES (wrap in Semantics) | Not semantically a button |

**IMPORTANT: Do NOT wrap IconButtons in Semantics widgets.** This creates duplicate announcements where TalkBack reads the custom semantics AND then separately announces the IconButton -- confusing for screen reader users.

### Known Issue: Android TalkBack (Flutter Issue #167174)

There is an open P2 issue ([flutter/flutter#167174](https://github.com/flutter/flutter/issues/167174)) where TalkBack in certain Android versions does not read IconButton tooltips. Found in Flutter 3.29 and 3.32. A recent comment suggests it works in TalkBack v16+.

**Mitigation:** The issue affects older TalkBack versions on specific Android builds. For VLVT's beta launch:
1. The tooltip approach is still correct (it's how Flutter's accessibility is designed to work)
2. Test with both TalkBack and VoiceOver during beta validation
3. If TalkBack fails on beta devices, the fallback is adding `Semantics(label: '...', child: IconButton(...))` -- but only add this if testing confirms the issue on target devices

### Tooltip Text Guidelines

For a dating app, tooltip text should be:
- **Action-oriented**: "Send message" not "Message button"
- **Context-aware**: "View John's profile" not just "View profile" (when name is available)
- **Concise**: 2-4 words maximum
- **State-reflecting**: "Unmute notifications" vs "Mute notifications" based on current state

### Sources

- [Flutter Tooltip API](https://api.flutter.dev/flutter/material/Tooltip-class.html) -- Confirms tooltip provides semantic label for screen readers
- [Practical Accessibility in Flutter (DCM, 2025)](https://dcm.dev/blog/2025/06/30/accessibility-flutter-practical-tips-tools-code-youll-actually-use) -- Recommends tooltip as primary approach for IconButton accessibility
- [Flutter Accessibility: Assistive Technologies](https://docs.flutter.dev/ui/accessibility/assistive-technologies) -- Official Flutter accessibility docs
- [Flutter Issue #167174: TalkBack tooltip reading](https://github.com/flutter/flutter/issues/167174) -- Open P2 issue with TalkBack, status tracking
- [Flutter Tooltip Semantics Order Breaking Change](https://docs.flutter.dev/release/breaking-changes/tooltip-semantics-order) -- Tooltip semantics ordering was changed in recent Flutter versions

---

## 4. Flutter Page Transitions

### Recommended Approach: Custom VlvtPageRoute/VlvtFadeRoute (PageRouteBuilder)

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| **PageRouteBuilder** | (SDK, Flutter 3.38.3) | Custom page transitions | Built-in, zero dependencies, full control over animations, composable | HIGH |

**No new packages needed.** The `page_transition` pub.dev package (last updated Dec 2024) wraps `PageRouteBuilder` with convenience presets, but adds a dependency for something achievable in ~40 lines of code. Since the milestone calls for exactly two transition types (slide and fade), custom route builders are the right call.

### Current State

All navigation uses `MaterialPageRoute` (13 files, ~20+ navigation calls). This gives platform-default transitions (zoom on Android since Flutter 3.x, slide from right on iOS).

### Implementation Pattern

Create reusable route builders in the design system:

```dart
// lib/widgets/vlvt_page_route.dart

import 'package:flutter/material.dart';

/// Slide-up transition for detail screens (profiles, chats, settings)
class VlvtPageRoute<T> extends PageRouteBuilder<T> {
  final Widget page;

  VlvtPageRoute({required this.page})
      : super(
          pageBuilder: (context, animation, secondaryAnimation) => page,
          transitionDuration: const Duration(milliseconds: 300),
          reverseTransitionDuration: const Duration(milliseconds: 250),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            final tween = Tween(
              begin: const Offset(1.0, 0.0), // Slide from right
              end: Offset.zero,
            ).chain(CurveTween(curve: Curves.easeOutCubic));

            return SlideTransition(
              position: animation.drive(tween),
              child: child,
            );
          },
        );
}

/// Fade transition for lateral navigation (tabs, overlays)
class VlvtFadeRoute<T> extends PageRouteBuilder<T> {
  final Widget page;

  VlvtFadeRoute({required this.page})
      : super(
          pageBuilder: (context, animation, secondaryAnimation) => page,
          transitionDuration: const Duration(milliseconds: 200),
          reverseTransitionDuration: const Duration(milliseconds: 150),
          transitionsBuilder: (context, animation, secondaryAnimation, child) {
            return FadeTransition(
              opacity: CurveTween(curve: Curves.easeIn).animate(animation),
              child: child,
            );
          },
        );
}
```

**Usage (replacing MaterialPageRoute calls):**

```dart
// BEFORE
Navigator.push(context, MaterialPageRoute(builder: (_) => ChatScreen(match: entry.match!)));

// AFTER
Navigator.push(context, VlvtPageRoute(page: ChatScreen(match: entry.match!)));
```

### Transition Assignment Strategy

| Screen Type | Transition | Rationale |
|-------------|------------|-----------|
| Detail screens (ChatScreen, ProfileDetailScreen, ProfileEditScreen) | `VlvtPageRoute` (slide from right) | Standard detail-push pattern, consistent with iOS/Material conventions |
| Modal screens (PaywallScreen, SafetySettingsScreen) | `VlvtPageRoute` (slide from right) | Pushes onto navigation stack |
| Overlays/lateral (search, filters) | `VlvtFadeRoute` (crossfade) | Not a hierarchical navigation; feels like a layer appearing |
| Auth flow screens (RegisterScreen) | `VlvtFadeRoute` (crossfade) | Soft transition for signup flow |

### Alternative: Global PageTransitionsTheme

Flutter also supports setting page transitions globally via `ThemeData.pageTransitionsTheme`:

```dart
MaterialApp(
  theme: ThemeData(
    pageTransitionsTheme: PageTransitionsTheme(
      builders: {
        TargetPlatform.android: ZoomPageTransitionsBuilder(),
        TargetPlatform.iOS: CupertinoPageTransitionsBuilder(),
      },
    ),
  ),
)
```

**Why NOT use this approach:**
- It applies the same transition to ALL routes -- we want different transitions for different screen types (slide for detail, fade for lateral)
- It only works with `MaterialPageRoute`, not `PageRouteBuilder`
- Less explicit about what transition each navigation uses

### Alternatives Considered

| Option | Recommended | Alternative | Why Not |
|--------|-------------|-------------|---------|
| Custom VlvtPageRoute/VlvtFadeRoute | YES | `page_transition` package | Adds dependency for 2 transitions we can build in 40 lines. Last updated Dec 2024. We need only 2 transition types. |
| Custom VlvtPageRoute/VlvtFadeRoute | YES | `PageTransitionsTheme` (global) | Cannot have different transitions for different screen types. Too blunt for our needs. |
| Custom VlvtPageRoute/VlvtFadeRoute | YES | `go_router` with transitions | Would require rewriting all navigation. Massive scope creep. |

### Sources

- [Flutter Cookbook: Page Route Animation](https://docs.flutter.dev/cookbook/animation/page-route-animation) -- Official PageRouteBuilder pattern with SlideTransition example
- [PageRouteBuilder API Reference](https://api.flutter.dev/flutter/widgets/PageRouteBuilder-class.html) -- API docs for pageBuilder and transitionsBuilder callbacks
- [PageTransitionsTheme API](https://api.flutter.dev/flutter/material/PageTransitionsTheme-class.html) -- Global theme approach (evaluated and rejected for this use case)
- [Default Android Page Transition Breaking Change](https://docs.flutter.dev/release/breaking-changes/default-android-page-transition) -- Documents the shift to PredictiveBackPageTransitionsBuilder

---

## 5. Version Compatibility Matrix

| Existing Dependency | Current Version | Latest Available | Upgrade Needed? | Notes |
|---------------------|-----------------|------------------|-----------------|-------|
| `pg` | ^8.16.3 | 8.19.0 | Optional | v8.16.3 has all needed features (`maxLifetimeSeconds`, `min`, `allowExitOnIdle`). Upgrade for bug fixes if desired. |
| `express` | ^5.1.0 | ^5.1.0 | No | Already on Express 5 |
| `@types/pg` | ^8.15.6 | ^8.15.6 | No | Types up to date |
| Flutter SDK | 3.38.3 | 3.38.3 | No | Latest stable. Has `SemanticsRole` API (added 3.32+), `Tooltip` improvements. |

---

## 6. What NOT to Add

| Category | Avoid | Why |
|----------|-------|-----|
| **DB Pooling** | `postgres-pool` npm | Fork of pg-pool, less maintained, adds reconnection features we can implement ourselves in 50 lines |
| **DB Pooling** | PgBouncer | Separate service to deploy/monitor. 60 connections (3 services x 20 max) is well within PostgreSQL limits. Overkill for beta. |
| **DB Pooling** | `knex` or `sequelize` | ORM migration to get retry features = rewriting 200+ raw SQL queries. Absurd scope creep. |
| **Shutdown** | `http-terminator` | Last published 4+ years ago. Tracks keep-alive sockets, but Railway's proxy handles this. 30 lines of custom code beats a stale dependency. |
| **Shutdown** | `lightship` | Kubernetes-focused. Adds separate HTTP server for health probes. VLVT already has `/health` endpoints. |
| **Shutdown** | `stoppable` | Abandoned. Simple wrapper around `server.close()` that we can write ourselves. |
| **Transitions** | `page_transition` package | Dependency for something built into Flutter in 40 lines. Only need 2 transition types. |
| **Transitions** | `go_router` | Would require rewriting all navigation to use named routes. Out of scope. |
| **Accessibility** | `Semantics` wrapper on IconButtons | Creates duplicate screen reader announcements. IconButton's `tooltip` property already provides semantics. |

---

## 7. Installation Summary

### Backend -- All 3 Services

```bash
# No new npm packages to install.
# Changes are configuration-only to existing pg Pool setup.
```

### Backend -- Shared Package

```bash
# New files to create (no new dependencies):
# backend/shared/src/utils/resilient-pool.ts    -- queryWithRetry helper
# backend/shared/src/utils/graceful-shutdown.ts  -- setupGracefulShutdown helper
```

### Frontend

```bash
# No new pub.dev packages to install.
# New files to create:
# lib/widgets/vlvt_page_route.dart  -- VlvtPageRoute and VlvtFadeRoute
```

### Optional pg Upgrade

```bash
# If desired (each backend service):
cd backend/auth-service && npm install pg@^8.19.0
cd backend/profile-service && npm install pg@^8.19.0
cd backend/chat-service && npm install pg@^8.19.0
```

---

## 8. Integration Points with Existing Stack

| New Capability | Integrates With | How |
|----------------|-----------------|-----|
| Resilient pool config | Existing `new Pool({...})` in each service's index.ts | Add `min`, `maxLifetimeSeconds`, `allowExitOnIdle` to existing config object |
| Query retry wrapper | Existing `pool.query()` calls | Can be used selectively for critical operations (auth, matches) without touching every query |
| Graceful shutdown | Existing `server.listen()` return value | Wrap with `setupGracefulShutdown()` call after server starts |
| Graceful shutdown | Existing scheduler cleanup (profile-service, chat-service) | Pass existing `closeXxxScheduler()` functions via `onShutdown` callback |
| Health check pool metrics | Existing `/health` endpoints | Add `pool.totalCount`/`idleCount`/`waitingCount` to existing health response |
| Tooltip accessibility | Existing IconButton instances in 19 files | Add `tooltip: 'description'` property to each |
| Page transitions | Existing `MaterialPageRoute(...)` calls in 13 files | Replace with `VlvtPageRoute(page: ...)` or `VlvtFadeRoute(page: ...)` |
| Sentry error reporting | Existing Sentry setup in each service | Pool errors and shutdown events already flow through Winston logger; Sentry captures errors automatically |

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| pg Pool resilience | HIGH | Official docs confirm all config options. `maxLifetimeSeconds`, `min` verified in node-postgres API docs. |
| Retry wrapper pattern | HIGH | Well-established pattern. PostgreSQL error codes are standardized. Exponential backoff is proven. |
| Graceful shutdown | HIGH | Official Express docs recommend this exact pattern. `pool.end()` is in pg API docs. |
| Tooltip accessibility | HIGH | Official Flutter docs + DCM practical guide both recommend `tooltip:` property. One caveat: TalkBack issue #167174 (P2, open) may affect some Android versions. |
| Page transitions | HIGH | Official Flutter cookbook documents PageRouteBuilder pattern. SDK-native, no dependencies. |

---

## Sources Summary

### Database Pooling
- [node-postgres Pool API](https://node-postgres.com/apis/pool)
- [node-postgres Issue #1324: Reconnection](https://github.com/brianc/node-postgres/issues/1324)
- [node-postgres Issue #2027: maxLifetimeSeconds](https://github.com/brianc/node-postgres/issues/2027)
- [Railway Database Connection Pooling](https://blog.railway.com/p/database-connection-pooling)
- [pg npm package](https://www.npmjs.com/package/pg) (v8.19.0 latest)

### Graceful Shutdown
- [Express: Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)
- [Graceful Shutdown in Express](https://www.codeconcisely.com/posts/graceful-shutdown-in-express/)
- [Graceful Shutdown Handler 2026](https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view)

### Flutter Accessibility
- [Flutter Tooltip API](https://api.flutter.dev/flutter/material/Tooltip-class.html)
- [Practical Accessibility in Flutter (DCM)](https://dcm.dev/blog/2025/06/30/accessibility-flutter-practical-tips-tools-code-youll-actually-use)
- [Flutter Assistive Technologies Docs](https://docs.flutter.dev/ui/accessibility/assistive-technologies)
- [Flutter Issue #167174: TalkBack tooltip](https://github.com/flutter/flutter/issues/167174)

### Flutter Page Transitions
- [Flutter Cookbook: Page Route Animation](https://docs.flutter.dev/cookbook/animation/page-route-animation)
- [PageRouteBuilder API](https://api.flutter.dev/flutter/widgets/PageRouteBuilder-class.html)
- [PageTransitionsTheme API](https://api.flutter.dev/flutter/material/PageTransitionsTheme-class.html)
