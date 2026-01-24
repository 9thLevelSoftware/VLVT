# Production Readiness Research Summary

**Project:** VLVT Dating App - Beta Launch Preparation
**Domain:** Dating app production readiness (security, compliance, quality)
**Researched:** 2026-01-24
**Confidence:** HIGH

## Executive Summary

VLVT is preparing for staged beta launch with real users, transitioning from MVP to production-ready state. This research identifies the critical security, compliance, testing, and operational capabilities required to safely launch a dating app handling sensitive data (location, photos, intimate messages, After Hours Mode content).

The recommended approach follows a risk-prioritized sequence: **security hardening first** (blocks exploitable vulnerabilities immediately), **GDPR compliance second** (legal requirement before beta users), **testing infrastructure third** (enables safe changes), **bug fixes fourth** (with test coverage), **monitoring fifth** (visibility after hardening), and **documentation last** (captures completed decisions). This order minimizes risk while maximizing value, following the principle "fix what you have before adding what you need."

Key risks center on dating app-specific vulnerabilities documented in recent breaches: exposed API keys (M.A.D Mobile apps leaked 1.5M explicit images in April 2025), BOLA/IDOR flaws (Feeld breach November 2025), GDPR special category data violations (Grindr 6.5M EUR fine for location sharing), and ban evasion enabling serial offenders (Match Group lawsuits December 2025). VLVT's After Hours Mode creates heightened GDPR risk as all associated data qualifies as "special category" under Article 9 - requiring explicit consent, not just privacy policy acceptance.

## Key Findings

### Recommended Stack

The existing VLVT stack (Node.js/TypeScript + Flutter + PostgreSQL + Redis + Railway) is solid. Production readiness requires adding security scanning, testing frameworks, monitoring, and compliance tooling - not replacing core technologies.

**Core additions:**

- **Snyk CLI (^1.1302.0)**: Dependency + code vulnerability scanning with SAST and SCA capabilities. Chosen over npm audit alone for code analysis, not just dependency scanning. Critical for dating apps as npm ecosystem saw 2,168+ malicious packages in 2024.

- **Patrol (^3.11.0)**: Flutter E2E testing framework that handles native permissions (location, camera, push notifications). Superior to integration_test for dating app flows requiring platform dialog interaction. Supports Firebase Test Lab.

- **Sentry (^10.34.0)**: Already in stack at v10.25.0, upgrade for continuous profiling and improved APM. Railway monitoring provides infrastructure metrics; Sentry covers application errors and performance.

- **Railway PostgreSQL Backups**: Official templates using pg_dump to Cloudflare R2 (already used for photos). Daily backups with 30-day retention, version-aware, includes Prometheus metrics.

- **Winston (^3.18.3)**: Already integrated, keep for structured logging. Configure for production with JSON format, correlation IDs, PII redaction. Alternative: Pino (5-10x faster) if performance becomes critical.

**Security hardening:**

- **JWT migration to RS256/ES256**: Asymmetric algorithms recommended for microservices. Private key stays with auth-service, public key distributed to profile-service and chat-service. Enables easier key rotation via JWKS endpoints.

- **Socket.IO adapter upgrade**: Replace deprecated `socket.io-redis` with `@socket.io/redis-adapter` (^8.3.0). Add authentication middleware on connection, room authorization, and rate limiting per connection.

**GDPR compliance tooling:**

- **Custom DSAR API**: Required endpoints for data access requests, deletion requests, and data export. Must respond within 30 days (extendable to 90 for complex cases). No off-the-shelf solution fits dating app needs.

- **Application-level encryption**: AES-256-GCM for sensitive columns (exact location coordinates, After Hours messages). Storage-level encryption exists (Railway PostgreSQL), but application-level adds defense-in-depth.

### Expected Features

**Table stakes (must have for beta):**

- **Rate limiting on all endpoints**: OWASP API Top 10 - Lack of Resources and Rate Limiting. 100 req/10min for auth endpoints, sliding window algorithm. Per-IP, per-user, and per-token limits.

- **JWT short expiration + refresh rotation**: 15-minute access tokens, 7-day refresh tokens. Refresh token rotation on use (issue new, invalidate old). Reuse detection triggers full token revocation.

- **Input validation (server-side)**: All user input validated server-side. Sanitize output. Use parameterized queries (already implemented with pg).

