# Roadmap: VLVT

## Milestones

- v1.0 After Hours Mode - Phases 1-7 (shipped 2026-01-24)
- v1.1 Production Readiness - Phases 1-7 (shipped 2026-02-03)
- v2.0 Beta Readiness - Phases 8-14 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

### v2.0 Beta Readiness

- [x] **Phase 8: Shared Backend Utilities** - Centralized resilient DB pool factory with error handling and connection config (completed 2026-02-27)
- [x] **Phase 9: Backend Service Integration** - Graceful shutdown with pool cleanup across all three services (completed 2026-02-27)
- [x] **Phase 10: Page Transitions** - Consistent slide and fade navigation animations across all screens (completed 2026-02-27)
- [x] **Phase 11: Tooltip Accessibility and Ops Readiness** - Screen reader support on all icon buttons plus pre-beta operations checklist (completed 2026-02-28)
- [x] **Phase 12: Shutdown Ordering Fix** - Await server.close() before pool.end() in auth-service and profile-service (gap closure) (completed 2026-02-28)
- [x] **Phase 13: Pre-Existing Test Fixes** - Fix 22 failing tests in auth-service and profile-service (tech debt) (completed 2026-02-28)
- [x] **Phase 14: Documentation Cleanup** - Update ROADMAP progress table and SUMMARY.md frontmatter across all plans (tech debt) (completed 2026-02-28)

## Phase Details

### Phase 8: Shared Backend Utilities
**Goal**: All three backend services share a single, resilient database pool configuration that handles Railway cold starts and connection failures without crashing
**Depends on**: Nothing (first phase of v2.0)
**Requirements**: RESIL-01, RESIL-02, RESIL-03
**Success Criteria** (what must be TRUE):
  1. A service receiving an idle client error from PostgreSQL logs the error and continues operating instead of crashing
  2. Database connections succeed during Railway cold starts (5-second timeout instead of 2-second)
  3. Pool configuration (max connections, idle timeout, SSL, connection timeout) is defined in one shared file and imported by all three services -- no duplicated pool config
**Plans**: 2 plans

Plans:
- [x] 08-01-PLAN.md — Create createPool() factory in @vlvt/shared with TDD (RESIL-01, RESIL-02, RESIL-03)
- [x] 08-02-PLAN.md — Replace inline pool config in all three services with createPool() import (RESIL-01, RESIL-02, RESIL-03)

### Phase 9: Backend Service Integration
**Goal**: All three services shut down gracefully on SIGTERM/SIGINT, closing HTTP connections and database pools without orphaning resources or hanging indefinitely
**Depends on**: Phase 8
**Requirements**: RESIL-04, RESIL-05, RESIL-06, RESIL-07
**Success Criteria** (what must be TRUE):
  1. When auth-service receives SIGTERM, it stops accepting new requests, waits for in-flight requests to complete, closes the database pool, and exits cleanly
  2. When profile-service receives SIGTERM, it stops its background schedulers, closes server connections, closes the database pool, and exits cleanly
  3. When chat-service receives SIGTERM, it closes Socket.IO connections, closes the database pool, and exits cleanly
  4. If any shutdown step hangs for more than 10 seconds, the process force-exits to prevent stuck deployments on Railway
  5. Sending SIGTERM twice does not crash the process (double-invocation guard prevents duplicate pool.end() calls)
**Plans**: 2 plans

Plans:
- [x] 09-01-PLAN.md — Auth-service graceful shutdown with server.close + pool.end (RESIL-04, RESIL-07)
- [x] 09-02-PLAN.md — Profile-service and chat-service shutdown enhancement with pool.end and resource cleanup (RESIL-05, RESIL-06, RESIL-07)

### Phase 10: Page Transitions
**Goal**: All screen navigation uses consistent, polished animations that match the app's design language instead of default MaterialPageRoute transitions
**Depends on**: Nothing (independent of backend phases)
**Requirements**: UX-01, UX-02, UX-03, UX-04
**Success Criteria** (what must be TRUE):
  1. Forward navigation (push) across the app uses a slide-from-right transition with easeOutCubic curve
  2. Modal and overlay screens use a crossfade transition
  3. No screen navigation uses the default MaterialPageRoute -- all 22+ calls are replaced with VlvtPageRoute or VlvtFadeRoute
  4. Existing Hero animations (discovery profile cards, chat screens) continue working correctly with the custom page routes
**Plans**: 2 plans

Plans:
- [x] 10-01-PLAN.md — Create VlvtPageRoute and VlvtFadeRoute classes; replace MaterialPageRoute in entry-point and service files (UX-01, UX-02, UX-03)
- [x] 10-02-PLAN.md — Replace remaining MaterialPageRoute and consolidate inline PageRouteBuilder across all screen files (UX-03, UX-04)

