---
phase: 09-backend-service-integration
plan: 01
subsystem: infra
tags: [graceful-shutdown, sigterm, sigint, railway, express, pg-pool]

# Dependency graph
requires:
  - phase: 08-shared-backend-utilities
    provides: createPool from @vlvt/shared used in auth-service
provides:
  - gracefulShutdown function in auth-service for clean SIGTERM/SIGINT handling
  - http.Server reference capture pattern for server.close()
  - Guard flag pattern to prevent double pool.end()
affects: [09-02 (same pattern for profile-service and chat-service)]

# Tech tracking
tech-stack:
  added: []
  patterns: [graceful-shutdown with guard flag, server.close then pool.end ordering, 10s force-exit timer with unref]

key-files:
  created: []
  modified: [backend/auth-service/src/index.ts]

key-decisions:
  - "Shutdown order: server.close() before pool.end() to prevent in-flight request failures"
  - "10s force-exit timeout with .unref() so timer does not keep process alive"
  - "Signal handlers inside NODE_ENV !== test block to avoid Jest interference"

patterns-established:
  - "Graceful shutdown: guard flag -> server.close -> pool.end -> process.exit(0) with 10s force-exit"
  - "Signal handler registration gated behind NODE_ENV !== test"

requirements-completed: [RESIL-04, RESIL-07]

# Metrics
duration: 2min
completed: 2026-02-27
---

# Phase 09 Plan 01: Auth-Service Graceful Shutdown Summary

**Graceful shutdown handler for auth-service with SIGTERM/SIGINT handling, connection draining, and 10s force-exit safety net**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-27T20:58:25Z
- **Completed:** 2026-02-27T21:00:27Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Auth-service now captures the http.Server reference from app.listen() (previously discarded)
- gracefulShutdown() function stops HTTP server, drains DB pool, and exits cleanly on SIGTERM/SIGINT
- Guard flag prevents double pool.end() crash on rapid signal delivery
- 10-second force-exit timer with .unref() prevents hung deployments on Railway
- All signal handlers gated behind NODE_ENV !== 'test' so Jest is unaffected

## Task Commits

Each task was committed atomically:

1. **Task 1: Add graceful shutdown handler to auth-service** - `ccf0252` (feat)
2. **Task 2: Verify auth-service tests pass with shutdown changes** - verification only, no code changes

**Plan metadata:** (pending final commit)

## Files Created/Modified
- `backend/auth-service/src/index.ts` - Added gracefulShutdown() function, server reference capture, SIGTERM/SIGINT handlers, guard flag, force-exit timer

## Decisions Made
- Shutdown order: server.close() first, then pool.end() -- prevents "Cannot use a pool after calling end" errors for in-flight requests
- 10s force-exit timeout uses .unref() so the timer alone does not keep the Node.js event loop alive
- Signal handlers registered inside the existing `if (process.env.NODE_ENV !== 'test')` block to avoid interfering with Jest test runners

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- 12 pre-existing test failures in `account-lockout.test.ts` (expected 403, got 500). These failures exist on the prior commit and are unrelated to the shutdown handler change. All other 199 tests pass. Logged as out-of-scope pre-existing issue.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth-service graceful shutdown pattern established, ready for replication to profile-service and chat-service (plan 09-02)
- Railway RAILWAY_DEPLOYMENT_DRAINING_SECONDS should be verified/set to at least 15s for proper drain behavior

## Self-Check: PASSED

- FOUND: backend/auth-service/src/index.ts
- FOUND: 09-01-SUMMARY.md
- FOUND: commit ccf0252

---
*Phase: 09-backend-service-integration*
*Completed: 2026-02-27*
