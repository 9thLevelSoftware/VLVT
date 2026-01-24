# Roadmap: VLVT Production Readiness

## Overview

VLVT transitions from MVP to production-ready state for staged beta launch. Seven phases address critical gaps in risk-priority order: security vulnerabilities first (blocks exploits), GDPR compliance second (legal requirement before users), testing infrastructure third (enables safe changes), bug fixes and UI polish fourth (user experience quality), monitoring fifth (visibility after hardening), deployment infrastructure sixth (operational resilience), and safety systems last (user protection at scale). Every phase delivers observable outcomes that protect beta users' data, privacy, and safety.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3, 4, 5, 6, 7): Planned milestone work
- Decimal phases (e.g., 2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Security Hardening** - Close exploitable vulnerabilities before deployment
- [ ] **Phase 2: GDPR Compliance** - Establish legal compliance for EU users and special category data
- [ ] **Phase 3: Testing Infrastructure** - Enable safe code changes with regression protection
- [ ] **Phase 4: Bug Fixes & UI Polish** - Fix UI bugs and polish user experience for beta quality
- [ ] **Phase 5: Monitoring & Alerting** - Gain production visibility after hardening
- [ ] **Phase 6: Deployment Infrastructure** - Ensure operational resilience and recovery capability
- [ ] **Phase 7: Safety Systems** - Protect users from harassment and enable effective moderation

## Phase Details

### Phase 1: Security Hardening
**Goal**: Beta users' data cannot be compromised through known vulnerabilities
**Depends on**: Nothing (first phase)
**Requirements**: SEC-01, SEC-02, SEC-03, SEC-04, SEC-05, SEC-06, SEC-07, SEC-08, SEC-09
**Success Criteria** (what must be TRUE):
  1. All database and service connections use validated TLS (no certificate bypass)
  2. Sensitive data fields are encrypted at rest (KYCAID verification data, exact locations)
  3. No critical or high severity dependency vulnerabilities remain in npm audit
  4. Users can only access their own resources (no BOLA/IDOR on any endpoint)
  5. Rate limiting prevents brute-force attacks on authentication endpoints
**Plans**: 4 plans in 2 waves

Plans:
- [ ] 01-01-PLAN.md - Fix dependency vulnerabilities across all backend services (SEC-03)
- [ ] 01-02-PLAN.md - Add location and message content to PII redaction (SEC-07)
- [ ] 01-03-PLAN.md - Migrate Socket.IO adapter to @socket.io/redis-adapter (SEC-09)
- [ ] 01-04-PLAN.md - Document TLS limitations and verify secrets handling (SEC-01, SEC-06)

### Phase 2: GDPR Compliance
**Goal**: EU users can exercise data rights and the app handles special category data lawfully
**Depends on**: Phase 1 (encryption must be enforced before data processing changes)
**Requirements**: GDPR-01, GDPR-02, GDPR-03, GDPR-04, GDPR-05, GDPR-06, GDPR-07
**Success Criteria** (what must be TRUE):
  1. Privacy policy is accessible from Settings and consent flows
  2. Users grant granular consent per purpose (not bundled acceptance)
  3. Users can export all their data as JSON within 30 days of request
  4. Users can delete their account and all associated data (including R2 photos)
  5. After Hours Mode participants provide explicit consent for special category data processing
**Plans**: TBD

Plans:
- [ ] 02-01: TBD (planned during phase planning)

### Phase 3: Testing Infrastructure
**Goal**: Code changes can be made safely with automated regression detection
**Depends on**: Phase 2 partial (consent flows need coverage)
**Requirements**: TEST-01, TEST-02, TEST-03, TEST-04, TEST-05, TEST-06
**Success Criteria** (what must be TRUE):
  1. Authentication flows (login, signup, logout, token refresh, password reset) have passing tests
  2. Payment integration with RevenueCat has passing tests for purchase, restore, and entitlements
  3. Core match/chat flows (swipe, match, message send/receive) have passing tests
  4. Safety flows (block, report, unblock) have passing tests
  5. Security fixes from Phase 1 have regression tests preventing reintroduction
**Plans**: TBD

Plans:
- [ ] 03-01: TBD (planned during phase planning)

### Phase 4: Bug Fixes & UI Polish
**Goal**: Beta users experience a polished, complete, and consistent UI with no broken flows
**Depends on**: Phase 3 (tests ensure bug fixes don't break existing functionality)
**Requirements**: UI-01, UI-02, UI-03, UI-04, UI-05, UI-06
**Success Criteria** (what must be TRUE):
  1. UI bugs audit completed with all critical/high issues fixed
  2. UX flows are smooth with no dead ends or confusing navigation
  3. All features are complete or intentionally disabled (no half-working functionality)
  4. Visual design is consistent across all screens (typography, spacing, colors, components)
  5. Error and loading states are properly implemented throughout the app
**Plans**: TBD

Plans:
- [ ] 04-01: TBD (planned during phase planning)

### Phase 5: Monitoring & Alerting
**Goal**: Production issues are detected and surfaced before users report them
**Depends on**: Phase 1 (don't log secrets), Phase 2 (don't log PII)
**Requirements**: MON-01, MON-02, MON-03, MON-04, MON-05, MON-06
**Success Criteria** (what must be TRUE):
  1. Sentry captures and groups production errors across all three services
  2. Health check endpoints return service status on each service
  3. Authentication failure spikes trigger alerts (brute force detection)
  4. All production endpoints have uptime monitoring with downtime alerts
  5. Logs use structured JSON format with correlation IDs and verified PII redaction
**Plans**: TBD

Plans:
- [ ] 05-01: TBD (planned during phase planning)

### Phase 6: Deployment Infrastructure
**Goal**: Data can be recovered and deployments are auditable
**Depends on**: Phase 5 (monitoring verifies backup success)
**Requirements**: DEP-01, DEP-02, DEP-03, DEP-04
**Success Criteria** (what must be TRUE):
  1. PostgreSQL database is backed up daily to R2 with 30-day retention
  2. All environment variables are documented and consistent across services/environments
  3. No secrets exist in source code (all in Railway environment variables)
  4. Database can be restored from backup to a test environment within 1 hour
**Plans**: TBD

Plans:
- [ ] 06-01: TBD (planned during phase planning)

### Phase 7: Safety Systems
**Goal**: Reported users can be investigated and moderated even after unmatch
**Depends on**: Phase 5 (monitoring enables abuse detection)
**Requirements**: SAF-01, SAF-02, SAF-03, SAF-04
**Success Criteria** (what must be TRUE):
  1. Chat history is preserved server-side for 30 days after unmatch
  2. Moderators can review reported content including preserved chat history
  3. Report handling workflow is documented and functional end-to-end
  4. After Hours ephemeral messages are retained server-side for safety review (30 days)
**Plans**: TBD

Plans:
- [ ] 07-01: TBD (planned during phase planning)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7
(Decimal phases, if inserted, execute between their surrounding integers)

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Security Hardening | 0/4 | Planned | - |
| 2. GDPR Compliance | 0/TBD | Not started | - |
| 3. Testing Infrastructure | 0/TBD | Not started | - |
| 4. Bug Fixes & UI Polish | 0/TBD | Not started | - |
| 5. Monitoring & Alerting | 0/TBD | Not started | - |
| 6. Deployment Infrastructure | 0/TBD | Not started | - |
| 7. Safety Systems | 0/TBD | Not started | - |

---

*Roadmap created: 2026-01-24*
*Last updated: 2026-01-24 - Phase 1 planned (4 plans in 2 waves)*
*Coverage: 38/38 v1 requirements mapped*
