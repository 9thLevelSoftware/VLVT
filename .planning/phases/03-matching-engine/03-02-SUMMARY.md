---
phase: 03-matching-engine
plan: 02
subsystem: api
tags: [bullmq, redis, pubsub, matching, scheduler, ioredis]

# Dependency graph
requires:
  - phase: 03-matching-engine/03-01
    provides: matching-engine.ts with findMatchCandidate, createAfterHoursMatch, getActiveUserCountNearby
provides:
  - BullMQ periodic matching scheduler (30-second cycle)
  - Event-driven matching trigger (session start, decline)
  - Redis pub/sub match event publishing to 'after_hours:events' channel
affects: [04-real-time, chat-service integration]

# Tech tracking
tech-stack:
  added: []
  patterns: [redis-pubsub-for-cross-service-events, bullmq-job-scheduler-pattern, non-blocking-init-pattern]

key-files:
  created:
    - backend/profile-service/src/services/matching-scheduler.ts
  modified:
    - backend/profile-service/src/index.ts
    - backend/profile-service/src/routes/after-hours.ts

key-decisions:
  - "Redis pub/sub for match events (NOT Socket.IO in profile-service)"
  - "Separate Redis client for pub/sub publishing (BullMQ uses its own connection)"
  - "15-second delay on session start matching (gives user time to see UI)"
  - "5-minute auto-decline timer included in match payloads"
  - "Non-blocking scheduler init (server continues if Redis unavailable)"

patterns-established:
  - "Redis pub/sub event channel: after_hours:events"
  - "Event payload format: {type, targetUserId, payload, timestamp}"
  - "Job naming: match:user:{userId}:{timestamp} for deduplication"

requirements-completed: []

# Metrics
duration: 15min
completed: 2026-01-22
---

# Phase 3 Plan 2: Match Scheduling Summary

**BullMQ scheduler with periodic 30-second matching cycle and event-driven triggers, publishing match events to Redis pub/sub for chat-service delivery**

## Performance

- **Duration:** 15 min
- **Started:** 2026-01-22T (execution start)
- **Completed:** 2026-01-22T (execution end)
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- BullMQ scheduler runs matching cycle every 30 seconds for all active sessions without matches
- Session start triggers matching after 15-second delay via event-driven job
- Match events published to Redis `after_hours:events` channel for chat-service consumption
- Graceful startup/shutdown integrated into profile-service

## Task Commits

Each task was committed atomically:

1. **Task 1: Create matching-scheduler.ts with BullMQ periodic and event-driven matching** - `4733a8e` (feat)
2. **Task 2: Integrate matching scheduler into server startup** - `6f542a5` (feat)

## Files Created/Modified
- `backend/profile-service/src/services/matching-scheduler.ts` - BullMQ scheduler with periodic job, event triggers, and Redis pub/sub publishing
- `backend/profile-service/src/index.ts` - Import and initialize matching scheduler, add shutdown handler
- `backend/profile-service/src/routes/after-hours.ts` - Trigger matching on session start with 15s delay

## Decisions Made
- **Redis pub/sub instead of Socket.IO:** profile-service doesn't have Socket.IO. Match events are published to Redis channel `after_hours:events`, and chat-service (which has Socket.IO) will subscribe and deliver to clients in Phase 4.
- **Separate Redis client for pub/sub:** BullMQ uses its own connection pool, so a dedicated ioredis client is created for publish operations.
- **15-second delay on session start:** Gives user time to see the session UI before matching starts.
- **5-minute auto-decline timer:** Included in match payloads so clients know when match auto-declines.
- **Non-blocking init:** Scheduler initialization is fire-and-forget with error logging; server continues if Redis unavailable.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation followed existing session-scheduler.ts patterns.

## User Setup Required

None - no external service configuration required. Uses existing REDIS_URL environment variable.

## Next Phase Readiness
- Matching scheduler operational with periodic and event-driven triggers
- Match events ready for chat-service subscription in Phase 4
- Ready for 03-03 (decline/accept endpoints) which will use triggerMatchingForUser for 30s cooldown on decline

---
*Phase: 03-matching-engine*
*Completed: 2026-01-22*
