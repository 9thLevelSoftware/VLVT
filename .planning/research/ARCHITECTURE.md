# Architecture Patterns for Production-Readiness

**Domain:** Production readiness work for existing Node.js + Flutter dating app
**Researched:** 2026-01-24
**Confidence:** HIGH

## Executive Summary

Production-readiness for an existing application with real users requires a specific ordering that minimizes risk while maximizing value. The fundamental principle is: **fix what you have before adding what you need**.

The recommended order is:
1. Security hardening (blocks exploitable vulnerabilities)
2. GDPR/Data protection (legal requirement before beta users)
3. Testing infrastructure (enables safe changes for remaining work)
4. Bug fixes (now safe to make changes with test coverage)
5. Monitoring (visibility into production after hardening)
6. Documentation (captures decisions for operational handoff)

## Recommended Build Order with Dependencies

### Phase 1: Security Audit and Hardening

**Why first:** Security vulnerabilities are exploitable immediately upon deployment. Every day the app runs without these fixes is a day attackers could compromise user data. For a dating app handling location and intimate messages, this is especially critical.

**Dependencies:** None. Security work stands alone and blocks all other production work.

**Scope:**
| Work Item | Rationale | Blocks |
|-----------|-----------|--------|
| Fix critical/high security issues | Exploitable vulnerabilities must close first | Phase 4 bug fixes (changes without security = risk) |
| Enable TLS certificate validation | MITM attack vector | Phase 5 monitoring (can't trust data if connection insecure) |
| Require encryption keys | Plaintext PII storage | Phase 2 GDPR (can't be compliant with unencrypted data) |
| Audit and rotate secrets | Compromised secrets = compromised system | Phase 5 monitoring (credential rotation before logging setup) |
| Dependency vulnerability scan | Known CVEs in dependencies | All phases (vulnerable deps undermine everything) |

**Current state from findings:**
- 1 critical issue: RevenueCat webhook (FIXED)
- 1 high issue: Google Sign-In audience (needs validation)
- 3 medium issues: CORS, TLS validation, Apple nonce

**Estimated effort:** 1-2 weeks

### Phase 2: GDPR Compliance Verification

**Why second:** Legal compliance is a hard requirement before beta users. GDPR fines are percentage-of-revenue based. More importantly, user trust in a dating app requires privacy protection.

**Dependencies:** Phase 1 Security (encryption requirements must be enforced first)

**Scope:**
| Work Item | Rationale | Blocks |
|-----------|-----------|--------|
| Data mapping and inventory | Know what you collect before protecting it | Retention policies |
| Consent flow implementation | Legal basis for processing | Feature development |
| Data subject rights endpoints | Right to access, delete, export | Beta launch |
| Retention policy implementation | Storage minimization principle | Monitoring (can't alert on violations without policies) |
| Privacy-by-design review | Ensure new features won't violate | Feature development |

**Current state from findings:**
- Data inventory exists (12 data categories mapped)
- Account deletion cascade works
- GAPS: R2 photo cleanup (FIXED), KYCAID encryption (needs enforcement), retention policies (missing), consent flows (missing)

**Estimated effort:** 2-3 weeks

### Phase 3: Testing Infrastructure

**Why third (not first):** Testing enables safe change, but the security and compliance work is well-scoped and high-priority. Adding tests first delays critical security fixes. Adding tests after security means: security work is verified manually (acceptable for small scope), then test infrastructure protects the rest of the work.

**Dependencies:** Phase 1 Security (don't test insecure code, it will change), Phase 2 partial (consent flows will need tests)

**Scope:**
| Work Item | Rationale | Blocks |
|-----------|-----------|--------|
| Characterization tests for critical paths | Capture current behavior before changing | Phase 4 bug fixes |
| Auth flow integration tests | Most critical user journey | All auth changes |
| API endpoint tests with security assertions | Prevent security regressions | Phase 4 bug fixes |
| Database migration test harness | Safe schema changes | Any DB changes |
| CI pipeline with test gates | Enforce test discipline | All future development |

**Build order within Phase 3:**
1. **CI pipeline setup** - Empty pipeline that runs on PR
2. **Smoke tests** - Health check endpoints, basic auth flow
3. **Critical path characterization** - Login, profile creation, matching, messaging
4. **Security regression tests** - Auth, authorization, input validation
5. **Coverage gating** - Enforce minimum coverage on new code only

**Pattern: Incremental coverage, not 100% coverage**

From Michael Feathers' "Working Effectively with Legacy Code": Don't aim for 100% coverage on existing code. Instead:
- Write characterization tests for code you're about to change
- Add tests before fixing each bug (test proves the bug, fix makes test pass)
- Require tests for new code only

**Estimated effort:** 2-3 weeks

### Phase 4: Bug Fixes

**Why fourth:** Bug fixes require code changes. Code changes without test coverage risk introducing regressions. With test infrastructure from Phase 3, bug fixes can be verified.

**Dependencies:** Phase 3 Testing (tests prove bugs are fixed)

**Scope:**
| Work Item | Rationale | Blocks |
|-----------|-----------|--------|
| Known bug triage and prioritization | Fix critical bugs first | None |
| Write failing test for each bug | Ensures bug is fixed and stays fixed | Nothing, but improves coverage |
| Fix and verify each bug | Ship working software | Beta launch |
| Error handling review | Graceful failures improve UX | Phase 5 monitoring (errors need to be loggable) |

**Bug fix workflow:**
```
1. Identify bug
2. Write test that demonstrates the bug (test fails)
3. Fix the bug
4. Test passes
5. Add test to CI
6. Never regress
```

**Estimated effort:** 2-3 weeks (depends on bug count and severity)

### Phase 5: Monitoring and Observability

**Why fifth:** Monitoring reveals problems in production. But:
- Monitoring insecure code alerts you to breaches after they happen (too late)
- Monitoring non-compliant code shows you violating GDPR (bad)
- Monitoring buggy code creates noise that obscures real issues

With security, compliance, and bugs addressed, monitoring becomes valuable.

**Dependencies:** Phase 1 Security (don't log secrets), Phase 2 GDPR (don't log PII), Phase 4 Bug fixes (reduce noise)

**Scope:**
| Work Item | Rationale | Blocks |
|-----------|-----------|--------|
| Structured logging review | Logs are foundation of observability | Alerting |
| Metrics collection (OpenTelemetry) | Measure latency, errors, throughput | Dashboards |
| Health check endpoints | Enable orchestrator health probes | Railway auto-restart |
| Error tracking (Sentry integration) | Aggregate errors, stack traces | On-call |
| Alerting thresholds | Know when things are wrong | Incident response |
| Dashboard creation | Visualize system health | Operations handoff |

**Build order within Phase 5:**
1. **Structured logging** - Consistent JSON format, correlation IDs
2. **Health checks** - Liveness and readiness probes
3. **Error tracking** - Sentry or equivalent for exceptions
4. **Metrics** - Latency, throughput, error rates
5. **Dashboards** - Service health, user activity, API performance
6. **Alerting** - Page on critical issues, notify on warnings

**Pattern: Domain-Oriented Observability**

From Martin Fowler's guidance: Instrumentation should be abstracted into domain-specific probes that hide technical details. Don't scatter `logger.info()` calls everywhere; create domain events like `userAuthenticated()`, `matchCreated()`, `messageDeliveryFailed()`.

**Estimated effort:** 2-3 weeks

### Phase 6: Documentation and Operational Handoff

**Why last:** Documentation captures decisions made in previous phases. Writing documentation before the work is complete means rewriting it when decisions change.

**Dependencies:** All previous phases (document what exists, not what's planned)

**Scope:**
| Work Item | Rationale | Blocks |
|-----------|-----------|--------|
| Security documentation | Incident response contacts, security policy | Operations |
| Runbook for common issues | Enable on-call to resolve without escalation | Incident response |
| Architecture decision records | Why we made these choices | Future development |
| Deployment documentation | How to deploy, rollback, scale | Operations handoff |

**Estimated effort:** 1 week

---

## Dependency Graph

```
Phase 1: Security
    |
    v
Phase 2: GDPR ----+
    |             |
    v             |
Phase 3: Testing  |
    |             |
    v             |
Phase 4: Bug Fixes|
    |             |
    v             v
Phase 5: Monitoring (depends on 1, 2, 4)
    |
    v
Phase 6: Documentation (depends on all)
```

**Critical path:** Security -> GDPR -> Testing -> Bug Fixes -> Monitoring -> Documentation

**Parallel opportunity:** GDPR consent flow implementation can happen in parallel with Testing infrastructure setup (they don't conflict).

---

## Anti-Patterns to Avoid

### 1. Adding Monitoring Before Security Hardening

**What:** Setting up comprehensive logging and alerting before fixing security vulnerabilities.

**Why bad:**
- Monitoring may log sensitive data (tokens, PII)
- Alerts on security issues create pressure to fix quickly, leading to mistakes
- Attackers may use monitoring data to understand your system

**Instead:** Harden security first, then add monitoring that respects security constraints.

### 2. Testing Everything Before Any Fixes

**What:** Spending weeks writing comprehensive tests before addressing security issues.

**Why bad:**
- Delays critical security fixes
- Tests may need rewriting after security changes
- Creates false sense of safety while vulnerabilities remain

**Instead:** Fix critical security issues first (small, well-scoped), then build test infrastructure.

### 3. Big-Bang Refactoring

**What:** Rewriting large portions of the codebase to "clean it up" during production-readiness.

**Why bad:**
- Introduces new bugs
- Delays production-readiness work
- Hard to verify equivalence of rewritten code

**Instead:** Use characterization tests, make small targeted changes, refactor incrementally.

### 4. Skipping GDPR Until "Later"

**What:** Treating data protection as optional or deferrable.

**Why bad:**
- Legal liability from day one of beta
- Retrofitting consent flows is harder than building them in
- User trust in dating app depends on privacy protection

**Instead:** Treat GDPR as blocking requirement for beta launch.

### 5. Adding Features During Production-Readiness

**What:** Mixing feature development with hardening work.

**Why bad:**
- New features introduce new bugs and security surface
- Dilutes focus from production-readiness goals
- Makes it harder to know when "done"

**Instead:** Feature freeze during production-readiness sprint. Hardening only.

---

## Specific Recommendations for VLVT

Based on the codebase analysis, here are VLVT-specific recommendations:

### Security Hardening (Phase 1)

**Priority fixes:**
1. Enable TLS certificate validation for Railway DB connections
   - Get Railway CA bundle
   - Replace `rejectUnauthorized: false` with proper CA verification
   - Test connection with valid certificates

2. Require KYCAID encryption key
   - Add startup validation: if KYC enabled but key missing, fail
   - Migrate any existing plaintext records
   - Remove plaintext storage path entirely

3. Standardize dependency versions
   - Update firebase-admin to 13.6.0 in all services
   - Update express-rate-limit to 8.x in all services
   - Run `npm audit` and address findings

**Already fixed (verify):**
- RevenueCat webhook auth
- Google Sign-In audience enforcement
- CORS production guard

### GDPR Compliance (Phase 2)

**Implementation order:**
1. Consent storage schema (add to users table)
2. Consent management API (GET/PUT endpoints)
3. Frontend consent UI (onboarding flow)
4. Retention policy definition (messages: 90 days, audit logs: 1 year)
5. Retention job implementation (daily cleanup)
6. Data export endpoint (for SAR requests)

**Already fixed (verify):**
- R2 photo cleanup on deletion
- Location precision redaction in logs

### Testing (Phase 3)

**Start with characterization tests for:**
1. Authentication flows (Google, Apple, email)
2. Token refresh with rotation
3. Profile creation and discovery
4. Match creation and messaging
5. Subscription entitlement checks

**Coverage target:**
- New code: 80% coverage required
- Existing code: No requirement, add tests as you change code

### Monitoring (Phase 5)

**Instrumentation priorities:**
1. Auth events (login, logout, token refresh, failure)
2. Match events (created, saved, expired)
3. Message events (sent, delivered, failed)
4. API latency per endpoint
5. Error rates per service
6. Database connection pool stats

---

## Testing Before Each Phase

Each phase should have explicit verification before moving to the next:

### Phase 1 -> Phase 2 Gate
- [ ] All critical/high security issues closed
- [ ] TLS validation enabled (tested with valid certs)
- [ ] Encryption keys required at startup
- [ ] Dependency audit clean (no critical CVEs)
- [ ] Security regression tests passing

### Phase 2 -> Phase 3 Gate
- [ ] Data inventory documented
- [ ] Consent endpoints implemented
- [ ] Retention policies defined
- [ ] Deletion cascade verified (including R2)
- [ ] Privacy review completed

### Phase 3 -> Phase 4 Gate
- [ ] CI pipeline running on all PRs
- [ ] Critical path tests passing
- [ ] Coverage reporting working
- [ ] Test data management working

### Phase 4 -> Phase 5 Gate
- [ ] Known critical bugs fixed
- [ ] Error handling reviewed
- [ ] Test coverage increased
- [ ] No regressions (all tests passing)

### Phase 5 -> Phase 6 Gate
- [ ] Structured logging in place
- [ ] Health checks responding
- [ ] Error tracking capturing exceptions
- [ ] Dashboards showing key metrics
- [ ] Alerting configured

---

## Sources

- [Production-Ready Microservices (O'Reilly)](https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/app01.html) - Production readiness checklist patterns
- [Mercari Production Readiness Checklist (GitHub)](https://github.com/mercari/production-readiness-checklist) - Real-world microservices checklist
- [Domain-Oriented Observability (Martin Fowler)](https://martinfowler.com/articles/domain-oriented-observability.html) - Observability patterns for existing codebases
- [Working Effectively with Legacy Code (Book Summary)](https://booksummaryproject.com/book53) - Incremental testing strategies
- [GDPR Compliance Guide 2026 (SecurePrivacy)](https://secureprivacy.ai/blog/gdpr-compliance-2026) - Current GDPR implementation guidance
- [Security Testing Best Practices (SentinelOne)](https://www.sentinelone.com/cybersecurity-101/cybersecurity/software-security-audit/) - Security audit integration patterns
- [Application Security Testing 2025 (Oligo Security)](https://www.oligo.security/academy/application-security-testing-in-2025-techniques-best-practices) - Shift-left security approach
- [How to Setup Monitoring on Existing Software (OpenUpTheCloud)](https://openupthecloud.com/monitoring-existing-software-practical-guide/) - Retrofit observability guide
- [Production Readiness Review Best Practices (Cortex)](https://www.cortex.io/post/how-to-create-a-great-production-readiness-checklist) - Checklist creation patterns
- VLVT codebase analysis: `SECURITY_FINDINGS.md`, `DATA_PROTECTION_FINDINGS.md`, `.planning/codebase/CONCERNS.md`

---

*Architecture research: 2026-01-24*