- **HTTPS with TLS 1.2+**: Railway provides by default. Certificate pinning recommended for mobile apps to prevent MITM attacks.

- **GDPR data subject rights**: Right to access (data export as JSON), right to erasure (hard delete within 30 days, including R2 photos), right to rectification. Required for EU users, Apple App Store mandate.

- **Granular consent collection**: Separate consent for essential (account), location, analytics, marketing. Pre-checked boxes invalid under GDPR. Record timestamp + policy version.

- **In-app account deletion**: Apple requirement since 2022, GDPR Article 17. Initiate from Settings, confirm intent, complete within 14 days. Cascade to all services including R2 photo storage.

- **Report & block functionality**: Apple Guideline 1.2 for user-generated content. Verify report button accessible, block is immediate, categories cover harassment/abuse/safety.

- **Privacy policy (accessible in-app)**: Link in Settings + App Store metadata. Plain language. Cover: what collected, why, how long, who receives, user rights.

- **Authentication flow tests**: Critical path - auth failures lock users out. Test: signup, login, password reset, token refresh, logout, session expiry. Happy + unhappy paths.

- **Payment flow tests**: RevenueCat integration verification. Test: purchase, restore, entitlement check, webhook handling, subscription expiry.

- **Error tracking**: Sentry for backend (upgrade to 10.34.0), Firebase Crashlytics for mobile (already integrated). Error grouping, alerting, stack traces.

- **API uptime monitoring**: Health check endpoints (/health on each service). External monitoring (Better Uptime, Railway alerts). 99.9% uptime target.

**Competitive differentiators (should have):**

- **Content moderation system**: AI triage for high-severity reports (assault, threats, minors). Auto-action for clear violations (explicit content, slurs). Human review for context-dependent cases.

- **Device fingerprinting for ban enforcement**: Android ID, IDFA/GAID, hardware characteristics. Prevents trivial account recreation by banned users. Critical given Match Group lawsuit evidence of serial offenders returning.

- **Photo hashing for ban detection**: Perceptual hash profile photos, check against banned photo database. Detects banned users using same photos on new accounts.

- **Deepfake detection**: Dating industry has highest ID fraud rate (8.9%) of all sectors. Add deepfake detection alongside AWS Rekognition. Require randomized verification actions, check for AI-generation artifacts.

- **Behavioral bot detection**: Flag rapid matching, copy-paste messaging, external link sharing. Honeypot fields in registration. Phone number reputation scoring.

**Defer to v2+ (post-beta):**

- **Certificate pinning**: Can cause issues if certificates rotate. Implement with backup pins once infrastructure stabilizes.

- **Penetration testing**: Professional security audit recommended before major scale, not blocking for beta if security audit complete.

- **End-to-end encryption**: Signal Protocol level complexity. Conflicts with content moderation requirements. Users expect platform-readable messages for safety reporting.

- **Bug bounty program**: Start after basic security is solid. HackerOne, Bugcrowd. Not appropriate during beta phase.

### Architecture Approach

Production-readiness for existing applications requires a specific ordering that minimizes risk while maximizing value. The fundamental principle: **fix what you have before adding what you need**.

**Major phases (dependency-ordered):**

1. **Security Hardening** — Exploitable vulnerabilities must close before deployment. No dependencies; blocks all other work. Includes: fix critical/high security issues, enable TLS validation, require encryption keys, rotate secrets, dependency vulnerability scan. Estimated: 1-2 weeks.

2. **GDPR Compliance** — Legal requirement before beta users. Depends on security (encryption enforcement). Includes: data mapping, consent flows, data subject rights endpoints, retention policies, privacy-by-design review. Estimated: 2-3 weeks.

