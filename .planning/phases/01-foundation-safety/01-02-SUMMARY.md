---
phase: 01-foundation-safety
plan: 02
subsystem: api
tags: [location, privacy, geolocation, fuzzing, typescript]

# Dependency graph
requires:
  - phase: none
    provides: standalone utility
provides:
  - Location fuzzing utility for After Hours Mode
  - FuzzedCoordinates interface for type safety
  - Privacy-preserving coordinate transformation
affects: [02-core-mechanics, session-endpoints, location-sharing]

# Tech tracking
tech-stack:
  added: []
  patterns: [sqrt-based uniform circle distribution, geographic coordinate clamping]

key-files:
  created:
    - backend/profile-service/src/utils/location-fuzzer.ts
    - backend/profile-service/tests/utils/location-fuzzer.test.ts
  modified: []

key-decisions:
  - "500m default fuzz radius balances privacy vs utility"
  - "3 decimal places (~111m) provides sufficient precision masking"
  - "sqrt-based random distance prevents clustering near center"

patterns-established:
  - "Location privacy: always fuzz coordinates before sharing"
  - "Coordinate validation: reject out-of-range inputs early"

# Metrics
duration: 4min
completed: 2026-01-22
---

# Phase 01 Plan 02: Location Fuzzing Utility Summary

**Server-side location fuzzer with sqrt-based uniform distribution, 500m default radius, and 3-decimal precision for trilateration attack prevention**

## Performance

- **Duration:** 4 min
- **Started:** 2026-01-22T23:14:11Z
- **Completed:** 2026-01-22T23:18:30Z
- **Tasks:** 2
- **Files created:** 2

## Accomplishments
- Created `fuzzLocationForAfterHours()` utility with configurable fuzz radius
- Implemented sqrt-based random distance for uniform distribution within circle
- Added comprehensive input validation for coordinate ranges
- Handle edge cases: poles, antimeridian, boundary values
- 14 unit tests covering all functionality and edge cases

## Task Commits

Each task was committed atomically:

1. **Task 1: Create location fuzzing utility** - `57243c8` (feat)
2. **Task 2: Add unit tests for location fuzzer** - `67ee90e` (test)

## Files Created/Modified
- `backend/profile-service/src/utils/location-fuzzer.ts` - Location fuzzing utility with FuzzedCoordinates interface
- `backend/profile-service/tests/utils/location-fuzzer.test.ts` - 14 comprehensive unit tests

## Decisions Made
- **500m default radius:** Balances privacy protection with location utility for proximity features
- **sqrt-based distance:** Ensures uniform distribution within fuzz circle (without sqrt, points cluster near center)
- **3 decimal places:** Provides ~111m precision, combined with 500m jitter gives ~611m maximum offset
- **Re-export geo-redact:** Maintains backward compatibility by re-exporting `redactCoordinates`

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- **Jest config conflict:** Project has both `jest.config.js` and `jest` key in `package.json`. Resolved by using explicit `--config jest.config.js` flag. This is a pre-existing project issue, not introduced by this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Location fuzzer ready for integration with After Hours session endpoints (Phase 2)
- FuzzedCoordinates interface can be imported by session creation logic
- Tests provide regression protection for privacy-critical functionality

---
*Phase: 01-foundation-safety*
*Completed: 2026-01-22*
