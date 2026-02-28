---
phase: 03-testing-infrastructure
plan: 08
subsystem: testing
tags: [jest, jwt, middleware, auth, testing]

# Dependency graph
requires:
  - phase: 01-security-hardening
    provides: authenticateJWT middleware implementation
provides:
  - Fixed middleware test imports using correct export name
  - All 8 middleware tests passing
  - Fixed TokenExpiredError catch order bug
affects: [auth-service testing, jwt validation, test reliability]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Top-level import for middleware (no jest.resetModules for pure functions)"
    - "TokenExpiredError checked before JsonWebTokenError (inheritance order)"

key-files:
  created: []
  modified:
    - backend/auth-service/tests/middleware.test.ts
    - backend/auth-service/src/middleware/auth.ts

key-decisions:
  - "Top-level import for middleware tests (pure function, no state to reset)"
  - "Fixed TokenExpiredError catch order in auth.ts (extends JsonWebTokenError)"

patterns-established:
  - "Test pure functions with top-level imports, not require() in beforeEach"
  - "Check specific error types before parent error types in catch blocks"

requirements-completed: [TEST-01]

# Metrics
duration: 2min
completed: 2026-01-25
---

# Phase 03 Plan 08: Auth Middleware Test Fix Summary

**Fixed auth middleware test imports and TokenExpiredError catch order bug - all 8 tests now pass**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-25T03:41:18Z
- **Completed:** 2026-01-25T03:43:27Z
- **Tasks:** 2 (combined into 1 commit)
- **Files modified:** 2

## Accomplishments
- Fixed middleware.test.ts import to use correct `authenticateJWT` export name
- Removed `jest.resetModules()` which broke the import chain
- Fixed TokenExpiredError catch order bug in auth.ts
- Aligned all test error message expectations with actual middleware responses

## Task Commits

Both tasks were combined into a single atomic commit:

1. **Task 1 & 2: Fix middleware import and align error messages** - `a35f0d4` (fix)

## Files Created/Modified
- `backend/auth-service/tests/middleware.test.ts` - Fixed import and error expectations
- `backend/auth-service/src/middleware/auth.ts` - Fixed TokenExpiredError catch order

## Decisions Made
- **Top-level import for pure functions:** The authenticateJWT middleware is stateless and doesn't need module resets between tests. Import at top level for cleaner tests.
- **TokenExpiredError must be checked first:** Since TokenExpiredError extends JsonWebTokenError, it must be caught before the parent type or expired tokens incorrectly return "Invalid token".

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TokenExpiredError catch order in auth.ts**
- **Found during:** Task 2 (error message alignment)
- **Issue:** auth.ts checked `jwt.JsonWebTokenError` before `jwt.TokenExpiredError`, but TokenExpiredError extends JsonWebTokenError. Expired tokens were returning "Invalid token" instead of "Token expired".
- **Fix:** Swapped catch order to check TokenExpiredError first
- **Files modified:** backend/auth-service/src/middleware/auth.ts
- **Verification:** All 8 middleware tests pass, expired token test correctly expects "Token expired"
- **Committed in:** a35f0d4

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Bug fix was essential for correct error differentiation. The test would have failed if we only aligned expectations with buggy behavior.

## Issues Encountered
None - straightforward fix once root cause identified.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Auth middleware tests now stable (8/8 passing)
- Ready for remaining gap closure plans (03-09 through 03-12)

---
*Phase: 03-testing-infrastructure*
*Completed: 2026-01-25*