3. **Testing Infrastructure** — Enables safe change for remaining work. Depends on security (don't test insecure code) and partial GDPR (consent flows need tests). Includes: characterization tests for critical paths, CI pipeline with test gates, security regression tests. Pattern: incremental coverage, not 100% coverage. Estimated: 2-3 weeks.

4. **Bug Fixes** — Code changes require test coverage to prevent regressions. Depends on testing infrastructure. Workflow: write failing test, fix bug, test passes, never regress. Estimated: 2-3 weeks.

5. **Monitoring & Observability** — Visibility into production after hardening. Depends on security (don't log secrets), GDPR (don't log PII), bug fixes (reduce noise). Includes: structured logging, health checks, error tracking, metrics, dashboards, alerting. Pattern: domain-oriented observability. Estimated: 2-3 weeks.

6. **Documentation** — Captures decisions from completed phases. Depends on all previous phases (document what exists, not what's planned). Includes: security docs, runbooks, architecture decision records, deployment docs. Estimated: 1 week.

**Critical path dependencies:**

```
Security → GDPR → Testing → Bug Fixes → Monitoring → Documentation
```

Parallel opportunity: GDPR consent flow implementation can run parallel with Testing infrastructure setup (no conflicts).

**Anti-patterns to avoid:**

- **Adding monitoring before security**: Logs may capture secrets/PII, monitoring insecure code alerts on breaches after they happen.
- **Testing everything before fixes**: Delays critical security work, tests may need rewriting after security changes.
- **Big-bang refactoring**: Introduces new bugs, delays production-readiness. Use characterization tests and incremental changes.
- **Skipping GDPR until later**: Legal liability from day one, retrofitting consent is harder than building in.
- **Adding features during hardening**: New features introduce bugs and security surface. Feature freeze during production-readiness.

### Critical Pitfalls

Based on documented dating app breaches and regulatory actions from 2024-2025:

1. **Exposed API keys in app code** — M.A.D Mobile apps (April 2025) exposed 1.5M explicit images because API keys and encryption passwords were in app code. Prevention: Platform-specific secure storage (Keychain/EncryptedSharedPreferences), backend secrets via environment variables, pre-commit hooks (gitleaks), cloud storage requires authentication. **Phase: Pre-launch security audit.**

2. **Broken object-level authorization (BOLA/IDOR)** — Feeld (November 2025) allowed access to other users' chats, profile modification, photos without authentication. Prevention: Authorization middleware verifying resource ownership on EVERY endpoint, user ID from JWT not request parameters, automated API security testing in CI, row-level security in queries. **Phase: Pre-launch security audit.**

3. **GDPR special category data violations** — Grindr fined 6.5M EUR (2024, upheld) for sharing GPS location and user data without valid consent. Merely using Grindr "strongly indicates sexual orientation" making ALL data special category. Prevention: Explicit granular consent (not bundled), no location data to third parties including analytics, data minimization, right to erasure within 30 days, Data Protection Impact Assessment. **VLVT risk: After Hours Mode implies sexual/romantic context, same as Grindr ruling.** **Phase: Pre-launch compliance review.**

4. **Ban evasion through trivial account recreation** — Match Group (December 2025) lawsuits showed banned users (including sexual assault reports) could immediately create new accounts with same name/photos/birthday. Prevention: Device fingerprinting, photo perceptual hashing against banned database, face verification comparison, phone reputation scoring, ban the verified identity not the email. **VLVT advantage: KYCAid + Rekognition creates persistent identity.** **Phase: Pre-launch safety systems.**

5. **Trilateration attack via API distance data** — Researchers (2024) pinpointed user locations within 2-111 meters on Grindr, Hinge, Bumble by spoofing GPS and measuring distance changes. Prevention: Round coordinates to 3 decimals (~1km) server-side, add random jitter ±500m, quantize distance into buckets ("<1km", "1-5km"), randomize ordering within buckets, rate limit location queries (10/min), detect rapid location changes. **Phase: Pre-launch security audit.**

6. **Deepfake bypass of identity verification** — Dating industry has highest ID fraud rate (8.9%) in 2024, higher than finance (2.7%). Scammers use DeepFaceLive/Magicam to pass live selfie checks. Prevention: ISO 30107-3 compliant liveness, deepfake detection models, randomized verification actions, AI-generation detection on photos, block virtual camera apps, periodic re-verification. **AWS Rekognition caution: bias issues, use 99%+ threshold + human review.** **Phase: Verification system hardening.**

7. **Chat history destruction enables repeat offenders** — Match Group lawsuits (December 2025) cited "unmatch-before-report" as defective design. Serial offenders unmatch immediately, erasing evidence. Prevention: Preserve chat server-side 30-90 days post-unmatch (encrypted, access-restricted), allow reporting after unmatch, flag rapid unmatch patterns, "shadow archive" for safety team. **VLVT consideration: server-side retention compatible with ephemeral UI.** **Phase: Safety systems implementation.**

8. **PII in logs and error messages** — Default logging captures full request/response bodies exposing emails, locations, messages, tokens. Prevention: Structured logging with explicit field allowlists (never log request bodies by default), PII redaction middleware, separate correlation IDs from user IDs, 30-day log retention then aggregate/delete, error tracking PII scrubbing. **Phase: Pre-launch security audit.**

## Implications for Roadmap

Based on combined research, production readiness should be structured into 6 sequential phases with clear dependencies:

### Phase 1: Security Hardening

**Rationale:** Security vulnerabilities are exploitable immediately upon deployment. Every day the app runs without fixes is a day attackers could compromise user data. For a dating app handling location and intimate messages, this is especially critical. No dependencies - security work blocks all other production work.

**Delivers:**
- Critical/high security issues closed
- TLS certificate validation enabled (Railway DB connections)
- Encryption keys required at startup (KYCAID)
- Secrets rotated and audited
- Dependency vulnerabilities resolved
- Authorization middleware on all endpoints
- Location data fuzzing (3 decimals + jitter)
- Rate limiting verified

**Addresses (from FEATURES.md):**
- Rate limiting on all endpoints (table stakes)
- JWT algorithm validation (table stakes)
- HTTPS everywhere with TLS 1.2+ (table stakes)
- Input validation server-side (table stakes)
- Error handling without info leak (table stakes)

**Avoids (from PITFALLS.md):**
- Exposed API keys (#1 critical)
- BOLA/IDOR vulnerabilities (#2 critical)
- Trilateration attacks (#5 critical)
- PII in logs (#8 critical)

**Effort estimate:** 1-2 weeks

**Research needed:** No - security patterns well-documented, existing findings provide specific issues.

---

### Phase 2: GDPR Compliance Verification

**Rationale:** Legal compliance is hard requirement before beta users. GDPR fines are percentage-of-revenue based. User trust in dating app requires privacy protection. After Hours Mode creates special category data risk (same as Grindr ruling).

**Delivers:**
- Data mapping and inventory documented
- Granular consent UI + backend storage
- Data subject rights endpoints (access, delete, export)
- Retention policy definitions + enforcement
- Privacy-by-design review completed
- R2 photo cleanup verified
- Location precision redaction

**Addresses (from FEATURES.md):**
- Privacy policy accessible in-app (table stakes)
- Granular consent collection (table stakes)
- Right to access - data export (table stakes)
- Right to erasure - account deletion (table stakes)
- Data minimization audit (table stakes)
- Data retention policy (table stakes)
- Location data consent (table stakes)

**Avoids (from PITFALLS.md):**
- GDPR special category data violations (#3 critical)
- Right to erasure implementation gaps (#10 moderate)

**Depends on:** Phase 1 (encryption requirements must be enforced first)

**Effort estimate:** 2-3 weeks

**Research needed:** No - GDPR requirements well-defined, implementation patterns verified.

---

### Phase 3: Testing Infrastructure

**Rationale:** Testing enables safe change for bug fixes and future development. Security and compliance work is well-scoped and can be verified manually. Testing infrastructure then protects all remaining work from regressions. Pattern: incremental coverage, not 100% - characterization tests for code you're about to change, tests before fixing bugs, coverage gates on new code only.

**Delivers:**
- CI pipeline running on all PRs
- Characterization tests for critical paths (auth, profile, matching, messaging)
- Security regression tests (auth, authorization, input validation)
- Coverage reporting and gating (80% on new code)
- Database migration test harness
- Test data management

**Addresses (from FEATURES.md):**
- Authentication flow tests (table stakes)
- Payment flow tests (table stakes)
- Match flow tests (table stakes)
- Chat flow tests (table stakes)
- Safety flow tests (table stakes)
- Data deletion tests (table stakes)
- Integration tests API (table stakes)

**Avoids:** Future regressions across all pitfall categories

**Depends on:** Phase 1 (don't test insecure code), Phase 2 partial (consent flows will need tests)

**Effort estimate:** 2-3 weeks

**Research needed:** No - testing patterns well-established (Jest/Supertest for backend, Patrol for Flutter).

---

### Phase 4: Bug Fixes & Incomplete Features

**Rationale:** Bug fixes require code changes. Code changes without test coverage risk regressions. With test infrastructure from Phase 3, bugs can be fixed safely using test-first workflow: write failing test, fix bug, test passes, never regress.

**Delivers:**
- Known bugs triaged and prioritized
- Critical bugs fixed with tests proving the fix
- Error handling reviewed for graceful failures
- Incomplete features completed or removed
- No regressions (all tests passing)

**Addresses:** Issues from BUGS_AND_ISSUES_FINDINGS.md, INCOMPLETE_FEATURES_FINDINGS.md

**Avoids:** Introducing new bugs while fixing existing ones

**Depends on:** Phase 3 (tests prove bugs are fixed)

**Effort estimate:** 2-3 weeks

**Research needed:** No - bug-specific, test-first workflow is standard practice.

---

### Phase 5: Monitoring & Observability

**Rationale:** Monitoring reveals problems in production, but monitoring insecure/non-compliant/buggy code creates noise and liability. With security, compliance, and bugs addressed, monitoring becomes valuable for operations.

**Delivers:**
- Structured logging with JSON format, correlation IDs, PII redaction
- Health check endpoints (liveness/readiness)
- Error tracking via Sentry (upgraded to 10.34.0)
- Metrics collection (latency, throughput, error rates)
- Dashboards for service health, user activity, API performance
- Alerting on critical thresholds

**Addresses (from FEATURES.md):**
- Error tracking backend + mobile (table stakes)
- API uptime monitoring (table stakes)
- API performance/latency tracking (table stakes)
- Authentication failure alerts (table stakes)
- Database metrics (table stakes)

**Avoids (from PITFALLS.md):**
- PII in logs (already addressed in Phase 1, but reinforced here)

**Depends on:** Phase 1 (don't log secrets), Phase 2 (don't log PII), Phase 4 (reduce noise)

**Effort estimate:** 2-3 weeks

**Research needed:** No - Winston configuration patterns verified, Railway monitoring documented.

---

### Phase 6: Safety Systems & Operations Polish

**Rationale:** Beta launch requires robust safety systems to protect users and prevent the serial offender scenarios documented in Match Group lawsuits. Operational documentation captures decisions from previous phases.

**Delivers:**
- Chat history server-side preservation (30-90 days post-unmatch)
- Reporting available for unmatched users
- Device fingerprinting for ban enforcement
- Photo perceptual hashing against banned user database
- Content moderation queue with AI triage
- Deepfake detection enhancement
- Security documentation and runbooks
- Architecture decision records
- Deployment and rollback documentation

**Addresses (from FEATURES.md):**
- Content moderation system (differentiator)
- Device fingerprinting for bans (differentiator)
- Photo hashing for ban detection (differentiator)
- Deepfake detection (differentiator)
- Behavioral bot detection (differentiator)

**Avoids (from PITFALLS.md):**
- Ban evasion through trivial recreation (#4 critical)
- Deepfake bypass of verification (#6 critical)
- Chat history destruction (#7 critical)
- Content moderation at scale (#11 moderate)
- Bot proliferation (#9 moderate)

**Depends on:** Phase 5 (monitoring provides signals for abuse detection), all phases (documentation captures completed work)

**Effort estimate:** 2-3 weeks

**Research needed:** Moderate - deepfake detection integration with AWS Rekognition, perceptual hashing library selection, content moderation AI service evaluation.

---

### Phase Ordering Rationale

- **Security first** prevents exploitation during remaining work. Dating apps are high-value targets (location, photos, messages).
- **GDPR second** because legal liability starts day one of beta. After Hours Mode creates special category data requiring explicit consent before data collection.
- **Testing third** enables safe changes for bug fixes. Manual verification acceptable for small security/compliance scope.
- **Bug fixes fourth** leverage test coverage to prevent regressions. Test-first workflow ensures bugs stay fixed.
- **Monitoring fifth** provides production visibility after hardening. Monitoring insecure/non-compliant code creates liability.
- **Safety systems + docs last** depend on monitoring signals for abuse detection, capture completed decisions.

**Parallel opportunities:**
- Phase 2 consent UI can overlap with Phase 3 test infrastructure (no conflicts)
- Phase 5 monitoring setup can begin while Phase 4 bug fixes are in code review

**Feature freeze:** No new features during production-readiness. Hardening only. New features introduce bugs and security surface.

### Research Flags

**Needs deeper research during phase planning:**

- **Phase 6 (Safety Systems):** Deepfake detection integration specifics, perceptual hashing library evaluation, content moderation AI service selection. Current research provides direction but not implementation details.

**Standard patterns (skip research-phase):**

- **Phase 1 (Security):** Security patterns well-documented in OWASP, existing findings provide specific issues.
- **Phase 2 (GDPR):** GDPR requirements well-defined, implementation patterns verified via F-Secure API spec.
- **Phase 3 (Testing):** Jest/Supertest/Patrol setup documented, incremental coverage pattern from "Working Effectively with Legacy Code."
- **Phase 4 (Bug Fixes):** Bug-specific, test-first workflow is standard practice.
- **Phase 5 (Monitoring):** Winston configuration verified, Railway monitoring documented, Sentry upgrade straightforward.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommended tools verified via official npm packages, pub.dev, and vendor documentation. Version compatibility confirmed. Recent updates (Snyk 1.1302.0, Patrol 3.11.0, Sentry 10.34.0) documented. |
| Features | HIGH | Based on official OWASP Mobile Top 10 2024, GDPR articles, Apple App Store guidelines, Google Play policies. Dating-app-specific requirements verified through enforcement examples (Grindr fine, Match lawsuits). |
| Architecture | HIGH | Production-readiness ordering based on multiple authoritative sources (O'Reilly "Production-Ready Microservices", Mercari checklist, Martin Fowler domain observability). Dependency ordering well-established. |
| Pitfalls | HIGH | All critical pitfalls documented with real incidents from 2024-2025 (M.A.D Mobile, Feeld, Grindr, Match Group). Prevention strategies verified against OWASP, GDPR guidance, security research papers. |

**Overall confidence:** HIGH

Research based on official sources (OWASP, GDPR articles, platform guidelines), recent documented incidents (2024-2025 breaches and fines), and verified technology documentation. Dating app-specific risks well-documented through regulatory actions and lawsuits.

### Gaps to Address

**VLVT-specific validations needed during implementation:**

- **After Hours Mode GDPR implications:** Explicit legal review of consent flows and data processing under Article 9 special category data. Research shows pattern (Grindr ruling), but lawyer should validate implementation.

- **AWS Rekognition bias mitigation:** Research documents known bias issues (higher error rates for darker-skinned women). Implementation must include 99%+ confidence threshold + human review pipeline, not default 80% threshold.

- **KYCAid encryption enforcement:** Research recommends requiring encryption key at startup. Verify existing KYCAid integration has encryption enabled and no plaintext storage path remains.

- **Railway database backup restoration testing:** Research confirms backup templates exist. Implementation must include actual restoration test from backup to verify recovery process works.

- **Test user separation from production:** Research flags cold start risk. Verify test accounts (google_test001-020) cannot appear to real users in discovery/matching.

**Technical decisions deferred to implementation:**

- **Winston vs Pino:** Keep Winston (already integrated) unless performance becomes critical. Decision point: if log volume exceeds 1000 events/second, benchmark Pino migration.

- **Certificate pinning timing:** Research recommends post-beta due to rotation complexity. Revisit after infrastructure stabilizes (3-6 months post-launch).

- **Penetration testing vendor:** Research suggests professional pentest before major scale. Decision point: engage after Phase 1 security audit complete, before public beta (not blocking for private beta).

## Sources

### Security Research (HIGH confidence)
- [OWASP Mobile Top 10 2024 - Official](https://owasp.org/www-project-mobile-top-10/2023-risks/)
- [Snyk npm package](https://www.npmjs.com/package/snyk) — Dependency scanning, version ^1.1302.0
- [eslint-plugin-security](https://github.com/eslint-community/eslint-plugin-security) — Static code security
- [JWT Best Practices 2025](https://jwt.app/blog/jwt-best-practices/) — RS256 migration
- [Socket.IO Security](https://ably.com/topic/socketio) — Auth middleware patterns
- [Check Point: Geolocation Risks](https://research.checkpoint.com/2024/the-illusion-of-privacy-geolocation-risks-in-modern-dating-apps/) — Trilateration attacks
- [FireTail: Feeld API Vulnerabilities](https://www.firetail.ai/blog/feeld-dating-app-api) — BOLA incidents
- [Cybernews: Dating Apps Leak Photos](https://cybernews.com/security/ios-dating-apps-leak-private-photos/) — M.A.D Mobile breach

### Testing Frameworks (HIGH confidence)
- [Patrol pub.dev](https://pub.dev/packages/patrol) — Flutter E2E testing v3.11.0
- [Patrol Documentation](https://patrol.leancode.co/) — Native UI interaction
- [Jest Documentation](https://jestjs.io/) — Node.js testing (already in stack)
- [testcontainers](https://www.npmjs.com/package/testcontainers) — Integration test containers
- [Flutter Test Coverage](https://codewithandrea.com/articles/flutter-test-coverage/) — Coverage reporting

### Monitoring & Observability (HIGH confidence)
- [Sentry Node.js SDK](https://docs.sentry.io/platforms/node/) — Error tracking
- [@sentry/node npm](https://www.npmjs.com/package/@sentry/node) — Version 10.34.0
- [Railway Monitoring](https://docs.railway.com/guides/monitoring) — Platform metrics
- [Railway PostgreSQL Backups](https://blog.railway.com/p/postgre-backup) — Backup templates
- [Node.js Logging Best Practices](https://betterstack.com/community/guides/logging/nodejs-logging-best-practices/) — Winston configuration

### GDPR Compliance (HIGH confidence)
- [GDPR Article 9 - Special Category Data](https://gdprhub.eu/Article_9_GDPR) — After Hours risk
- [GDPR Article 17 - Right to Erasure](https://gdpr-info.eu/art-17-gdpr/) — Deletion requirements
- [GDPR Subject Rights API (F-Secure)](https://github.com/F-Secure/gdpr-subject-rights-api) — DSAR endpoints
- [GDPR Compliance for Apps 2025](https://gdprlocal.com/gdpr-compliance-for-apps/) — Implementation guide
- [Grindr GDPR Fine - TechCrunch](https://techcrunch.com/2021/12/15/grindr-final-gdpr-fine/) — Special category precedent
- [NOYB: Grindr Fine Upheld](https://noyb.eu/en/norwegian-court-confirms-eu-57-million-fine-grindr) — Appeal confirmation

### App Store Guidelines (HIGH confidence)
- [App Store Review Guidelines - Apple](https://developer.apple.com/app-store/review/guidelines/) — Official policies
- [Google Play Developer Policy](https://support.google.com/googleplay/android-developer/answer/16810878) — Platform requirements
- [Dating Apps Age-Gating - Google Play](https://support.google.com/googleplay/android-developer/answer/16838200) — Age verification

### Industry Incidents (HIGH confidence)
- [The Markup: Dating App Cover-Up](https://themarkup.org/investigations/2025/02/13/dating-app-tinder-hinge-cover-up) — Match Group ban evasion
- [NPR: Match Group Investigation](https://www.npr.org/2025/02/21/nx-s1-5301046/investigation-finds-online-dating-conglomerate-slow-to-ban-users-accused-of-assault) — Safety failures
- [Appknox: Tea App Breach](https://www.appknox.com/blog/tea-app-data-breach-security-flaws-analysis-appknox) — Firebase misconfiguration
- [Sumsub: Deepfakes on Dating Apps](https://sumsub.com/newsroom/one-in-five-single-brits-have-already-been-duped-by-deepfakes-on-dating-apps/) — ID fraud rates

### Architecture Patterns (HIGH confidence)
- [Production-Ready Microservices (O'Reilly)](https://www.oreilly.com/library/view/production-ready-microservices/9781491965962/app01.html) — Phase ordering
- [Mercari Production Readiness Checklist](https://github.com/mercari/production-readiness-checklist) — Microservices patterns
- [Domain-Oriented Observability (Fowler)](https://martinfowler.com/articles/domain-oriented-observability.html) — Monitoring patterns
- [Working Effectively with Legacy Code](https://booksummaryproject.com/book53) — Incremental testing

### VLVT Codebase Analysis (HIGH confidence)
- `SECURITY_FINDINGS.md` — Current security state
- `DATA_PROTECTION_FINDINGS.md` — GDPR compliance gaps
- `.planning/codebase/CONCERNS.md` — Architectural concerns
- `BUGS_AND_ISSUES_FINDINGS.md` — Known bugs
- `INCOMPLETE_FEATURES_FINDINGS.md` — Missing functionality

---

**Research completed:** 2026-01-24
**Ready for roadmap:** Yes
**Next step:** Roadmap creation using phase structure above
