# Phase 13: Pre-Existing Test Fixes - Research

**Researched:** 2026-02-27
**Domain:** Jest test mock isolation / Node.js backend testing
**Confidence:** HIGH

## Summary

Phase 13 was created to fix 22 pre-existing test failures (12 in auth-service `account-lockout.test.ts` and 10 in profile-service `search-filters.test.ts`) that were identified during the v2.0 milestone audit. Both test suites were returning 500 errors because they lacked mocks for `@vlvt/shared` exports that were introduced in Phase 8 (shared backend utilities) and Phase 11 (audit logging, CSRF middleware, version middleware).

**The work is already done.** Commit `09c7028` ("test: enhance isolation of account lockout and search filters tests with shared mocks", 2026-02-27) fixed both test files by adding comprehensive `jest.mock('@vlvt/shared', ...)` blocks and additional dependency mocks. This commit was applied **before** the v2.0 audit created the Phase 13 roadmap entry, meaning the audit catalogued an already-resolved issue.

**Primary recommendation:** Verify the fix is still green, update ROADMAP.md to mark Phase 13 as complete, and skip planning -- no implementation work remains.

## Current State of Tests

### Auth-Service (all green)
| Metric | Value |
|--------|-------|
| Test suites | 15 passed, 0 failed |
| Tests | 211 passed, 1 skipped (npm audit CI-only), 0 failed |
| account-lockout.test.ts | 13/13 passed |
| Time | ~7s |

### Profile-Service (all green)
| Metric | Value |
|--------|-------|
| Test suites | 10 passed, 0 failed |
| Tests | 123 passed, 0 failed |
| search-filters.test.ts | 12/12 passed |
| Time | ~6s |

### Chat-Service (all green, not in scope but verified)
| Metric | Value |
|--------|-------|
| Test suites | 5 passed, 0 failed |
| Tests | 139 passed, 3 skipped (pending), 0 failed |
| Time | ~3s |

**Total backend: 30 suites, 473 passing, 4 skipped, 0 failures.**

## Root Cause Analysis (Historical)

### What Broke the Tests Originally

The test files were written before `@vlvt/shared` was created (Phase 8). When Phase 8 introduced `createPool()` and subsequent phases added CSRF middleware, audit logging, version middleware, and error response helpers to `@vlvt/shared`, the test files' `jest.mock('pg', ...)` was no longer sufficient. The app entry point (`src/index.ts`) now imported real `@vlvt/shared` modules that tried to initialize with real database connections, causing 500 errors.

### How Commit 09c7028 Fixed It

1. **account-lockout.test.ts**: Added `jest.mock('@vlvt/shared', ...)` providing mock implementations for `createPool`, `createCsrfMiddleware`, `createCsrfTokenHandler`, `correlationMiddleware`, `createRequestLoggerMiddleware`, `createAuditLogger`, `AuditAction`, `AuditResourceType`, `addVersionToHealth`, `createVersionMiddleware`, `API_VERSIONS`, `CURRENT_API_VERSION`, `ErrorCodes`, `sendErrorResponse`, and `createErrorResponseSender`. Also moved `mPool` to module scope so both `pg` and `@vlvt/shared` mocks share the same instance.

2. **search-filters.test.ts**: Added `jest.mock('@vlvt/shared', ...)` with `createPool`, CSRF, correlation, request logger, version, internal service auth, and After Hours auth middleware mocks. Also added mocks for rate-limiter, fcm-service, session-scheduler, matching-scheduler, session-cleanup-job, image-handler, and r2-client -- isolating the test from all background infrastructure.

### Pattern: The Shared Mock Problem

When a shared library evolves (adding new exports consumed at app startup), test files that import the app must mock the shared library completely. The fix pattern is:

```typescript
// 1. Create shared mock pool at module scope
const mPool = { query: jest.fn(), on: jest.fn() };

// 2. Mock pg to return the shared pool
jest.mock('pg', () => ({ Pool: jest.fn(() => mPool) }));

// 3. Mock @vlvt/shared to also return the shared pool AND mock all middleware
jest.mock('@vlvt/shared', () => ({
  createPool: jest.fn(() => mPool),
  createCsrfMiddleware: jest.fn(() => (req, res, next) => next()),
  // ... all other exports the app uses at startup
}));
```

## Architecture Patterns

