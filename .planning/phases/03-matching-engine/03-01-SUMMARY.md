---
phase: 03-matching-engine
plan: 01
subsystem: matching
tags: [postgresql, haversine, concurrency, skip-locked]
metrics:
  duration: ~10min
  tasks: 2/2
  completed: 2026-01-22
dependency_graph:
  requires: [01-01, 02-03]
  provides: [matching-query, decline-tracking, match-creation]
  affects: [03-02, 03-03]
tech_stack:
  added: []
  patterns: [haversine-distance, skip-locked-concurrency, upsert-counters]
key_files:
  created:
    - backend/migrations/023_add_matching_engine_columns.sql
    - backend/profile-service/src/services/matching-engine.ts
  modified: []
decisions:
  - id: 03-01-01
    decision: "LEAST/GREATEST wrapper for acos to prevent domain errors"
    rationale: "Floating point precision can cause acos argument to exceed [-1,1] range"
  - id: 03-01-02
    decision: "Delete decline records at threshold rather than reset counter"
    rationale: "Simpler logic - absence of record means users can match again"
  - id: 03-01-03
    decision: "Double-check for existing matches inside transaction"
    rationale: "Prevents race condition between findMatchCandidate and createAfterHoursMatch"
---

# Phase 3 Plan 1: Core Matching Engine Summary

**One-liner:** Haversine proximity matching with SKIP LOCKED concurrency and 3-decline memory exclusions

## What Was Built

### Task 1: Schema Migrations (023)

Created `backend/migrations/023_add_matching_engine_columns.sql` with:

1. **after_hours_declines enhancements:**
   - `decline_count INTEGER DEFAULT 1` - tracks total declines per user pair
   - `first_declined_at TIMESTAMP` - analytics timestamp
   - `last_session_id UUID` - most recent decline session
   - Changed unique constraint from `(session_id, user_id, declined_user_id)` to `(user_id, declined_user_id)` for cross-session tracking

2. **after_hours_matches enhancements:**
   - `declined_by VARCHAR(255)` - FK to users, who declined (NULL = active)
   - `declined_at TIMESTAMP` - when declined

3. **Indexes:**
   - `idx_after_hours_declines_lookup` for efficient decline checks
   - `idx_after_hours_matches_active` partial index for non-declined matches
   - `idx_after_hours_matches_user_lookup` for per-user lookups

All changes are idempotent using `DO $$` blocks and `IF NOT EXISTS`.

### Task 2: Matching Engine Service

Created `backend/profile-service/src/services/matching-engine.ts` with:

1. **findMatchCandidate(pool, userId, sessionId, userLocation, userGender, preferences)**
   - CTE-based query joining sessions + profiles + after_hours_profiles + preferences
   - Haversine formula: `6371 * acos(LEAST(1.0, GREATEST(-1.0, cos*cos*cos + sin*sin)))`
   - Exclusion filters:
     - Distance <= maxDistanceKm
     - Mutual gender preferences (supports 'Any')
     - Age within requested range
     - Not blocked (bidirectional)
     - Not already matched this session (non-declined only)
     - Not declined with count < 3 (bidirectional)
     - Session expires > NOW() + 2 minutes
   - Returns single closest candidate

2. **createAfterHoursMatch(pool, user1Id, session1Id, user2Id, session2Id)**
   - Transaction with `SELECT FOR UPDATE SKIP LOCKED`
   - Returns null if can't lock both sessions (race condition)
   - Double-checks for existing active matches
   - Calculates expiry: MIN(session1.expires, session2.expires, NOW + 10min)
   - Atomic INSERT with proper column aliasing

3. **getActiveUserCountNearby(pool, userLocation, maxDistanceKm)**
   - Simple COUNT with Haversine filter
   - For social proof: "12 people nearby in After Hours"

4. **recordDecline(pool, userId, sessionId, declinedUserId)**
   - UPSERT pattern: INSERT ON CONFLICT DO UPDATE
   - Increments decline_count on conflict

5. **resetDeclineCounters(pool)**
   - DELETEs records at threshold (>= 3)
   - Allows user pairs to match again

## Decisions Made

| ID | Decision | Rationale |
|----|----------|-----------|
| 03-01-01 | LEAST/GREATEST wrapper for acos | Floating point can exceed [-1,1] causing NaN |
| 03-01-02 | Delete records at threshold | Simpler than resetting counter to 0 |
| 03-01-03 | Double-check matches in transaction | Race condition between find and create |

## Commits

| Hash | Type | Description |
|------|------|-------------|
| 6bc3ac2 | feat | Add matching engine schema migrations |
| dbbbf36 | feat | Add matching engine service with core query logic |

## Deviations from Plan

**None** - plan executed exactly as written.

## Next Phase Readiness

**Ready for 03-02:** Match Delivery & Socket Integration

Prerequisites met:
- `findMatchCandidate` returns candidate for matching jobs
- `createAfterHoursMatch` handles atomic creation
- `recordDecline` tracks declines with memory
- Schema supports declined_by/declined_at on matches

Open for 03-02:
- Socket.IO integration for real-time match delivery
- BullMQ job scheduler for periodic matching
- FCM push notification fallback

## Test Strategy (for future)

```typescript
// Unit tests needed:
describe('findMatchCandidate', () => {
  it('returns closest candidate within distance')
  it('excludes blocked users bidirectionally')
  it('excludes users with <3 declines')
  it('includes users with >=3 declines (reset)')
  it('excludes already-matched users')
  it('respects mutual gender preferences')
  it('respects age range preferences')
  it('excludes sessions expiring in <2 min')
})

describe('createAfterHoursMatch', () => {
  it('creates match atomically')
  it('returns null when sessions locked by other process')
  it('returns null when user has existing active match')
  it('calculates correct expiry time')
})
```
