# Feature Landscape: v2.0 Beta Readiness

**Domain:** Operational resilience, accessibility, UX polish
**Researched:** 2026-02-27
**Overall Confidence:** HIGH (verified against official docs, existing codebase, and community best practices)

---

## Executive Summary

The v2.0 milestone addresses 5 remaining P2 issues from the Board of Directors review. These are not new user-facing features -- they are operational hardening and polish items that separate a "works in demo" app from a "ready for real users" app. All 4 technical areas (DB resilience, graceful shutdown, accessibility tooltips, page transitions) have well-established patterns with clear table stakes vs differentiator boundaries.

The existing codebase already has partial implementations in each area (pool error handlers exist but lack retry logic; chat-service has graceful shutdown but auth/profile services are incomplete; some IconButtons have tooltips but ~20 do not; all navigation uses raw MaterialPageRoute). This means the work is about completing and standardizing patterns, not inventing new ones.

---

## Table Stakes

Features users/operators expect. Missing = app feels unfinished or fragile in production.

### Backend: Resilient Database Pool

| Feature | Why Expected | Complexity | Current Status | Notes |
|---------|--------------|------------|----------------|-------|
| **Pool error event handler** | pg Pool emits errors on behalf of idle clients during network partitions. Unhandled = process crash. | Low | DONE (all 3 services) | `pool.on('error')` exists but calls `logger.error` only -- does not attempt recovery |
| **Connection timeout configuration** | Railway cold starts and network blips cause connection delays. Without timeout, queries hang indefinitely. | Low | DONE | `connectionTimeoutMillis: 2000` already set across all services |
| **Idle timeout configuration** | Long-idle connections get killed by Railway/PostgreSQL. Pool must evict stale connections. | Low | DONE | `idleTimeoutMillis: 30000` already set |
| **Automatic retry on transient errors** | Connection drops (ECONNRESET, ETIMEDOUT, "connection terminated unexpectedly") must retry transparently. Users should not see 500 errors for temporary network blips. | Medium | MISSING | No retry logic exists. A query that fails due to a dropped connection returns an error directly to the caller. |
| **Pool health reporting in /health endpoint** | Health checks already query the DB but do not report pool utilization (total, idle, waiting clients). Ops needs pool metrics for capacity planning. | Low | PARTIAL | Health endpoint queries DB but does not expose `pool.totalCount`, `pool.idleCount`, `pool.waitingCount` |
| **Exponential backoff on reconnection** | When DB is fully down (Railway maintenance, failover), naive retry floods the DB with connection attempts. Backoff prevents thundering herd. | Medium | MISSING | No backoff logic exists |

### Backend: Graceful Shutdown

| Feature | Why Expected | Complexity | Current Status | Notes |
|---------|--------------|------------|----------------|-------|
| **SIGTERM handler** | Railway sends SIGTERM before SIGKILL during deployments. Without handler, connections are severed mid-request causing data corruption and orphaned connections. | Low | PARTIAL | chat-service has it (httpServer.close + cleanup jobs). profile-service has it (scheduler cleanup only, no pool.end()). auth-service has NONE. |
| **Stop accepting new requests** | After SIGTERM, server must stop accepting new connections while finishing in-flight requests. | Low | PARTIAL | chat-service calls `httpServer.close()`. Others do not. |
| **Drain in-flight requests** | Existing requests must complete before process exits. | Low | PARTIAL | chat-service waits via httpServer.close callback. Others call process.exit(0) immediately. |
| **Close database pool** | `pool.end()` waits for checked-out clients to return, then closes all connections. Prevents orphaned connections on Railway. | Low | MISSING | No service calls `pool.end()`. All rely on process termination to kill connections. |
| **Close Socket.IO connections** | chat-service has WebSocket connections that need graceful close to trigger client reconnection. | Low | PARTIAL | httpServer.close() implicitly closes sockets, but no explicit io.close() |
| **Force-exit timeout** | If graceful shutdown stalls (hung query, stuck client), process must force-exit after a deadline to avoid indefinite hang. Railway will SIGKILL after draining period anyway, but self-imposed timeout prevents zombie state. | Low | PARTIAL | chat-service has 10s setTimeout. Others have no timeout. |
| **Configure RAILWAY_DEPLOYMENT_DRAINING_SECONDS** | Railway defaults to 0 seconds draining, meaning SIGKILL follows SIGTERM immediately. Must set to at least 10-30s. | Low | UNKNOWN | Not verified whether this Railway variable is configured |

### Frontend: Accessibility (Tooltips on IconButtons)

