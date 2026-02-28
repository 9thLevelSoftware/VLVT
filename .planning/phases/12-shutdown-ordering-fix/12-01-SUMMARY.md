---
phase: 12-shutdown-ordering-fix
plan: 01
subsystem: infra
tags: [express, graceful-shutdown, railway, node-http, promise]

# Dependency graph
requires:
  - phase: 09-backend-service-integration
    provides: "gracefulShutdown handlers in auth-service and profile-service"
provides:
  - "Promise-wrapped server.close() in auth-service gracefulShutdown"
  - "Promise-wrapped server.close() in profile-service gracefulShutdown"
  - "Correct shutdown ordering: server.close (awaited) -> schedulers -> pool.end -> exit"
affects: [deployment, railway-redeploys]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Promise-wrapped server.close() for ordered shutdown"]

key-files:
  created: []
  modified:
    - backend/auth-service/src/index.ts
    - backend/profile-service/src/index.ts

key-decisions:
  - "Manual Promise wrapper over util.promisify for explicit error handling in server.close callback"
  - "Empty catch block after server.close Promise to ensure pool.end() runs even on server.close failure"

patterns-established:
  - "Promise-wrapped server.close: await new Promise<void>((resolve, reject) => server.close(err => ...)) for ordered shutdown"

requirements-completed: [RESIL-04, RESIL-05]

# Metrics
duration: 2min
completed: 2026-02-28
---

# Phase 12 Plan 01: Shutdown Ordering Fix Summary

**Promise-wrapped server.close() in auth-service and profile-service to drain in-flight HTTP requests before database pool teardown during Railway redeploys**

## Performance

- **Duration:** 2 min
- **Started:** 2026-02-28T02:38:30Z
- **Completed:** 2026-02-28T02:40:36Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Auth-service gracefulShutdown now awaits server.close() completion before calling pool.end()
- Profile-service gracefulShutdown now awaits server.close() completion before scheduler cleanup and pool.end()
- Both services handle server.close() errors gracefully (logged, does not prevent pool cleanup)
- Shutdown ordering verified: server.close -> schedulers (profile-service only) -> pool.end -> exit

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap server.close() in Promise in auth-service gracefulShutdown** - `b6d2ca0` (fix)
2. **Task 2: Wrap server.close() in Promise in profile-service gracefulShutdown** - `4d68b4f` (fix)

## Files Created/Modified
- `backend/auth-service/src/index.ts` - Promise-wrapped server.close() in gracefulShutdown function
- `backend/profile-service/src/index.ts` - Promise-wrapped server.close() in gracefulShutdown function

## Decisions Made
- Used manual Promise wrapper instead of util.promisify for clearer error handling in the server.close callback (err parameter explicitly checked, logged, and used for reject/resolve)
- Empty catch block after the Promise to ensure pool.end() always runs even if server.close() fails (e.g., server not listening)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Both auth-service and profile-service now properly drain in-flight HTTP requests before closing the database pool
- Railway redeploys should no longer cause 500 errors on in-flight requests
- Chat-service already uses io.close() which handles this correctly (verified in Phase 09)

## Self-Check: PASSED

All files exist, all commits verified.

---
*Phase: 12-shutdown-ordering-fix*
*Completed: 2026-02-28*
