---
phase: 02-profile-session-management
plan: 01
subsystem: api
tags: [express, multer, sharp, r2, postgresql, after-hours]

# Dependency graph
requires:
  - phase: 01-foundation-safety
    provides: createAfterHoursAuthMiddleware, after_hours_profiles table, location fuzzing
provides:
  - After Hours profile CRUD endpoints (POST/GET/PATCH /profile)
  - After Hours photo upload endpoint (POST /profile/photo)
  - Validation middleware for After Hours profile data
affects: [02-02-session-activation, 02-03-discovery]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Factory router pattern (createAfterHoursRouter with DI)
    - Two-step profile creation (create profile, then upload photo separately)
    - R2 photo key prefix organization (after-hours-photos/{userId}/{photoId})

key-files:
  created:
    - backend/profile-service/src/routes/after-hours.ts
    - backend/profile-service/src/middleware/after-hours-validation.ts
  modified:
    - backend/profile-service/src/index.ts
    - backend/shared/src/index.ts

key-decisions:
  - "Empty string for photo_url on creation satisfies NOT NULL constraint"
  - "Photo uploaded separately via POST /profile/photo (two-step flow)"
  - "After Hours photos use dedicated R2 prefix: after-hours-photos/"
  - "Name and age inherited from main profile via JOIN (not duplicated)"

patterns-established:
  - "Factory router pattern with pool and upload injection"
  - "After Hours photo processing: 1200x1200 max, JPEG, EXIF stripped"

# Metrics
duration: 50min
completed: 2026-01-23
---

# Phase 02 Plan 01: After Hours Profile CRUD Summary

**After Hours profile endpoints with photo upload via R2, protected by premium+verified+consent middleware**

## Performance

- **Duration:** 50 min
- **Started:** 2026-01-22T23:30:00Z
- **Completed:** 2026-01-23T01:20:33Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Created After Hours profile CRUD endpoints (POST/GET/PATCH /profile)
- Implemented single photo upload to R2 with processing (resize, EXIF strip)
- Applied triple-gate authorization (premium + verified + consent) to all routes
- Exported createAfterHoursAuthMiddleware from @vlvt/shared (was missing)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create After Hours validation middleware** - `019c6b7` (feat)
2. **Task 2: Create After Hours router with CRUD and photo upload** - `e6b7069` (feat)
3. **Task 3: Mount After Hours router in main app** - `251c003` (feat)

## Files Created/Modified

- `backend/profile-service/src/middleware/after-hours-validation.ts` - Validation chains for profile create/update
- `backend/profile-service/src/routes/after-hours.ts` - Router with POST/GET/PATCH /profile and POST /profile/photo
- `backend/profile-service/src/index.ts` - Import and mount After Hours router
- `backend/shared/src/index.ts` - Export createAfterHoursAuthMiddleware (blocking fix)

## Decisions Made

1. **Empty string for photo_url on creation** - Database schema has `photo_url TEXT NOT NULL`. Using empty string satisfies constraint while allowing two-step profile creation flow (create profile, then upload photo separately).

2. **Two-step profile creation** - Profile created first with optional description, photo uploaded separately via dedicated endpoint. This matches common mobile app UX patterns where users can save partial progress.

3. **Dedicated R2 prefix for After Hours photos** - Using `after-hours-photos/{userId}/{photoId}.jpg` keeps After Hours photos organized separately from main profile photos (`photos/{userId}/{photoId}.jpg`).

4. **Name/age inheritance via JOIN** - After Hours profile doesn't duplicate name/age; GET endpoint JOINs with main profiles table. This ensures consistency and reduces data duplication.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Export createAfterHoursAuthMiddleware from @vlvt/shared**
- **Found during:** Task 2 (router creation)
- **Issue:** The `createAfterHoursAuthMiddleware` was defined in `shared/src/middleware/after-hours-auth.ts` and exported via `shared/src/middleware/index.ts`, but NOT exported from the main `shared/src/index.ts` package entry point
- **Fix:** Added export statement to `backend/shared/src/index.ts`
- **Files modified:** backend/shared/src/index.ts
- **Verification:** Rebuilt shared package (`npm run build`), TypeScript compilation passed
- **Committed in:** e6b7069 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix to make the After Hours auth middleware importable. No scope creep.

## Issues Encountered

- **Pre-existing test failures:** The `profile.test.ts` test suite has 12 failing tests unrelated to After Hours changes. These failures are due to API versioning changes and test mocking issues that existed before this plan's execution. The After Hours utility tests (`location-fuzzer.test.ts`) from Phase 1 pass correctly.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

Ready for next plans in Phase 2:
- **02-02 (Session Activation):** Can use the profile endpoints to verify users have After Hours profiles before session creation
- **02-03 (Discovery):** Profile data is available for display in discovery feed

No blockers or concerns.

---
*Phase: 02-profile-session-management*
*Completed: 2026-01-23*
