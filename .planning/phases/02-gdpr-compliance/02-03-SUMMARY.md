---
phase: 02-gdpr-compliance
plan: 03
subsystem: auth, database
tags: [gdpr, consent, postgresql, express, jwt]

# Dependency graph
requires:
  - phase: 02-01
    provides: Privacy policy and data retention documentation
provides:
  - user_consents table for granular consent tracking
  - Consent management API endpoints (GET, POST, DELETE)
  - Consent version tracking for policy change detection
  - Audit trail with IP address and user agent
affects: [02-04, 02-05, 02-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Granular consent per purpose (not bundled acceptance)"
    - "Consent withdrawal without account deletion"
    - "Policy version tracking with renewal flag"
    - "Audit trail for consent actions"

key-files:
  created:
    - backend/migrations/026_add_user_consents.sql
  modified:
    - backend/auth-service/src/index.ts

key-decisions:
  - "Consent purposes: location_discovery, marketing, analytics, after_hours"
  - "Consent withdrawal keeps audit trail (sets withdrawn_at, doesn't delete)"
  - "needsRenewal flag indicates policy version mismatch"
  - "Migrates existing after_hours_consent data to new table"

patterns-established:
  - "update_updated_at_column() trigger function for auto-updating timestamps"
  - "Consent API pattern: GET list, POST grant, DELETE withdraw"

# Metrics
duration: 8min
completed: 2026-01-24
---

# Phase 02 Plan 03: Consent Management Infrastructure Summary

**Granular GDPR consent tracking with user_consents table and authenticated API endpoints for grant/withdraw operations**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-24T15:00:00Z
- **Completed:** 2026-01-24T15:08:00Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Created user_consents table with granular consent per purpose (GDPR-02, GDPR-05)
- Added consent_purpose enum with 4 purposes: location_discovery, marketing, analytics, after_hours
- Implemented consent management API endpoints with JWT authentication
- Added consent version tracking to detect when users need to re-consent after policy changes
- Migrated existing after_hours_consent data from users table to new consent tracking

## Task Commits

Each task was committed atomically:

1. **Task 1: Create user_consents migration** - `1e39064` (feat)
2. **Task 2: Add consent management API endpoints** - `45648ef` (feat)

## Files Created/Modified

- `backend/migrations/026_add_user_consents.sql` - Granular consent tracking table with audit fields
- `backend/auth-service/src/index.ts` - Consent management API endpoints (GET, POST, DELETE)

## Decisions Made

1. **Consent purposes as enum:** Using PostgreSQL enum ensures data integrity and prevents invalid consent types
2. **Audit trail preservation:** Withdrawal sets withdrawn_at timestamp rather than deleting record - preserves consent history for GDPR audit requirements
3. **Version tracking:** CURRENT_CONSENT_VERSION constant (2026-01-24) tracks policy version; API returns needsRenewal flag when mismatch detected
4. **Data migration:** Existing after_hours_consent data migrated to new table to preserve consent history

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Consent infrastructure ready for frontend integration (02-04)
- Data export API can reference consent status (02-05)
- After Hours mode can check consent via new table (already migrated existing consents)

---
*Phase: 02-gdpr-compliance*
*Completed: 2026-01-24*
