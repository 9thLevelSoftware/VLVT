---
phase: 04-real-time-chat
plan: 03
subsystem: chat-backend
tags: [bullmq, redis, pubsub, cleanup, notifications, safety]
dependency_graph:
  requires: [04-01]
  provides: [message-cleanup, session-expiry-notifications]
  affects: [04-04, frontend]
tech_stack:
  added: [bullmq]
  patterns: [scheduled-jobs, redis-pubsub-events]
key_files:
  created:
    - backend/chat-service/src/jobs/message-cleanup-job.ts
  modified:
    - backend/chat-service/src/index.ts
    - backend/chat-service/package.json
    - backend/profile-service/src/services/session-scheduler.ts
    - backend/profile-service/src/routes/after-hours.ts
    - backend/chat-service/src/socket/after-hours-handler.ts
decisions:
  - id: "04-03-001"
    decision: "BullMQ for message cleanup scheduling"
    rationale: "Consistent with existing session-scheduler and matching-scheduler patterns"
  - id: "04-03-002"
    decision: "30-day retention for safety/moderation"
    rationale: "Messages retained server-side even if UI shows them as deleted"
  - id: "04-03-003"
    decision: "2-minute warning before session expiry"
    rationale: "Gives users time to save match before session ends"
  - id: "04-03-004"
    decision: "Non-blocking cleanup job initialization"
    rationale: "Server continues if Redis unavailable, can clean up manually later"
metrics:
  duration: "~5 minutes"
  completed: "2026-01-23"
---

# Phase 04 Plan 03: Message Retention & Session Expiry Notifications Summary

30-day message cleanup job with BullMQ scheduling plus session expiry warning notifications via Redis pub/sub

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create message cleanup job | 207742e | message-cleanup-job.ts, index.ts, package.json |
| 2 | Add session expiry notification handling | bcbc863 | session-scheduler.ts, after-hours.ts, after-hours-handler.ts |

## Artifacts Created

### 1. Message Cleanup Job (`backend/chat-service/src/jobs/message-cleanup-job.ts`)

BullMQ scheduled job that:
- Runs daily at 3 AM UTC
- Deletes After Hours messages older than 30 days
- Only deletes if match was NOT saved (converted_to_match_id IS NULL)
- Cleans up associated after_hours_matches records
- Non-blocking initialization (server continues if Redis unavailable)

Key configuration:
```typescript
const CLEANUP_QUEUE_NAME = 'after-hours-message-cleanup';
const RETENTION_DAYS = 30;
// Cron: 0 3 * * * (3 AM UTC daily)
```

### 2. Session Expiry Notifications

Events published via Redis pub/sub to `after_hours:events` channel:

| Event | Timing | Payload |
|-------|--------|---------|
| `after_hours:session_expiring` | 2 minutes before expiry | `{ sessionId, expiresAt, minutesRemaining: 2 }` |
| `after_hours:session_expired` | At expiry | `{ sessionId, reason: 'timeout' }` |

Flow:
1. Session starts -> `scheduleSessionExpiryWarning()` schedules warning job
2. 2 min before expiry -> Worker fires, publishes `session_expiring` event
3. At expiry -> Worker fires, publishes `session_expired` event
4. chat-service Redis subscriber relays events to Socket.IO clients

### 3. Integration Points

**Chat Service (`index.ts`):**
- Initializes cleanup job on startup (fire-and-forget)
- Graceful shutdown handlers close cleanup job
- Added `bullmq` package dependency

**Profile Service (`session-scheduler.ts`):**
- Added Redis publisher for session events
- New job type: `session-expiring-warning`
- Functions: `scheduleSessionExpiryWarning()`, `cancelSessionExpiryWarning()`
- Publishes to same channel as matching-scheduler (`after_hours:events`)

**Chat Service (`after-hours-handler.ts`):**
- Added `session_expiring` and `session_expired` to RELAY_EVENT_TYPES
- Events automatically relayed to connected users via existing subscriber

## Technical Details

### Cleanup Query
```sql
DELETE FROM after_hours_messages
WHERE match_id IN (
  SELECT id FROM after_hours_matches
  WHERE expires_at < NOW() - INTERVAL '30 days'
    AND converted_to_match_id IS NULL
)
```

### Warning Scheduling
- Warning scheduled if session > 2 minutes duration
- If session too short (< 10 seconds until warning), warning skipped
- Warning and expiry jobs cancelled when session ends early

## Verification Results

- TypeScript compiles in both chat-service and profile-service
- Cron pattern `0 3 * * *` verified in message-cleanup-job.ts
- RETENTION_DAYS = 30 verified
- `after_hours:session_expiring` pattern found in session-scheduler.ts
- Events relayed by after-hours-handler.ts

## Success Criteria Met

- [x] Messages retained for 30 days after match expires (safety requirement)
- [x] Messages + matches deleted only after 30 days AND if not saved
- [x] Users receive `after_hours:session_expiring` 2 minutes before expiry
- [x] Users receive `after_hours:session_expired` when session ends
- [x] Cleanup job runs daily at 3 AM UTC

## Deviations from Plan

None - plan executed exactly as written.

## Dependencies Installed

- `bullmq@^5.66.7` added to chat-service (matching profile-service version)

## Next Phase Readiness

Plan 04-04 can proceed:
- Session expiry events now available for frontend to display warnings
- Message retention ensures safety compliance
- All backend infrastructure for real-time chat complete
