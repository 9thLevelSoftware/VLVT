# GSD State

**Project:** After Hours Mode
**Milestone:** v1.0
**Current Phase:** 5 - Save Mechanism & Conversion
**Status:** In progress

## Position

- Phase: 05 of 07 (Save Mechanism & Conversion)
- Wave: 1
- Plans: 05-01 (complete)
- Last activity: 2026-01-22 - Completed 05-01-PLAN.md

## Progress

```
Phase 1: [##########] 3/3 plans complete
Phase 2: [##########] 3/3 plans complete
Phase 3: [##########] 4/4 plans complete
Phase 4: [##########] 4/4 plans complete
Phase 5: [###-------] 1/3 plans complete
Overall:  [########--] 15/17 plans complete
```

## Accumulated Decisions

- Model profile: quality (opus for executors, sonnet for verifier)
- Commit planning docs: true
- All workflow agents enabled (research, plan_check, verifier)
- [01-01] VARCHAR(255) for user_id FKs matching existing users.id type
- [01-01] ON DELETE CASCADE on all user FKs for GDPR right-to-erasure
- [01-01] Separate exact/fuzzed coordinates stored at session creation
- [01-02] 500m default fuzz radius balances privacy vs utility
- [01-02] sqrt-based random distance prevents clustering near center
- [01-02] 3 decimal places (~111m) provides sufficient precision masking
- [01-03] Three sequential database queries for clarity over single JOIN
- [01-03] Fail-closed error handling: 500 response, never call next() on DB error
- [01-03] Error codes: PREMIUM_REQUIRED, VERIFICATION_REQUIRED, CONSENT_REQUIRED, AUTH_ERROR
- [02-01] Empty string for photo_url on creation satisfies NOT NULL constraint
- [02-01] Two-step profile creation: create profile, then upload photo separately
- [02-01] After Hours photos use R2 prefix: after-hours-photos/{userId}/{photoId}
- [02-01] Name/age inherited from main profile via JOIN (not duplicated)
- [02-02] Smart defaults from main profile on preferences creation
- [02-02] All preference fields optional on creation - defaults applied server-side
- [02-02] COALESCE preserves existing values during partial updates
- [02-02] Age range validation: minAge must be <= maxAge when both provided
- [02-03] Non-blocking Redis init - server continues if Redis unavailable
- [02-03] Fire-and-forget job scheduling - session persists regardless of job success
- [02-03] Transaction for session start - atomic profile check + insert
- [02-03] SQL-based remaining time calculation avoids client/server time drift
- [03-01] LEAST/GREATEST wrapper for acos to prevent domain errors from float precision
- [03-01] Delete decline records at threshold rather than reset counter
- [03-01] Double-check for existing matches inside transaction
- [03-02] Redis pub/sub for match events (NOT Socket.IO in profile-service)
- [03-02] Separate Redis client for pub/sub publishing (BullMQ uses its own connection)
- [03-02] 15-second delay on session start matching (gives user time to see UI)
- [03-02] 5-minute auto-decline timer included in match payloads
- [03-02] Non-blocking scheduler init (server continues if Redis unavailable)
- [03-03] parseFloat on all numeric DB values for type safety
- [03-03] Math.max(0, count - 1) ensures non-negative nearby count after excluding self
- [03-03] 30-second cooldown after decline before next match attempt
- [03-04] 5-minute auto-decline timer default, configurable via delayMs parameter
- [03-04] jobId format `auto-decline:{matchId}` enables reliable job cancellation
- [03-04] Fire-and-forget cancellation pattern - errors logged but don't block response
- [03-04] 5-second delay before re-matching after auto-decline (faster than manual 30s)
- [04-01] Non-blocking Redis subscriber init - server continues if Redis unavailable
- [04-01] ioredis for Redis pub/sub (compatibility with profile-service BullMQ)
- [04-01] Same rate limits for After Hours events as regular chat
- [04-01] Ephemeral typing/read receipts (no DB storage for After Hours)
- [04-01] Room naming: after_hours:match:{matchId} for multi-device support
- [04-02] Return messages even if match expired - allows history viewing
- [04-02] Cursor pagination with 'before' timestamp parameter
- [04-02] 50 message limit per request for performance
- [04-02] MATCH_EXPIRED error code for expired/declined matches
- [04-03] BullMQ for message cleanup scheduling (consistent with existing patterns)
- [04-03] 30-day message retention for safety/moderation compliance
- [04-03] 2-minute warning before session expiry notification
- [04-03] Non-blocking cleanup job initialization
- [04-04] 8 separate stream controllers for After Hours events (consistent with existing patterns)
- [04-04] 3-attempt retry with 1s, 2s, 4s exponential backoff for message sending
- [04-04] Separate HTTP service for message history vs socket for real-time
- [05-01] Batch message copy with generated IDs preserves chronological order
- [05-01] Router accepts optional Socket.IO instance for notification emission
- [05-01] Idempotent save votes: re-saving returns success without duplicate notifications

## Current Context

**Phase 5 IN PROGRESS - Save Mechanism & Conversion**

Plan 05-01 complete (Backend Save Vote Endpoint):
- Migration 024: source column on matches table for tracking origin (swipe vs after_hours)
- match-conversion-service.ts with recordSaveVote() using SELECT...FOR UPDATE
- Atomic transaction: vote recording + conversion to permanent match
- POST /after-hours/matches/:matchId/save endpoint
- Socket.IO events: after_hours:partner_saved, after_hours:match_saved
- FCM notifications: sendAfterHoursPartnerSavedNotification, sendAfterHoursMutualSaveNotification
- Messages copied from after_hours_messages to messages table on mutual save

Key files:
- `backend/migrations/024_add_matches_source_column.sql` (source column)
- `backend/chat-service/src/services/match-conversion-service.ts` (atomic conversion)
- `backend/chat-service/src/routes/after-hours-chat.ts` (save endpoint)
- `backend/chat-service/src/socket/after-hours-handler.ts` (emit helpers)
- `backend/chat-service/src/services/fcm-service.ts` (After Hours notifications)

Next: Plan 05-02 (Flutter Save UI) or Plan 05-03 (Cleanup Scheduling)

## Session Continuity

- Last session: 2026-01-22
- Stopped at: Completed 05-01-PLAN.md
- Resume file: None
