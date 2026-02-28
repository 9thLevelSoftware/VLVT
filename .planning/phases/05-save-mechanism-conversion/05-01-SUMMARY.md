---
phase: 05-save-mechanism-conversion
plan: 01
subsystem: api, database
tags: [postgresql, socket.io, fcm, transactions, atomic-operations]

# Dependency graph
requires:
  - phase: 04-real-time-chat
    provides: After Hours message handlers and Socket.IO infrastructure
  - phase: 01-foundation-safety
    provides: after_hours_matches and after_hours_messages tables
provides:
  - POST /after-hours/matches/:matchId/save endpoint
  - Atomic save vote recording with FOR UPDATE locking
  - Match conversion from ephemeral to permanent
  - Message copy from after_hours_messages to messages
  - Real-time save notifications via Socket.IO
  - Push notifications for partner save and mutual save
affects: [05-02, 05-03, frontend-save-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - SELECT...FOR UPDATE for race condition prevention
    - Atomic transaction for vote + conversion
    - Fire-and-forget FCM notifications

key-files:
  created:
    - backend/migrations/024_add_matches_source_column.sql
    - backend/chat-service/src/services/match-conversion-service.ts
  modified:
    - backend/chat-service/src/routes/after-hours-chat.ts
    - backend/chat-service/src/socket/after-hours-handler.ts
    - backend/chat-service/src/services/fcm-service.ts

key-decisions:
  - "Batch message copy with generated IDs preserves chronological order"
  - "Router accepts optional Socket.IO instance for notification emission"
  - "Idempotent save votes: re-saving returns success without duplicate notifications"

patterns-established:
  - "SELECT...FOR UPDATE pattern for atomic multi-user voting operations"
  - "Fire-and-forget FCM pattern for non-blocking push notifications"

requirements-completed: []

# Metrics
duration: 5min
completed: 2026-01-22
---

# Phase 5 Plan 1: Backend Save Vote Endpoint Summary

**Atomic save vote endpoint with FOR UPDATE locking, message copy on mutual save, and real-time/push notifications**

## Performance

- **Duration:** 5 min
- **Started:** 2026-01-23T04:22:48Z
- **Completed:** 2026-01-23T04:27:25Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- Database migration adds source column to track match origin (swipe vs after_hours)
- Match conversion service with atomic save vote and conversion logic
- POST /after-hours/matches/:matchId/save endpoint with full notification stack
- Real-time Socket.IO events: after_hours:partner_saved, after_hours:match_saved
- FCM push notifications for users not in app when partner saves

## Task Commits

Each task was committed atomically:

1. **Task 1: Database Migration for Match Source** - `6d4d76d` (feat)
2. **Task 2: Match Conversion Service** - `93c9717` (feat)
3. **Task 3: Save Endpoint with Notifications** - `00b9bf8` (feat)

## Files Created/Modified

- `backend/migrations/024_add_matches_source_column.sql` - Adds source column to matches table
- `backend/chat-service/src/services/match-conversion-service.ts` - Atomic save vote and conversion logic
- `backend/chat-service/src/routes/after-hours-chat.ts` - POST save endpoint with notification orchestration
- `backend/chat-service/src/socket/after-hours-handler.ts` - emitPartnerSaved/emitMatchSaved helpers
- `backend/chat-service/src/services/fcm-service.ts` - After Hours FCM notification functions

## Decisions Made

- **Batch message copy with new IDs:** Rather than INSERT...SELECT, we generate new message IDs for each copied message to maintain ID format consistency (msg_uuid)
- **Router factory accepts optional io parameter:** Allows save endpoint to emit Socket.IO events without circular dependencies
- **Idempotent save operations:** Re-saving returns success with existing state without sending duplicate notifications
- **Names from profiles table:** Query profiles table for partner names in FCM notifications (not After Hours profiles)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all TypeScript compiled successfully on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Save endpoint ready for frontend integration
- Ready for Plan 02 (Flutter save UI and service)
- Ready for Plan 03 (cleanup scheduling for unsaved matches)

---
*Phase: 05-save-mechanism-conversion*
*Completed: 2026-01-22*