| Feature | Why Expected | Complexity | Current Status | Notes |
|---------|--------------|------------|----------------|-------|
| **Tooltip on every IconButton** | IconButton.tooltip doubles as the semantic label. Screen readers (TalkBack/VoiceOver) read the tooltip text. Without it, screen readers announce "button" with no context. This is WCAG 2.1 Level A failure (1.1.1 Non-text Content). | Low | PARTIAL | Audit found ~20 IconButtons missing tooltips. Some screens (chats_screen, after_hours_tab_screen) already have them. |
| **Semantics on GestureDetector buttons** | GestureDetector is invisible to the accessibility tree. Custom tap targets must have Semantics wrapper. | Low | PARTIAL | Audit identified 6+ GestureDetectors without Semantics (auth OAuth buttons, match cards, bottom nav) |
| **excludeSemantics on decorative elements** | Screen readers announce decorative images/animations, confusing users. Must explicitly exclude. | Low | PARTIAL | 4 decorative elements identified (auth background, loading placeholder, heart particles, shadow card) |
| **MergeSemantics where needed** | Prevent duplicate announcements when Semantics + IconButton both create separate semantic nodes. | Low | NOT STARTED | Need to audit for cases where both Semantics wrapper and IconButton tooltip would create double-reads |

### Frontend: Page Transitions

| Feature | Why Expected | Complexity | Current Status | Notes |
|---------|--------------|------------|----------------|-------|
| **Consistent transitions on Navigator.push** | Raw MaterialPageRoute uses default platform animation (zoom-fade on Android, slide-right on iOS). Inconsistency when some navigations have custom transitions and others use default creates jarring UX. | Medium | MISSING | All 162+ Navigator calls use raw MaterialPageRoute. No VlvtPageRoute or VlvtFadeRoute exists. UX audit identified 12+ transitions needing attention. |
| **Platform-appropriate defaults** | iOS users expect slide-from-right. Android users expect zoom-fade (Material 3). Using wrong animation per platform feels non-native. | Low | IMPLICIT | MaterialPageRoute already handles this via PageTransitionsTheme. The issue is inconsistency, not wrong defaults. |
| **Modal-style transitions for settings/filters** | Screens that present as "temporary views" (filters, settings, legal docs) should use slide-from-bottom or fade, not the same transition as forward navigation. | Medium | MISSING | All navigations use identical MaterialPageRoute regardless of context |

---

## Differentiators

Features that elevate the app above "minimum viable" but are not strictly required.

### Backend: Advanced Pool Resilience

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Circuit breaker pattern** | When DB is completely unreachable, stop attempting connections entirely for a cooldown period. Prevents log flooding and resource waste. Resume automatically when DB recovers. | Medium | Valuable for Railway cold starts where DB may be unavailable for 10-30 seconds. Not strictly required if backoff is implemented. |
| **Connection pool metrics in Sentry** | Emit pool utilization (total, idle, waiting) as Sentry custom metrics. Enables alerting on pool exhaustion before it causes user-visible errors. | Low | Natural extension of existing Sentry integration. Provides proactive monitoring. |
| **Query-level retry with idempotency awareness** | Retry SELECT queries transparently but require explicit opt-in for INSERT/UPDATE/DELETE to prevent double-writes. | Medium | More sophisticated than blanket retry. Prevents subtle data corruption from retrying non-idempotent operations. |
| **Pool warmup on startup** | Pre-create minimum connections on service start rather than lazily on first request. Eliminates cold-start latency for first users. | Low | pg Pool supports `min` option but VLVT does not set it (defaults to 0). |

### Backend: Graceful Shutdown

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Connection draining with request tracking** | Track active request count. Log how many requests were in-flight at shutdown. Useful for debugging deployment issues. | Low | Simple counter middleware. Provides operational visibility. |
| **Scheduled job safe checkpointing** | Matching scheduler and session cleanup jobs should checkpoint state before shutdown, resuming cleanly on restart. | Medium | Prevents lost matching rounds or duplicate session cleanups. |

### Frontend: Accessibility

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Semantic labels on all images** | semanticLabel on cached_network_image photos (profile pics, match cards). Not just IconButtons but all visual content. | Medium | Full WCAG AA compliance for images. Current scope is just IconButton tooltips (the P2 item). |
| **Live region announcements for chat** | New messages announced via `Semantics(liveRegion: true)`. Screen reader users know when new messages arrive without manually re-reading. | Medium | Identified in audit but scoped as "low priority enhancement". |
| **Focus management in modals** | Match overlay, bottom sheets, and dialogs should trap focus and return it on dismiss. | Medium | Standard WCAG practice but not in current scope. |

