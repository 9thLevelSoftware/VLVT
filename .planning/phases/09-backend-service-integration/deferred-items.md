# Phase 09 Deferred Items

## Pre-existing Test Failures

### profile-service: search-filters.test.ts (10 tests failing)

**Discovered during:** 09-02 Task 3 (test verification)
**Tests:** All 10 `POST /profiles/search/count` tests in `tests/search-filters.test.ts`
**Status:** Pre-existing -- confirmed by running tests on pre-change code via `git stash`
**Impact:** Not caused by shutdown changes. Likely a schema/mock mismatch in the search count endpoint.
**Action:** Defer to a future bug-fix pass.
