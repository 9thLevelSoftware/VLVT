# Requirements: VLVT Production Readiness

**Defined:** 2026-01-24
**Core Value:** When beta users sign up, their data must be secure, their privacy protected, and the app must not fail in ways that expose them to harm or embarrassment.

## v1 Requirements

Requirements for beta launch. Each maps to roadmap phases.

### Security Hardening

- [x] **SEC-01**: TLS validation enabled on all database and service connections (documented Railway limitation)
- [x] **SEC-02**: Encryption keys required and enforced for sensitive data fields (KYCAID implemented, location deferred to v2)
- [x] **SEC-03**: Dependency audit completed with critical/high vulnerabilities resolved
- [x] **SEC-04**: BOLA/IDOR vulnerability check on all API endpoints with authorization fixes (60 endpoints audited)
- [x] **SEC-05**: Rate limiting configured on authentication endpoints
- [x] **SEC-06**: No hardcoded secrets in codebase (all moved to environment variables)
- [x] **SEC-07**: PII scrubbed from application logs (no emails, locations, message content)
- [ ] **SEC-08**: Input validation hardened across all API endpoints
- [x] **SEC-09**: Socket.IO adapter upgraded from deprecated socket.io-redis to @socket.io/redis-adapter

### GDPR Compliance

- [x] **GDPR-01**: Privacy policy accessible in-app and linked from settings
- [x] **GDPR-02**: Granular consent collection with per-purpose opt-in
- [x] **GDPR-03**: Data export endpoint for Right to Access (Article 15)
- [x] **GDPR-04**: Account deletion endpoint for Right to Erasure (Article 17)
- [x] **GDPR-05**: Consent withdrawal mechanism available to users
- [x] **GDPR-06**: Data retention policies defined and documented
- [x] **GDPR-07**: Special category data handling documented (Article 9 - sexual orientation inference)

### Testing

- [ ] **TEST-01**: Authentication flow tests (login, signup, logout, token refresh, password reset)
- [ ] **TEST-02**: Payment flow tests (RevenueCat subscription, entitlement checks)
- [ ] **TEST-03**: Match/chat flow tests (swipe, match, message send/receive)
- [ ] **TEST-04**: Safety flow tests (block user, report user, unblock)
- [ ] **TEST-05**: After Hours flow tests (session start, matching, ephemeral chat, save)
- [ ] **TEST-06**: Security regression tests for fixed vulnerabilities

### Monitoring & Alerting

- [ ] **MON-01**: Sentry configured for production error tracking across all services
- [ ] **MON-02**: Health check endpoints on all services returning service status
- [ ] **MON-03**: Authentication failure alerting configured (brute force detection)
- [ ] **MON-04**: Uptime monitoring configured for all production endpoints
- [ ] **MON-05**: Structured logging with correlation IDs across services
- [ ] **MON-06**: PII redaction verified in all log outputs

### Deployment Infrastructure

- [ ] **DEP-01**: Database backup strategy implemented (daily to R2, 30-day retention)
- [ ] **DEP-02**: Environment variable audit completed (all services, all environments)
- [ ] **DEP-03**: Secrets management reviewed (no secrets in code, proper Railway configuration)
- [ ] **DEP-04**: Backup restoration tested and documented
- [ ] **DEP-05**: Email service configured (Resend/SendGrid/SMTP) for verification and password reset emails
- [ ] **DEP-06**: Apple Sign-In web flow configured for Android support (Services ID, callback URL, client secret)

### Bug Fixes & UI Polish

- [x] **UI-01**: UI bugs audit completed and critical/high issues fixed
- [x] **UI-02**: UX flow problems identified and fixed (navigation, dead ends, confusing journeys)
- [x] **UI-03**: Incomplete features completed or removed (no half-working functionality)
- [x] **UI-04**: Design consistency enforced (typography, spacing, colors, components)
- [x] **UI-05**: Error states and loading states reviewed and polished
- [x] **UI-06**: Edge cases handled (empty states, offline mode, timeouts)

### Safety Systems

