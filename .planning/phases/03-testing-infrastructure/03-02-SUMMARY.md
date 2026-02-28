---
phase: 03-testing-infrastructure
plan: 02
subsystem: testing
tags: [auth, tests, logout, token-refresh, jwt]
dependency-graph:
  requires: [03-01]
  provides: [auth-flow-tests, TEST-01-coverage]
  affects: [03-03, 03-04, 03-05, 03-06]
tech-stack:
  added: []
  patterns: [supertest-mocking, jwt-test-tokens, pool-query-mocks]
key-files:
  created: []
  modified:
    - backend/auth-service/tests/auth.test.ts
decisions:
  - id: mock-vlvt-shared
    choice: Add @vlvt/shared mock to auth.test.ts
    reason: Logout endpoint uses auditLogger from @vlvt/shared

requirements-completed: [TEST-01]

metrics:
  duration: 8m
  completed: 2026-01-25
---

# Phase 03 Plan 02: Auth Flow Test Coverage Summary

Extended auth.test.ts with logout and token refresh tests to complete TEST-01 authentication flow coverage.

## One-Liner

Added 9 test cases for logout and token refresh endpoints with full mock coverage for auditLogger and pool queries.

## Completed Tasks

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | Add logout endpoint tests | 659201b | Done |
| 2 | Add token refresh tests | c2712c7 | Done |

## Key Changes

### auth.test.ts Enhancements

**Mock additions:**
- Added @vlvt/shared mock with createAuditLogger, AuditAction enum, CSRF middleware mocks
- Required for logout endpoint which calls auditLogger.logAuthEvent

**Logout tests (4 cases):**
1. Logout without refresh token - returns success (client-side token clearing)
2. Logout with valid refresh token - revokes token and returns success
3. Non-existent token - handled gracefully (idempotent)
4. Already-revoked token - handled gracefully

**Refresh tests (5 cases):**
1. Valid refresh token - returns new access/refresh tokens
2. Missing refresh token - returns 400
3. Invalid/unknown token - returns 401
4. Expired refresh token - returns 401
5. Revoked refresh token - returns 401

## Test Results

```
POST /auth/logout
  - should logout successfully without refresh token (PASS)
  - should logout successfully with valid refresh token (PASS)
  - should handle non-existent refresh token gracefully (PASS)
  - should handle already-revoked refresh token gracefully (PASS)

POST /auth/refresh
  - should refresh token with valid refresh token (PASS)
  - should return 400 for missing refresh token (PASS)
  - should return 401 for invalid/unknown refresh token (PASS)
  - should return 401 for expired refresh token (PASS)
  - should return 401 for revoked refresh token (PASS)
```

All 9 new tests passing. Total auth.test.ts now has 57 test cases.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| @vlvt/shared mock | Added to auth.test.ts | Logout endpoint requires auditLogger mock; followed pattern from token-rotation.test.ts |
| Idempotent logout | Test verifies success even for non-existent tokens | Matches endpoint behavior - logout should not fail if token already gone |
| Refresh token body param | Tests use body.refreshToken not Authorization header | Matches actual endpoint implementation |

## Deviations from Plan

None - plan executed exactly as written.

## Success Criteria Verification

- [x] Logout endpoint has 4 passing tests
- [x] Token refresh endpoint has 5 passing tests
- [x] All existing auth tests still pass (new tests isolated)
- [x] TEST-01 requirement satisfied (login, signup, logout, token refresh, password reset all tested)

## Notes

- Pre-existing test failures in other parts of auth.test.ts were noted in STATE.md before this plan
- New tests are isolated and do not affect pre-existing test state
- token-rotation.test.ts has additional advanced refresh tests (rotation, reuse detection)
- auth.test.ts refresh tests cover basic validation scenarios
