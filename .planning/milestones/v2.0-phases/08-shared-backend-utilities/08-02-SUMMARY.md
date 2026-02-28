---
phase: 08-shared-backend-utilities
plan: 02
subsystem: database
tags: [pg, pool, postgresql, resilience, shared-library, refactor]

# Dependency graph
requires:
  - "08-01: createPool factory function from @vlvt/shared"
provides:
  - "All three services using centralized createPool from @vlvt/shared"
  - "Zero inline pool configuration in service code"
  - "Consistent 5s connection timeout across all services"
affects: [09-service-integration]

# Tech tracking
tech-stack:
  added: []
  patterns: ["Service imports createPool from @vlvt/shared instead of inline new Pool()"]

key-files:
  created: []
  modified:
    - backend/auth-service/src/index.ts
    - backend/profile-service/src/index.ts
    - backend/chat-service/src/index.ts
    - backend/auth-service/tests/auth.test.ts
    - backend/auth-service/tests/google-oauth-audience.test.ts
    - backend/auth-service/tests/kycaid-encryption.test.ts
    - backend/auth-service/tests/kycaid-webhook.test.ts
    - backend/auth-service/tests/refresh-token-response.test.ts
    - backend/auth-service/tests/revenuecat-webhook.test.ts
    - backend/auth-service/tests/subscription.test.ts
    - backend/auth-service/tests/token-rotation.test.ts
    - backend/chat-service/tests/chat.test.ts
    - backend/profile-service/tests/profile.test.ts

key-decisions:
  - "Extracted mPool to module scope in tests so pg mock and createPool mock share same pool instance"
  - "Added createPool to all @vlvt/shared mocks (10 test files) rather than restructuring mock approach"

patterns-established:
  - "When mocking @vlvt/shared, always include createPool: jest.fn(() => mPool)"
  - "Define mPool at module scope before jest.mock() calls so all mocks reference same instance"

requirements-completed: [RESIL-01, RESIL-02, RESIL-03]

# Metrics
duration: 13min
completed: 2026-02-27
---

# Phase 8 Plan 02: Service Pool Integration Summary

**Replaced 162 lines of duplicated inline pool config across 3 services with single-line createPool({ logger }) calls from @vlvt/shared**

## Performance

- **Duration:** 13 min
- **Started:** 2026-02-27T20:24:14Z
- **Completed:** 2026-02-27T20:37:35Z
- **Tasks:** 2
- **Files modified:** 13

## Accomplishments
- Removed ~54 lines of inline pool config per service (162 total lines removed, 15 added)
- All three services now use `createPool({ logger })` from `@vlvt/shared`
- Updated 10 test files to mock `createPool` in their `@vlvt/shared` mock blocks
- All previously-passing tests continue to pass (shared: 341, auth: 199, profile: 113, chat: 139)
- TypeScript compilation verified for all three services

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace inline pool config in all three services** - `511331e` (refactor)
2. **Task 2: Update test mocks and verify no regressions** - `e408e3b` (test)

## Files Created/Modified
- `backend/auth-service/src/index.ts` - Replaced inline Pool with `createPool({ logger })`
- `backend/profile-service/src/index.ts` - Replaced inline Pool with `createPool({ logger })`
- `backend/chat-service/src/index.ts` - Replaced inline Pool with `createPool({ logger })`
- `backend/auth-service/tests/*.test.ts` (8 files) - Added createPool to @vlvt/shared mocks, extracted mPool to module scope
- `backend/chat-service/tests/chat.test.ts` - Added createPool to @vlvt/shared mock, extracted mPool to module scope
- `backend/profile-service/tests/profile.test.ts` - Added createPool to @vlvt/shared mock, extracted mPool to module scope

## Decisions Made
- Extracted `mPool` to module scope (before `jest.mock()` calls) so both the `pg` mock and the `@vlvt/shared` mock return the same pool instance. This preserves the test pattern where `mockPool = new Pool()` configures query responses.
- Added `createPool` mock to all 10 test files that mock `@vlvt/shared`, rather than restructuring test architecture.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added createPool to @vlvt/shared test mocks**
- **Found during:** Task 2 (running test suites)
- **Issue:** All test files that mock `@vlvt/shared` (10 files) did not include `createPool`, causing `TypeError: createPool is not a function` when loading service index.ts
- **Fix:** Added `createPool: jest.fn(() => mPool)` to every `@vlvt/shared` mock. Extracted `mPool` to module scope so both the `pg` mock constructor and `createPool` return the same mock pool instance.
- **Files modified:** 10 test files across auth-service, profile-service, chat-service
- **Verification:** All previously-passing tests continue to pass. No new failures introduced.
- **Committed in:** `e408e3b` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Essential fix -- without it, all service tests that import index.ts would fail. No scope creep.

## Issues Encountered

Pre-existing test failures observed (NOT caused by our changes):
- `auth-service/tests/account-lockout.test.ts`: 12 failures (500 Internal Server Error on lockout endpoints)
- `profile-service/tests/search-filters.test.ts`: 10 failures (500 Internal Server Error on search endpoints)

These failures exist on the current main branch before this plan and are unrelated to pool migration.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Pool centralization is complete across all services
- Phase 8 (shared backend utilities) objectives are fully met
- Phase 9 (service integration) can proceed -- services use shared pool factory
- Pre-existing test failures in account-lockout and search-filters should be investigated separately

## Self-Check: PASSED

- [x] backend/auth-service/src/index.ts contains createPool (not new Pool)
- [x] backend/profile-service/src/index.ts contains createPool (not new Pool)
- [x] backend/chat-service/src/index.ts contains createPool (not new Pool)
- [x] No inline pool config (new Pool, connectionTimeoutMillis, pool.on) in any service src/
- [x] Commit 511331e exists (refactor: replace inline pool config)
- [x] Commit e408e3b exists (test: update @vlvt/shared mocks)
- [x] All service TypeScript compilations pass
- [x] shared: 341/341 tests pass
- [x] auth-service: 199/212 pass (12 pre-existing failures in account-lockout)
- [x] profile-service: 113/123 pass (10 pre-existing failures in search-filters)
- [x] chat-service: 139/142 pass (3 skipped)

---
*Phase: 08-shared-backend-utilities*
*Completed: 2026-02-27*