- [ ] **SAF-01**: Chat history preserved 30 days post-unmatch for moderation
- [ ] **SAF-02**: Content moderation capability for reviewing reported content
- [ ] **SAF-03**: Report handling workflow documented and functional
- [ ] **SAF-04**: Ephemeral After Hours messages retained server-side (30 days) for safety

## v2 Requirements

Deferred to post-beta. Tracked but not in current roadmap.

### Enhanced Security

- **SEC-10**: Device fingerprinting for ban enforcement across account recreation
- **SEC-11**: Photo perceptual hashing against banned user database
- **SEC-12**: JWT algorithm migration from HS256 to RS256

### Enhanced Safety

- **SAF-05**: Deepfake detection enhancement for verification
- **SAF-06**: Automated content moderation with AI
- **SAF-07**: Proactive threat detection (behavioral analysis)

### Enhanced Monitoring

- **MON-07**: Performance APM dashboards
- **MON-08**: Business metrics tracking
- **MON-09**: Anomaly detection alerting

### Enhanced Testing

- **TEST-07**: 70%+ backend test coverage
- **TEST-08**: Flutter E2E testing with Patrol
- **TEST-09**: Load testing for concurrent users

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| New feature development | This is hardening, not feature work |
| 100% test coverage | Focus on critical paths; diminishing returns |
| SOC 2 certification | Not required for beta; consider post-launch |
| Performance optimization | Beyond critical issues; defer to post-beta |
| iOS background location fix | Known limitation; acceptable for beta |
| Interests/tags system | Deferred from v1.0; not production-readiness |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SEC-01 | Phase 1 | Pending |
| SEC-02 | Phase 1 | Pending |
| SEC-03 | Phase 1 | Pending |
| SEC-04 | Phase 1 | Pending |
| SEC-05 | Phase 1 | Pending |
| SEC-06 | Phase 1 | Pending |
| SEC-07 | Phase 1 | Pending |
| SEC-08 | Phase 1 | Pending |
| SEC-09 | Phase 1 | Pending |
| GDPR-01 | Phase 2 | Complete |
| GDPR-02 | Phase 2 | Complete |
| GDPR-03 | Phase 2 | Complete |
| GDPR-04 | Phase 2 | Complete |
| GDPR-05 | Phase 2 | Complete |
| GDPR-06 | Phase 2 | Complete |
| GDPR-07 | Phase 2 | Complete |
| TEST-01 | Phase 3 | Pending |
| TEST-02 | Phase 3 | Pending |
| TEST-03 | Phase 3 | Pending |
| TEST-04 | Phase 3 | Pending |
| TEST-05 | Phase 3 | Pending |
| TEST-06 | Phase 3 | Pending |
| UI-01 | Phase 4 | Complete |
| UI-02 | Phase 4 | Complete |
| UI-03 | Phase 4 | Complete |
| UI-04 | Phase 4 | Complete |
| UI-05 | Phase 4 | Complete |
| UI-06 | Phase 4 | Complete |
| MON-01 | Phase 5 | Pending |
| MON-02 | Phase 5 | Pending |
| MON-03 | Phase 5 | Pending |
| MON-04 | Phase 5 | Pending |
| MON-05 | Phase 5 | Pending |
| MON-06 | Phase 5 | Pending |
| DEP-01 | Phase 6 | Pending |
| DEP-02 | Phase 6 | Pending |
| DEP-03 | Phase 6 | Pending |
| DEP-04 | Phase 6 | Pending |
| DEP-05 | Phase 6 | Pending |
| DEP-06 | Phase 6 | Pending |
| SAF-01 | Phase 7 | Pending |
| SAF-02 | Phase 7 | Pending |
| SAF-03 | Phase 7 | Pending |
| SAF-04 | Phase 7 | Pending |

**Coverage:**
- v1 requirements: 40 total
- Mapped to phases: 40
- Unmapped: 0 ✓

---
*Requirements defined: 2026-01-24*
*Last updated: 2026-01-25 - Phase 4 (Bug Fixes & UI Polish) complete*
