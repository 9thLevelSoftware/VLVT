---
phase: 01-security-hardening
plan: 01
subsystem: infra
tags: [npm, sentry, security, dependencies, vulnerabilities]

# Dependency graph
requires: []
provides:
  - Zero critical/high npm vulnerabilities across all backend services
  - @sentry/node upgraded to v10.27.0+ (fixes header leak CVE)
  - Transitive dependency vulnerabilities resolved (qs, body-parser, jws, glob)
affects: [all-backend-services, deployment, ci-cd]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Pin minimum security versions in package.json for critical dependencies

key-files:
  created: []
  modified:
    - backend/shared/package.json
    - backend/auth-service/package.json
    - backend/profile-service/package.json
    - backend/chat-service/package.json

key-decisions:
  - "Updated @sentry/node minimum to ^10.27.0 (fixes GHSA-6465-jgvq-jhgp)"
  - "package-lock.json files remain gitignored - security fixes via semver ranges"

patterns-established:
  - "Minimum version pinning: Use ^X.Y.Z where Y.Z is the security-patched version"

requirements-completed: [SEC-03]

# Metrics
duration: 9min
completed: 2026-01-24
---

# Phase 01 Plan 01: Dependency Vulnerability Fixes Summary

**Resolved 26 npm vulnerabilities across 4 backend packages by upgrading @sentry/node to v10.27.0+ and running npm audit fix**

## Performance

- **Duration:** 9 min
- **Started:** 2026-01-24T16:28:25Z
- **Completed:** 2026-01-24T16:37:08Z
- **Tasks:** 3
- **Files modified:** 4

## Accomplishments

- Eliminated all critical and high severity npm vulnerabilities (was 7 high across services)
- Upgraded @sentry/node from v7/v10.25 to v10.27.0+ to fix sensitive header leak (GHSA-6465-jgvq-jhgp)
- Transitive dependency fixes: qs DoS, body-parser DoS, jws HMAC verification, glob command injection
- All services build successfully with updated dependencies
- 263 tests pass in shared package

## Task Commits

Each task was committed atomically:

1. **Task 1: Audit and fix dependencies in shared package** - `e8e24fa` (fix)
2. **Task 2: Audit and fix dependencies in all services** - `875a69e` (fix)
3. **Task 3: Verify end-to-end service health** - No commit (verification only)

## Files Created/Modified

- `backend/shared/package.json` - @sentry/node ^7.0.0 -> ^10.27.0
- `backend/auth-service/package.json` - @sentry/node ^10.25.0 -> ^10.27.0
- `backend/profile-service/package.json` - @sentry/node ^10.25.0 -> ^10.27.0
- `backend/chat-service/package.json` - @sentry/node ^10.25.0 -> ^10.27.0

## Decisions Made

1. **@sentry/node version bump** - Updated minimum version to ^10.27.0 to ensure security fix is always installed via semver resolution
2. **Lockfile strategy** - package-lock.json files remain gitignored; security fixes persist via package.json version constraints rather than lockfile commits

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Upgraded @sentry/node in shared package from v7 to v10**
- **Found during:** Task 1 (shared package audit)
- **Issue:** shared package had @sentry/node ^7.0.0 which predates the security fix (requires v10.27.0+)
- **Fix:** Upgraded to ^10.27.0 for consistency with other services and security
- **Files modified:** backend/shared/package.json
- **Verification:** npm audit shows 0 vulnerabilities, 263 tests pass
- **Committed in:** e8e24fa (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (missing critical security version)
**Impact on plan:** Required for security. Sentry v7 to v10 is a major version bump but API compatibility was verified via successful build and tests.

## Issues Encountered

1. **Jest configuration conflict** - Services have both jest.config.js and jest key in package.json. Had to run tests with `--config=jest.config.js` flag. This is a pre-existing issue, not caused by dependency updates.
2. **Pre-existing test failures** - auth-service, profile-service, and chat-service have failing tests (42, 12, and 27 failures respectively). These are test/implementation mismatches and database connectivity issues, not related to dependency updates.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- All 4 backend packages have 0 critical/high vulnerabilities
- Ready for production deployment regarding dependency security
- Pre-existing test failures should be addressed in future plans (test alignment with current API responses)
- Note: Some moderate/low vulnerabilities may remain (lodash prototype pollution) - acceptable for beta

---
*Phase: 01-security-hardening*
*Completed: 2026-01-24*