### Test File Organization in This Project

```
backend/{service}/tests/
  auth.test.ts              # Main auth flow tests
  account-lockout.test.ts   # Feature-specific isolation test
  search-filters.test.ts    # Feature-specific isolation test
  ...
```

Each test file independently mocks all dependencies. There is no shared test setup (no `jest.setup.ts`, no `testSetup` in jest.config). This means every test file must maintain its own complete mock set.

### Anti-Patterns to Avoid

- **Partial @vlvt/shared mocking:** If you mock some exports but not all, the unmocked ones try to run real code (database connections, file I/O). Always mock the complete set of exports used by the app entry point.
- **Separate mock pool instances:** If `pg.Pool` and `@vlvt/shared.createPool` return different mock objects, query assertions won't match. Share one `mPool` instance.

## Success Criteria Verification

| Criterion | Status | Evidence |
|-----------|--------|----------|
| All 12 tests in account-lockout.test.ts pass | **ALREADY MET** (13 tests, not 12 -- audit miscounted) | `npx jest tests/account-lockout.test.ts` -> 13 passed |
| All 10 tests in search-filters.test.ts pass | **ALREADY MET** (12 tests, not 10 -- audit miscounted) | `npx jest tests/search-filters.test.ts` -> 12 passed |
| No new test regressions | **ALREADY MET** | Full suites: 473 passing, 0 failures |

**Note on test counts:** The v2.0 audit listed "12 failing" for account-lockout and "10 failing" for search-filters. The actual counts are 13 and 12 respectively. The audit may have counted at a different commit, or the fix commit also adjusted test cases.

## Common Pitfalls

### Pitfall 1: Assuming Phase 13 Requires Implementation
**What goes wrong:** Creating a plan with implementation tasks when the work is already done.
**Why it happens:** The roadmap entry was created by the audit workflow, which didn't detect that commit `09c7028` had already fixed the issue.
**How to avoid:** Run the tests before planning. If all pass, mark the phase as complete.

### Pitfall 2: Worker Exit Warning
**What goes wrong:** Auth-service full suite shows "A worker process has failed to exit gracefully" warning.
**Why it happens:** The 10-second force-exit timer (`setTimeout` with `.unref()`) in the shutdown handler can interfere with Jest's worker lifecycle.
**How to avoid:** This is pre-existing and benign. The `NODE_ENV !== 'test'` guard on signal handlers (from Phase 9) prevents the shutdown code from running in tests, but the timer setup at module scope can still trigger. Not a Phase 13 concern.

## Don't Hand-Roll

Not applicable -- no implementation work needed.

## Standard Stack

Not applicable -- this is a verification/documentation phase, not an implementation phase.

## Code Examples

Not applicable -- the fix code is already in the codebase at the relevant test files.

## State of the Art

Not applicable.

## Open Questions

1. **Should Phase 13 be marked complete without a plan?**
   - What we know: All success criteria are already met. The fix predates the roadmap entry.
   - What's unclear: Whether the GSD workflow requires a formal plan even for already-completed work.
   - Recommendation: Create a minimal verification-only plan that runs the tests and confirms the fix, then mark complete. Or skip planning entirely and go straight to verification.

2. **Should the ROADMAP.md phase description be updated?**
   - What we know: ROADMAP says "Fix 22 failing tests" but they're already fixed.
   - What's unclear: Whether to update now or leave for Phase 14 (Documentation Cleanup).
   - Recommendation: Leave for Phase 14, which explicitly covers ROADMAP.md updates.

## Sources

### Primary (HIGH confidence)
- Direct test execution: `npx jest --no-coverage` in all three backend services (2026-02-27)
- Git history: `git log --oneline -- backend/auth-service/tests/account-lockout.test.ts`
- Git diff: `git diff 09c7028^..09c7028` showing exact fix applied
- v2.0 Milestone Audit: `.planning/v2.0-MILESTONE-AUDIT.md`
- ROADMAP: `.planning/ROADMAP.md`

### Secondary
- None needed -- all findings are from direct codebase evidence.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - no stack decisions needed (already fixed)
- Architecture: HIGH - test patterns verified by reading both files
- Pitfalls: HIGH - only pitfall is assuming work is needed when it isn't

**Research date:** 2026-02-27
**Valid until:** Indefinite (the tests are green and the fix is committed)
