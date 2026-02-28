---
phase: 03-matching-engine
plan: 04
subsystem: api
tags: [bullmq, redis, matching, auto-decline, timers]

# Dependency graph
requires:
  - phase: 03-02
    provides: matching-scheduler.ts, publishMatchToBothUsers function
  - phase: 03-03
    provides: POST /match/decline endpoint
provides:
  - Auto-decline job scheduling after 5 minutes
  - scheduleAutoDecline export function
  - cancelAutoDecline export function
  - Match expiry handling with user notifications
affects: [phase-04-chat-integration]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - BullMQ delayed jobs for match auto-decline
    - Fire-and-forget job cancellation on manual action

key-files:
  created: []
  modified:
    - backend/profile-service/src/services/matching-scheduler.ts
    - backend/profile-service/src/routes/after-hours.ts

key-decisions:
  - "5-minute auto-decline timer default, configurable via delayMs parameter"
  - "jobId format `auto-decline:{matchId}` enables reliable job lookup for cancellation"
  - "Fire-and-forget cancellation pattern - errors logged but don't block response"
  - "5-second delay before re-matching after auto-decline (vs 30s for manual decline)"

patterns-established:
  - "Auto-decline job uses BullMQ delayed jobs with unique jobId"
  - "Manual actions cancel corresponding scheduled jobs"

requirements-completed: []

# Metrics
duration: 8min
completed: 2026-01-22
---

# Phase 3 Plan 4: Auto-Decline Timer Summary

**BullMQ-based auto-decline timer fires 5 minutes after match creation, notifies both users via Redis pub/sub, and triggers immediate re-matching**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-22T03:00:00Z
- **Completed:** 2026-01-22T03:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Auto-decline job scheduled when match created (5-minute default delay)
- handleAutoDeclineMatch marks match as declined_by='system', notifies both users
- scheduleAutoDecline and cancelAutoDecline exported for external use
- Manual decline endpoint cancels scheduled auto-decline job
- Both users re-enter matching pool with 5-second delay after auto-decline

## Task Commits

Each task was committed atomically:

1. **Task 1: Add auto-decline job scheduling** - `a972eee` (feat)
2. **Task 2: Cancel auto-decline on manual decline** - `58ca688` (feat)

## Files Created/Modified

- `backend/profile-service/src/services/matching-scheduler.ts` - Added auto-decline-match job type, handleAutoDeclineMatch function, scheduleAutoDecline/cancelAutoDecline exports, schedule call in publishMatchToBothUsers
- `backend/profile-service/src/routes/after-hours.ts` - Import cancelAutoDecline, call on manual decline

## Decisions Made

- **5-minute default timer:** Configurable via delayMs parameter, balances giving users time vs keeping matches flowing
- **jobId pattern:** `auto-decline:{matchId}` enables reliable lookup and cancellation
- **Fire-and-forget cancellation:** Errors logged but don't block user response
- **5-second re-matching delay:** Faster than 30s manual decline cooldown since auto-decline isn't user choice

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Matching engine complete with all scheduled jobs (periodic, session expiry, auto-decline)
- Ready for Phase 4: Chat Integration
- chat-service needs to subscribe to `after_hours:events` Redis pub/sub channel
- Auto-decline fires `after_hours:match_expired` event that chat-service should handle

---
*Phase: 03-matching-engine*
*Completed: 2026-01-22*
