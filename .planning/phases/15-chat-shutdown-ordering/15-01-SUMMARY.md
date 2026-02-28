---
phase: 15-chat-shutdown-ordering
plan: 01
subsystem: infra
tags: [socket.io, graceful-shutdown, promise, railway, chat-service]

# Dependency graph
requires:
  - phase: 09-backend-service-integration
    provides: "chat-service gracefulShutdown handler with io.close()"
  - phase: 12-shutdown-promise-wrappers
    provides: "Promise wrapper pattern for server.close() in auth/profile services"
provides:
  - "Promise-wrapped io.close() in chat-service gracefulShutdown"
  - "Consistent shutdown pattern across all three backend services"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Promise-wrapped io.close() with callback for full HTTP server drain"

key-files:
  created: []
  modified:
    - "backend/chat-service/src/index.ts"

key-decisions:
  - "Manual Promise wrapper over io.close() callback (not await io.close()) because the returned Promise resolves before HTTP server finishes draining"
  - "Empty catch block after Promise to ensure pool.end() runs even on io.close failure"

patterns-established:
  - "All three backend services now use await new Promise wrapper for server/io close in graceful shutdown"

requirements-completed: [RESIL-06]

# Metrics
duration: 1min
completed: 2026-02-28
---

# Phase 15 Plan 01: Chat Shutdown Ordering Summary

**Promise-wrapped io.close() in chat-service graceful shutdown to drain Socket.IO + HTTP connections before closing database pool**

## Performance

- **Duration:** 1 min
- **Started:** 2026-02-28T15:09:46Z
- **Completed:** 2026-02-28T15:10:40Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Wrapped io.close() in `await new Promise<void>()` so Socket.IO disconnections and in-flight HTTP requests complete before pool.end()
- Error from io.close callback is caught, logged, and does not prevent database pool cleanup
- All three backend services (auth, profile, chat) now consistently use the same Promise-wrapped close pattern
- Prevents 500 errors on in-flight REST requests during Railway redeploys

## Task Commits

Each task was committed atomically:

1. **Task 1: Wrap io.close() in Promise in chat-service gracefulShutdown** - `5be90fa` (fix)

## Files Created/Modified
- `backend/chat-service/src/index.ts` - Promise-wrapped io.close() in gracefulShutdown function

## Decisions Made
- Used manual Promise wrapper with callback instead of `await io.close()` because Socket.IO 4.8.1's returned Promise resolves before the underlying HTTP server finishes draining; the callback is forwarded to httpServer.close() and fires when it truly closes
- Empty catch block after the Promise wrapper ensures pool.end() always runs for cleanup, even if io.close() fails (error already logged inside the Promise)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three backend services now have consistent graceful shutdown with Promise-wrapped server/io close
- Chat-service shutdown order verified: guard -> timer -> cleanup job -> Redis subscriber -> io.close (awaited) -> pool.end -> exit
- Ready for Phase 16 or any remaining gap closure work

## Self-Check: PASSED

- FOUND: backend/chat-service/src/index.ts
- FOUND: .planning/phases/15-chat-shutdown-ordering/15-01-SUMMARY.md
- FOUND: commit 5be90fa

---
*Phase: 15-chat-shutdown-ordering*
*Completed: 2026-02-28*
