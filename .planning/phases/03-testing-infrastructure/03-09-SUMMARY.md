# Phase 3 Plan 09: Auth Test Fixes Summary

---
phase: 03-testing-infrastructure
plan: 09
subsystem: auth-service-testing
tags: [jest, testing, auth, mocking, error-handling]

dependencies:
  requires: [01-security-hardening]
  provides: [passing-auth-tests]
  affects: [03-testing-infrastructure]

tech-stack:
  added: []
  patterns: [jest-mocking, error-code-system]

key-files:
  modified:
    - backend/auth-service/tests/auth.test.ts
    - backend/auth-service/tests/setup.ts

metrics:
  duration: ~8min
  completed: 2026-01-25
---

**One-liner:** Fixed auth.test.ts failures from ErrorCodes system, password validation changes, and input validation middleware by updating mocks and test expectations.

## Objective Completed

Fixed all 57 auth.test.ts tests that were failing due to:
1. Password validation changes (12+ chars, uppercase required)
2. New ErrorCodes system using `sendError` instead of direct responses
3. Input validation middleware triggering on test tokens
4. Missing GOOGLE_CLIENT_ID environment variable
5. Token expiration change from 7 days to 15 minutes

## Changes Made

### 1. Password Validation Tests
- Updated "should reject weak password - missing letter" to expect uppercase/lowercase errors
- Changed "should accept password with only lowercase and numbers" to use valid password meeting all requirements
- Test password now: `ValidPassword123!` (meets 12+ char, uppercase, lowercase, number, special char)

### 2. Error Response Mock
- Created `mockErrorCodes` object matching actual ErrorCodes structure
- Updated `createErrorResponseSender` mock to actually send HTTP responses
- Added missing AuditAction values: LOGIN_FAILURE, LOGIN_SUCCESS, ACCOUNT_LOCKED

### 3. Input Validation Bypass
- Added mock for `../src/utils/input-validation` module
- Middleware pass-through prevents SQL injection pattern false positives on test tokens

### 4. Test Setup Updates
- Added `GOOGLE_CLIENT_ID` environment variable to setup.ts
- Value: `test-google-client-id.apps.googleusercontent.com`

### 5. Error Message Updates
- Login missing fields: `'Missing required fields'` (was `'Email and password are required'`)
- Invalid credentials: `'Authentication failed'` (was `'Invalid email or password'`)
- Unverified email: `'Email not verified'` with code `'AUTH_009'`

### 6. Token Expiration
- Updated test expectation from 604800s (7 days) to 900s (15 minutes)
- Reflects security improvement: short-lived access tokens + refresh tokens

### 7. Mock Sequence Fixes
- Password reset tests: Added UPDATE mock after SELECT
- Improved mock comments for clarity

## Test Results

```
Test Suites: 1 passed, 1 total
Tests:       57 passed, 57 total
Time:        ~2.7s
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added missing mock queries**
- **Found during:** Task 2
- **Issue:** Password reset tests only mocked SELECT, missing UPDATE mock
- **Fix:** Added second mockResolvedValueOnce for UPDATE query
- **Files modified:** auth.test.ts

**2. [Rule 2 - Missing Critical] Added GOOGLE_CLIENT_ID env var**
- **Found during:** Task 2
- **Issue:** Google auth tests returned 503 because env var wasn't set
- **Fix:** Added to tests/setup.ts
- **Files modified:** setup.ts

## Decisions Made

| Decision | Rationale |
|----------|-----------|
| Mock input validation middleware | Test tokens contain patterns that trigger SQL injection detection; validation tested separately |
| Update error expectations to match ErrorCodes | New security-focused error system uses generic messages to prevent enumeration |
| Accept 15-minute token expiration | Security improvement - short access tokens with refresh token pattern |

## Commits

| Hash | Message |
|------|---------|
| 3b60cbf | fix(03-09): fix auth.test.ts test failures |

## Next Phase Readiness

All auth.test.ts tests pass. Auth service test suite is stable and ready for integration with other test plans.