### Frontend: Page Transitions

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Hero transitions for profile photos** | Avatar in chat list animates into full profile view. Creates visual continuity and premium feel. | Medium | Chat screen already has Hero tags but no matching transition defined. |
| **Staggered list animations** | Match cards and chat list items animate in with stagger delay. Premium polish. | Medium | Identified in UX audit. Nice-to-have. |
| **Shared element transitions** | Photo in discovery card transitions to profile detail view. High-end animation. | High | Complex to implement correctly across the swipe gesture system. Defer. |

---

## Anti-Features

Features to explicitly NOT build for this milestone.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Custom connection pool library** | pg Pool is battle-tested and well-understood. Custom pool adds maintenance burden and risk. | Wrap pg Pool with retry/backoff logic. Do not replace it. |
| **ORM migration (Prisma/TypeORM)** | Massive migration effort for no user-visible benefit. Existing raw pg queries work fine. | Keep raw pg with Pool wrapper. Resilience is at the connection level, not the query builder level. |
| **Full WCAG AAA compliance** | AAA is aspirational, not required. Attempting it blocks beta launch for marginal benefit. | Target WCAG AA for the specific items identified (tooltips, semantic labels). AAA is post-launch. |
| **Custom animated page transition library** | Over-engineering. Flutter's built-in PageRouteBuilder and CupertinoPageTransitionsBuilder cover all needed patterns. | Two utility classes (VlvtPageRoute, VlvtFadeRoute) wrapping PageRouteBuilder. No external packages. |
| **Deep accessibility tree restructuring** | Refactoring widget hierarchy for optimal screen reader navigation order is high-effort, low-priority. | Add tooltips to existing IconButtons. Fix the 20 identified items. Deeper restructuring is v3+. |
| **Animated transition for EVERY navigation** | Some navigations (e.g., auth flow, pushReplacement for tab switches) should remain instant. Adding transitions everywhere feels slow. | Only add transitions to forward navigation pushes. Replacement navigations and pops should use defaults. |
| **Connection pooling via PgBouncer** | External connection proxy adds infrastructure complexity. Appropriate at scale (10K+ connections) but overkill for beta. | Configure pg Pool parameters directly. Railway supports PgBouncer but it is not needed at beta scale. |

---

## Feature Dependencies

```
Resilient DB Pool (shared utility)
    |-- auth-service/src/index.ts (import + use wrapper)
    |-- profile-service/src/index.ts (import + use wrapper)
    |-- chat-service/src/index.ts (import + use wrapper)
    |-- Health endpoints (expose pool metrics)
    |
    +-- Depends on: existing pg Pool configuration, existing error handlers

Graceful Shutdown (per-service)
    |-- Depends on: Resilient DB Pool (must call pool.end())
    |-- auth-service: Add SIGTERM handler (currently missing entirely)
    |-- profile-service: Enhance handler (add pool.end(), server.close())
    |-- chat-service: Enhance handler (add pool.end(), io.close())
    |-- Railway config: Set RAILWAY_DEPLOYMENT_DRAINING_SECONDS >= 15
    |
    +-- Must be implemented AFTER pool wrapper (pool.end() needs to exist)

Tooltip Accessibility (frontend only)
    |-- ~20 IconButtons across 11 screens need tooltip added
    |-- 4 GestureDetector buttons need Semantics wrapper
    |-- 4 decorative elements need ExcludeSemantics
    |
    +-- No backend dependency. Can run in parallel with backend work.

Page Transitions (frontend only)
    |-- Create VlvtPageRoute (slide-from-right, platform-adaptive)
    |-- Create VlvtFadeRoute (fade, for modals/settings)
    |-- Replace ~12+ MaterialPageRoute calls across screens
    |-- Optionally: Set PageTransitionsTheme in ThemeData for global default
    |
    +-- No backend dependency. Can run in parallel.
    +-- No dependency on tooltip work either.
```

### Parallelization Opportunities

- Backend (DB pool + graceful shutdown) and Frontend (tooltips + transitions) are fully independent
- Within backend: DB pool wrapper must come first, then graceful shutdown (which uses pool.end())
- Within frontend: tooltips and transitions are independent, can parallelize

---

## Specific Implementation Inventory

### IconButtons Missing Tooltips (from audit + codebase grep)