### Phase 11: Tooltip Accessibility and Ops Readiness
**Goal**: Every icon button in the app is readable by screen readers with a descriptive label, and all pre-beta operational prerequisites are documented in a single checklist
**Depends on**: Nothing (independent of other phases)
**Requirements**: A11Y-01, A11Y-02, A11Y-03, OPS-01
**Success Criteria** (what must be TRUE):
  1. VlvtIconButton widget accepts a tooltip parameter and renders it for screen readers
  2. All 20 identified IconButtons announce a descriptive action (e.g., "Send message", "Go back", "Close") when focused by TalkBack or VoiceOver
  3. No icon button produces duplicate screen reader announcements from overlapping Semantics wrappers and tooltip properties
  4. A pre-beta operations checklist exists that documents every operational prerequisite (backup validation, monitoring setup, security keys, external service configuration) needed before inviting real users
**Plans**: 2 plans

Plans:
- [x] 11-01-PLAN.md — Refactor VlvtIconButton tooltip + add tooltips to all 18 missing IconButtons (A11Y-01, A11Y-02, A11Y-03)
- [x] 11-02-PLAN.md — Create pre-beta operations checklist at docs/PRE-BETA-CHECKLIST.md (OPS-01)

### Phase 12: Shutdown Ordering Fix
**Goal**: server.close() completes before pool.end() runs in auth-service and profile-service, preventing 500 errors on in-flight requests during Railway redeploys
**Depends on**: Phase 9
**Requirements**: RESIL-04, RESIL-05 (improvement)
**Gap Closure**: Closes integration gap from v2.0 audit (server-close-not-awaited)
**Success Criteria** (what must be TRUE):
  1. Auth-service awaits server.close() callback before calling pool.end()
  2. Profile-service awaits server.close() callback before calling pool.end()
  3. In-flight requests complete before the database pool is closed during shutdown
**Plans**: 1 plan

Plans:
- [x] 12-01-PLAN.md — Wrap server.close() in Promise and await it in auth-service and profile-service (RESIL-04, RESIL-05)

### Phase 13: Pre-Existing Test Fixes
**Goal**: All pre-existing failing tests in auth-service and profile-service pass
**Depends on**: Phase 8 (uses shared pool)
**Requirements**: None (tech debt cleanup)
**Gap Closure**: Resolves pre-existing test failures identified in v2.0 audit
**Success Criteria** (what must be TRUE):
  1. All 13 tests in auth-service account-lockout.test.ts pass (fixed by commit 09c7028)
  2. All 12 tests in profile-service search-filters.test.ts pass (fixed by commit 09c7028)
  3. No new test regressions introduced
**Plans**: 1 plan

Plans:
- [x] 13-01-PLAN.md — Verify pre-existing test fixes are still green (verification only, no code changes)

### Phase 14: Documentation Cleanup
**Goal**: ROADMAP.md and all SUMMARY.md files accurately reflect execution state
**Depends on**: Nothing (documentation only)
**Requirements**: None (documentation format gap)
**Gap Closure**: Fixes documentation gaps identified in v2.0 audit
**Success Criteria** (what must be TRUE):
  1. SUMMARY.md frontmatter includes populated `requirements_completed` field for all plan summaries
  2. ROADMAP.md progress table accurately reflects completion state of all phases
**Plans**: 2 plans

Plans:
- [x] 14-01-PLAN.md — Add requirements-completed frontmatter to all 65 v1.0 and v1.1 SUMMARY files (DOCDEBT-14)
- [x] 14-02-PLAN.md — Fix ROADMAP.md progress table alignment, plan checkboxes, and Phase 14 entries (DOCDEBT-14)

## Progress

**Execution Order:**
Phases 8-11 are complete. Phase 12 depends on Phase 9. Phase 13 depends on Phase 8. Phase 14 is independent. Phases 12 and 13 can run in parallel, Phase 14 can run in parallel with both.

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 8. Shared Backend Utilities | v2.0 | 2/2 | Complete | 2026-02-27 |
| 9. Backend Service Integration | v2.0 | 2/2 | Complete | 2026-02-27 |
| 10. Page Transitions | v2.0 | 2/2 | Complete | 2026-02-27 |
| 11. Tooltip Accessibility and Ops Readiness | v2.0 | 2/2 | Complete | 2026-02-28 |
| 12. Shutdown Ordering Fix | v2.0 | 1/1 | Complete | 2026-02-28 |
| 13. Pre-Existing Test Fixes | v2.0 | 1/1 | Complete | 2026-02-28 |
| 14. Documentation Cleanup | v2.0 | 2/2 | Complete | 2026-02-28 |

---
*Roadmap created: 2026-02-27*
*Milestone: v2.0 Beta Readiness*
