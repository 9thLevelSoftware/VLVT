---
phase: 01-foundation-safety
plan: 01
subsystem: database
tags: [postgresql, migration, gdpr, after-hours, schema]

# Dependency graph
requires: []
provides:
  - After Hours database schema (6 tables)
  - GDPR consent tracking columns
  - Session management with location privacy
  - Ephemeral match and message storage
affects: [01-foundation-safety, 02-session-matching, 03-ephemeral-chat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Partial unique index for single active session constraint"
    - "Dual coordinate storage: exact (private) + fuzzed (display)"
    - "Session-scoped data with CASCADE delete for auto-cleanup"
    - "GDPR consent as explicit boolean + timestamp"

key-files:
  created:
    - backend/migrations/021_add_after_hours_tables.sql
  modified: []

key-decisions:
  - "VARCHAR(255) for user_id FKs matching existing users.id type"
  - "UUID for new table PKs (gen_random_uuid) matching recent migration patterns"
  - "ON DELETE CASCADE on all user FKs for GDPR right-to-erasure compliance"
  - "Separate exact and fuzzed coordinates stored at session creation (not computed on read)"
  - "converted_to_match_id FK without CASCADE to preserve conversion audit trail"

patterns-established:
  - "after_hours_* table naming convention"
  - "idx_tablename_column index naming convention"
  - "COMMENT ON TABLE/COLUMN for documentation"

# Metrics
duration: 2min
completed: 2026-01-22
---

# Phase 1 Plan 1: After Hours Database Migration Summary

**PostgreSQL migration with 6 After Hours tables, GDPR consent columns, location privacy patterns, and comprehensive indexing for session management and proximity queries**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-22T23:14:39Z
- **Completed:** 2026-01-22T23:16:35Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Created complete After Hours schema with 6 tables (profiles, preferences, sessions, declines, matches, messages)
- Added GDPR-compliant consent tracking (explicit boolean + timestamp)
- Implemented location privacy pattern: store both exact (private) and fuzzed (display) coordinates
- Partial unique index enforces one active session per user
- Comprehensive indexing for session expiry cleanup and proximity queries
- All foreign keys cascade on user deletion for GDPR compliance

## Task Commits

Each task was committed atomically:

1. **Task 1: Create After Hours database migration** - `67ee90e` (feat)
2. **Task 2: Validate migration against existing schema** - No changes needed (validation passed)

## Files Created/Modified

- `backend/migrations/021_add_after_hours_tables.sql` - Complete After Hours schema: 6 tables, 2 users columns, 11 indexes, comprehensive comments

## Decisions Made

1. **VARCHAR(255) for user_id foreign keys** - Matches existing `users.id` type from `001_create_users_and_profiles.sql`
2. **UUID PKs with gen_random_uuid()** - Follows recent migration patterns (token_rotation, kycaid)
3. **Separate exact/fuzzed coordinates** - Stored at session creation, not computed on read, enables both privacy (fuzzed) and administrative access (exact)
4. **converted_to_match_id without CASCADE** - Preserves audit trail of ephemeral-to-permanent conversions even if permanent match is deleted
5. **Session-scoped declines with CASCADE** - Auto-cleanup when session deleted (no orphan data)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required. Migration runs via existing `npm run migrate` in backend/migrations.

## Next Phase Readiness

**Ready for dependent phases:**
- Schema foundation complete for profile-service API endpoints
- Session table ready for session management logic
- GDPR consent columns ready for consent flow implementation
- Indexes in place for proximity matching queries

**No blockers.**

---
*Phase: 01-foundation-safety*
*Plan: 01*
*Completed: 2026-01-22*