| File | Line | Widget | Suggested Tooltip |
|------|------|--------|-------------------|
| `after_hours_chat_screen.dart` | 894 | Send message button | "Send message" |
| `after_hours_preferences_screen.dart` | 210 | Close button | "Close preferences" |
| `after_hours_profile_screen.dart` | 380 | Close button | "Close profile" |
| `chat_screen.dart` | 986 | Emoji/attachment button | "Add attachment" |
| `chat_screen.dart` | 1046 | Send message button | "Send message" |
| `chat_screen.dart` | 1097 | Calendar button | "Propose a date" |
| `chat_screen.dart` | 1119 | Send message button | "Send message" |
| `discovery_screen.dart` | 756 | Filter button | "Filter profiles" |
| `discovery_screen.dart` | 777 | Filter button | "Filter profiles" |
| `discovery_screen.dart` | 819 | Filter button | "Filter profiles" |
| `discovery_screen.dart` | 925 | Refresh/action button | (check actual icon) |
| `forgot_password_screen.dart` | 150 | Back button | "Go back" |
| `id_verification_screen.dart` | 249 | Back button | "Go back" |
| `invite_screen.dart` | 373 | Copy/share button | (check actual icon) |
| `paywall_screen.dart` | 73 | Back/close button | "Go back" |
| `paywall_screen.dart` | 452 | Restore purchases | "Restore purchases" |
| `paywall_screen.dart` | 459 | Close button | "Close" |
| `profile_detail_screen.dart` | 184 | Back button | "Go back" |
| `profile_edit_screen.dart` | 298 | Back button | "Go back" |
| `profile_screen.dart` | 117 | Logout button | "Sign out" |
| `profile_screen.dart` | 138 | Logout button | "Sign out" |
| `register_screen.dart` | 257 | Back button | "Go back to sign in" |
| `verification_screen.dart` | 183 | Back button | "Go back" |

**Already have tooltips (no change needed):**
- `after_hours_chat_screen.dart:544` -- "Go back"
- `after_hours_tab_screen.dart:639` -- "End After Hours session"
- `chats_screen.dart:619` -- "Clear search"
- `chats_screen.dart:632` -- "Search chats"
- `chats_screen.dart:644` -- "Sort chats"
- `chat_screen.dart:689` -- "More options" (exists, could be more descriptive)

### Navigator.push Calls Needing VlvtPageRoute (from UX audit)

| File | Current | Recommended Transition |
|------|---------|----------------------|
| `auth_screen.dart` (to register) | MaterialPageRoute | VlvtFadeRoute (auth flow, fade is appropriate) |
| `auth_screen.dart` (to forgot password) | MaterialPageRoute | VlvtFadeRoute (auth flow) |
| `discovery_screen.dart` (to filters) | MaterialPageRoute | VlvtPageRoute (slide-from-right, standard forward nav) |
| `discovery_screen.dart` (to matches) | MaterialPageRoute | VlvtPageRoute (forward nav) |
| `chat_screen.dart` (to profile detail) | MaterialPageRoute | VlvtPageRoute (forward nav, consider Hero) |
| `chats_screen.dart` (to chat) | MaterialPageRoute | VlvtPageRoute (forward nav) |
| `profile_screen.dart` (to safety settings) | MaterialPageRoute | VlvtPageRoute (forward nav) |
| `profile_screen.dart` (to invite) | MaterialPageRoute | VlvtPageRoute (forward nav) |
| `safety_settings_screen.dart` (to legal docs) | MaterialPageRoute | VlvtFadeRoute (modal-style content) |
| `safety_settings_screen.dart` (to consent) | MaterialPageRoute | VlvtPageRoute (forward nav) |
| `after_hours_tab_screen.dart` (to chat) | MaterialPageRoute | VlvtPageRoute (forward nav) |
| `after_hours_tab_screen.dart` (to prefs) | MaterialPageRoute | VlvtPageRoute (forward nav) |

### Graceful Shutdown Status by Service

| Service | SIGTERM Handler | httpServer.close() | pool.end() | Job Cleanup | Force Timeout |
|---------|----------------|-------------------|------------|-------------|---------------|
| auth-service | MISSING | MISSING | MISSING | N/A (no jobs) | MISSING |
| profile-service | EXISTS (schedulers only) | MISSING | MISSING | closeMatchingScheduler, closeSessionScheduler, closeSessionCleanupJob | MISSING |
| chat-service | EXISTS (full) | YES | MISSING | closeMessageCleanupJob | 10s timeout |

---

## MVP Recommendation

### Must Complete for Beta (Phase 1 -- all table stakes)

1. **Resilient DB pool wrapper** with retry on transient errors and exponential backoff
   - Create shared utility in `@vlvt/shared` or each service's utils
   - Wrap all `pool.query()` calls (or create `resilientQuery()` helper)
   - Handle error codes: ECONNRESET, ETIMEDOUT, ECONNREFUSED, "57P01" (admin shutdown), "57P03" (cannot connect)

