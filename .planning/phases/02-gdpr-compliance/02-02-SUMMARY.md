---
phase: 02-gdpr-compliance
plan: 02
subsystem: api
tags: [gdpr, r2, cloudflare, axios, account-deletion, photo-cleanup]

# Dependency graph
requires:
  - phase: 01-security-hardening
    provides: secure authentication, rate limiting, audit logging
provides:
  - R2 photo cleanup during account deletion
  - Internal service-to-service endpoint pattern
  - GDPR Article 17 (Right to Erasure) compliance for photos
affects:
  - 02-03 through 02-06 (remaining GDPR plans)
  - future photo management features

# Tech tracking
tech-stack:
  added: [axios]
  patterns: [internal-service-auth, graceful-degradation]

key-files:
  created: []
  modified:
    - backend/auth-service/src/index.ts
    - backend/auth-service/package.json
    - backend/profile-service/src/index.ts

key-decisions:
  - "R2 photo deletion before database transaction (can't recover keys after CASCADE)"
  - "Photo deletion failures logged but don't block account deletion (Right to Erasure takes priority)"
  - "X-Internal-Service header for service-to-service authentication (simple shared secret)"

patterns-established:
  - "Internal endpoint pattern: /api/internal/* with X-Internal-Service header validation"
  - "Graceful degradation: External service failures logged but don't block critical operations"

# Metrics
duration: 8min
completed: 2026-01-24
---

# Phase 2 Plan 2: R2 Photo Deletion in Account Deletion Summary

**R2 photo cleanup integrated into account deletion via internal service call, ensuring GDPR Article 17 (Right to Erasure) compliance for stored photos**

## Performance

- **Duration:** 8 min
- **Started:** 2026-01-24T18:30:00Z
- **Completed:** 2026-01-24T18:38:00Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Account deletion now fetches photo keys from profiles table BEFORE CASCADE deletion
- Added internal `/api/internal/cleanup-photos` endpoint in profile-service
- Photo deletion errors are logged but don't block account deletion (user's Right to Erasure takes priority)
- Both services compile and build successfully

## Task Commits

Each task was committed atomically:

1. **Task 1: Add HTTP client dependency to auth-service** - `776d659` (chore)
2. **Task 2: Integrate R2 photo cleanup into account deletion** - `413756a` (feat)
3. **Task 3: Create internal photo cleanup endpoint in profile-service** - `76ae75f` (feat)

## Files Created/Modified

- `backend/auth-service/package.json` - Added axios dependency for internal HTTP calls
- `backend/auth-service/src/index.ts` - Integrated R2 photo cleanup in DELETE /auth/account
- `backend/profile-service/src/index.ts` - Added internal photo cleanup endpoint

## Decisions Made

1. **Photo deletion before database transaction**: Photo keys are fetched and R2 cleanup is attempted BEFORE the database BEGIN. This is necessary because CASCADE deletion of the user would destroy the profile record containing photo keys.

2. **Graceful degradation on photo deletion failure**: If R2 deletion fails (network error, timeout, service unavailable), the account deletion proceeds anyway. The user's Right to Erasure for their account data is more important than perfect photo cleanup. Failures are logged for manual review.

3. **X-Internal-Service header authentication**: Simple header-based authentication for service-to-service calls. While not cryptographically secure, it provides:
   - Protection against accidental external access
   - Audit trail via logging of unauthorized attempts
   - Sufficient for Railway internal network (services communicate via private network)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed as specified.

## User Setup Required

**Environment variable (optional):**
- `PROFILE_SERVICE_URL` - Profile service URL for auth-service to call (defaults to `http://localhost:3002`)
- In Railway production, this should be set to the profile-service internal URL

## Next Phase Readiness

- R2 photo cleanup complete - GDPR-04 gap closed
- Ready for 02-03 (consent management) and remaining GDPR plans
- Internal service communication pattern established for future cross-service operations

---
*Phase: 02-gdpr-compliance*
*Completed: 2026-01-24*