2. **Graceful shutdown on all 3 services** with pool.end()
   - auth-service: Add SIGTERM/SIGINT handlers from scratch
   - profile-service: Add httpServer.close() and pool.end() to existing handlers
   - chat-service: Add pool.end() and io.close() to existing handler
   - All services: Add force-exit timeout (10s)
   - Railway: Set RAILWAY_DEPLOYMENT_DRAINING_SECONDS to 15

3. **Tooltips on all ~20 IconButtons** identified in audit
   - Mechanical: Add `tooltip: 'description'` property to each IconButton
   - Low risk, high impact for screen reader users

4. **VlvtPageRoute and VlvtFadeRoute** utility classes
   - VlvtPageRoute: Platform-adaptive slide (CupertinoPageTransitionsBuilder on iOS, ZoomPageTransitionsBuilder on Android)
   - VlvtFadeRoute: Fade transition for auth flows and modal-style screens
   - Replace 12+ MaterialPageRoute calls

5. **Pre-beta operations checklist** (documentation only)
   - Consolidate the 5 operational prerequisites from PROJECT.md

### Defer Post-Beta

- Circuit breaker pattern (backoff is sufficient for beta scale)
- Connection pool Sentry metrics (health endpoint metrics are enough)
- Query-level idempotency-aware retry (blanket retry for SELECTs, no retry for mutations is sufficient)
- Hero transitions and staggered list animations (polish, not blocking)
- Full WCAG AA audit (tooltips are the P2 item; deeper audit is v3+)
- Focus management in modals
- Live region announcements in chat

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| DB Pool Resilience | HIGH | pg Pool behavior verified via official node-postgres docs and GitHub issues. Retry/backoff patterns are well-established. Railway connection behavior confirmed via Railway docs. |
| Graceful Shutdown | HIGH | Express graceful shutdown is extensively documented. Railway SIGTERM behavior confirmed. Current codebase gaps clearly identified by grepping source. |
| Accessibility / Tooltips | HIGH | Flutter IconButton.tooltip behavior verified via Flutter API docs. Audit already identified exact files and line numbers. Mechanical fix. |
| Page Transitions | HIGH | Flutter PageRouteBuilder, CupertinoPageTransitionsBuilder, and PageTransitionsTheme verified via official Flutter docs. Pattern is standard. |
| Implementation Scope | HIGH | All files identified, all gaps mapped, no unknowns. This is operational hardening, not new feature development. |

---

## Sources

### Database Pool Resilience
- [node-postgres Pooling Documentation](https://node-postgres.com/features/pooling)
- [postgres-pool npm -- Resilient pool wrapper](https://www.npmjs.com/package/postgres-pool)
- [node-postgres Issue #1324 -- Auto-reconnection handling](https://github.com/brianc/node-postgres/issues/1324)
- [node-postgres Issue #2112 -- Connection terminated unexpectedly](https://github.com/brianc/node-postgres/issues/2112)
- [Node.js Connection Pooling Best Practices](https://oneuptime.com/blog/post/2026-01-06-nodejs-connection-pooling-postgresql-mysql/view)

### Graceful Shutdown
- [Express Health Checks and Graceful Shutdown](https://expressjs.com/en/advanced/healthcheck-graceful-shutdown.html)
- [Railway Deployment Teardown Docs](https://docs.railway.com/deployments/deployment-teardown)
- [How to Build a Graceful Shutdown Handler in Node.js](https://oneuptime.com/blog/post/2026-01-06-nodejs-graceful-shutdown-handler/view)
- [Graceful Shutdown in Node.js Express](https://dev.to/dzungnt98/graceful-shutdown-in-nodejs-express-1apl)

### Flutter Accessibility
- [Practical Accessibility in Flutter -- DCM](https://dcm.dev/blog/2025/06/30/accessibility-flutter-practical-tips-tools-code-youll-actually-use)
- [Flutter Accessibility -- Official Docs](https://docs.flutter.dev/ui/accessibility/assistive-technologies)
- [A Practical Guide to Flutter Accessibility -- Droids on Roids](https://www.thedroidsonroids.com/blog/flutter-accessibility-guide-part-1)

### Flutter Page Transitions
- [Flutter Page Route Animation Cookbook](https://docs.flutter.dev/cookbook/animation/page-route-animation)
- [PageTransitionsTheme API Reference](https://api.flutter.dev/flutter/material/PageTransitionsTheme-class.html)
- [CupertinoPageRoute API Reference](https://api.flutter.dev/flutter/cupertino/CupertinoPageRoute-class.html)
- [Page Transitions Using ThemeData in Flutter](https://medium.com/flutter-community/page-transitions-using-themedata-in-flutter-c24afadb0b5d)
