# Feature Landscape: Production-Ready Dating App for Beta Launch

**Domain:** Dating app production readiness (security, compliance, quality)
**Researched:** 2026-01-24
**Overall Confidence:** HIGH (based on official OWASP, GDPR, and App Store documentation)

## Executive Summary

A production-ready dating app for beta launch in 2025/2026 must meet three critical standards: security (OWASP Mobile Top 10 compliance), privacy (GDPR for EU, CCPA for California), and platform requirements (Apple App Store and Google Play Store policies). Dating apps face heightened scrutiny due to handling location data, photos, and communication between strangers.

VLVT's current state has gaps in all three areas: no formal security review, minimal test coverage, no monitoring infrastructure, and unknown GDPR compliance status. This research identifies the specific features and capabilities required for beta launch with real users.

---

## Table Stakes (Must Have for Beta)

Features that are mandatory for launch. Missing any of these creates legal risk, platform rejection, or user safety issues.

### Security Requirements

| Feature | Why Required | Complexity | VLVT Status | Implementation Notes |
|---------|--------------|------------|-------------|---------------------|
| **Rate Limiting (All Endpoints)** | OWASP M8 - Prevents brute force, credential stuffing, DoS. OWASP rates "Lack of Resources and Rate Limiting" as top API risk. | Medium | Partial (exists but needs audit) | Per-IP, per-user, per-token limits. 100 req/10min for auth endpoints. Sliding window algorithm preferred. |
| **JWT Short Expiration** | Industry standard is 5-15 minute access tokens. Long-lived tokens increase breach impact. | Low | Unknown | 15-minute access tokens, 7-day refresh tokens, secure storage (iOS Keychain, Android EncryptedSharedPreferences). |
| **JWT Algorithm Validation** | OWASP M10 - Algorithm confusion attacks. Never trust header algorithm claim. | Low | Unknown | Explicitly verify RS256/ES256, reject "none" algorithm, validate issuer/audience claims. |
| **HTTPS Everywhere** | OWASP M5 - Insecure Communication. TLS 1.2+ mandatory. | Low | Likely (Railway default) | Certificate pinning for mobile apps recommended. Reject HTTP entirely. |
| **Input Validation (All Inputs)** | OWASP M4 - Insufficient Input/Output Validation. Prevents injection, XSS, data corruption. | Medium | Partial | Server-side validation for all user input. Sanitize output. Use parameterized queries (already pg). |
| **Secure Credential Storage** | OWASP M9 - Insecure Data Storage. Mobile-specific: no plaintext tokens. | Low | Implemented (flutter_secure_storage) | Verify using iOS Keychain, Android EncryptedSharedPreferences. No localStorage/sessionStorage. |
| **Authentication Hardening** | OWASP M3 - Insecure Authentication. Account lockout, 2FA option, session management. | High | Partial | Lockout after 5 failed attempts (15-min). Email-based 2FA minimum. Session invalidation on password change. |
| **Password Security** | Industry standard: bcrypt with cost factor 12+. Min 8 chars with complexity. | Low | Implemented (bcrypt) | Verify cost factor. Implement password breach check (HaveIBeenPwned API). |
| **Photo Upload Validation** | Prevent malicious file uploads. OWASP M4. | Medium | Partial (Sharp processing) | Validate MIME type AND magic bytes. Size limits (5MB). Strip EXIF (privacy). Virus scanning for production. |
| **Error Handling (No Info Leak)** | OWASP M8 - Verbose errors reveal system info to attackers. | Low | Unknown | Generic error messages to client. Detailed logging server-side only. Never expose stack traces. |
| **Dependency Vulnerability Scanning** | OWASP M2 - Inadequate Supply Chain Security. New in 2024 Top 10. | Low | Not implemented | npm audit / Snyk / Dependabot. Block deploy on critical vulnerabilities. |

### GDPR Compliance Requirements

| Feature | Why Required | Complexity | VLVT Status | Implementation Notes |
|---------|--------------|------------|-------------|---------------------|
| **Privacy Policy (Accessible)** | GDPR Art 13-14. Required before data collection. App Store rejection if missing. | Low | Unknown | Link in app settings + App Store metadata. Plain language. Must cover: what collected, why, how long, who receives, user rights. |
| **Consent Collection (Granular)** | GDPR Art 6-7. Explicit consent for sensitive processing. Location = high sensitivity context. | Medium | Unknown | Separate consent for: essential (account), location, analytics, marketing. Record timestamp + version. |
| **Right to Access (Data Export)** | GDPR Art 15. Users can request all data about them. 30-day response deadline. | High | Not implemented | Export: profile, photos, matches, messages, location history, analytics. JSON or machine-readable format. |
| **Right to Erasure (Account Deletion)** | GDPR Art 17. Users can delete account AND data. Apple App Store requires in-app deletion. | High | Unknown | Delete from: users, profiles, photos (S3), matches, messages. Notify third parties (analytics). Keep audit log only. |
| **Data Minimization** | GDPR Art 5. Only collect what's necessary. Dating apps often over-collect. | Medium | Unknown | Audit data collected vs used. Remove unnecessary fields. Justify each data point. |
| **Data Retention Policy** | GDPR Art 5. Data kept only as long as necessary. Must define retention periods. | Medium | Not implemented | Define: active account, inactive (12mo delete?), messages (30 days for moderation), analytics (rolling window). |
| **Location Data Consent** | Location is "highly sensitive context" per GDPR. Explicit opt-in required. | Medium | Partial (permission_handler) | Separate location consent dialog. Clear explanation of use. Easy to revoke. Store consent timestamp. |
| **Age Verification** | Dating apps require 18+. App Store new 2025 rules. Google Play requires age-gating. | Medium | Unknown | Date of birth collection + server validation. Consider ID verification integration for high-risk regions. |
| **Data Breach Notification** | GDPR Art 33-34. 72-hour notification to authority. User notification if high risk. | Low (process) | Not implemented | Incident response plan. Authority contact info (ICO for UK, CNIL for France, etc.). Template notifications. |

### App Store Compliance Requirements

| Feature | Why Required | Complexity | VLVT Status | Implementation Notes |
|---------|--------------|------------|-------------|---------------------|
| **In-App Account Deletion** | Apple requirement since 2022. Rejection guaranteed without it. | Medium | Unknown | Initiate deletion from Settings. Confirm intent. Complete within 14 days max. |
| **Report & Block Functionality** | Apple Guideline 1.2. Required for user-generated content apps. | Low | Implemented | Verify: report button accessible, block is immediate, categories cover key issues. |
| **Content Moderation System** | Apple Guideline 1.2. Must filter objectionable content. | High | Partial | Keyword filtering (basic). AI moderation for photos (nude detection). Human review queue for reports. |
| **Sign in with Apple** | Required if offering any third-party login (Google). Apple Guideline 4.8. | Medium | Unknown | Must offer alongside Google Sign-In. Privacy-preserving email relay support. |
| **Privacy Nutrition Label** | App Store requirement. Declare all data collected and purposes. | Low | Unknown | Complete App Store Connect privacy questionnaire accurately. Update when data practices change. |
| **Demo Account for Review** | Apple requires test credentials for review. Rejection if app can't be tested. | Low | Available (test users) | Provide test account in review notes. Ensure test account has full access. |
| **18+ Age Rating** | Dating apps must declare mature content. New age rating options in 2025. | Low | Unknown | Declare 18+ in App Store Connect. Enable age-restriction API if targeting EU. |

### Testing Requirements

| Feature | Why Required | Complexity | VLVT Status | Implementation Notes |
|---------|--------------|------------|-------------|---------------------|
| **Authentication Flow Tests** | Critical path. Auth failures = users locked out. | Medium | Minimal | Test: signup, login, password reset, token refresh, logout, session expiry. Happy + unhappy paths. |
| **Payment Flow Tests** | Critical path. Revenue depends on it. RevenueCat integration. | Medium | Minimal | Test: purchase, restore, entitlement check, webhook handling, subscription expiry. |
| **Match Flow Tests** | Core product. Matching failures = product doesn't work. | Medium | Minimal | Test: discovery, swipe (or auto-match), match creation, notification, chat availability. |
| **Chat Flow Tests** | Core product. Messaging is primary user interaction. | Medium | Minimal | Test: send message, receive message, Socket.IO connection, reconnection, ephemeral cleanup. |
| **Safety Flow Tests** | Critical for trust. Block/report must work perfectly. | Medium | Minimal | Test: block (immediate removal), report (submission), block persistence, bidirectional block. |
| **Data Deletion Tests** | GDPR compliance. Must actually delete data. | Medium | Not implemented | Test: account deletion removes all data, third-party notification, audit log retention only. |
| **Integration Tests (API)** | End-to-end flows across services. | High | Minimal | Test: auth -> profile -> discovery -> match -> chat flows. Service-to-service auth. |
| **Load Testing (Basic)** | Beta may have 100-1000 users. Infrastructure must handle. | Medium | Not implemented | Test: 100 concurrent users, 10 req/sec sustained, Socket.IO connection limits. |

### Monitoring Requirements

| Feature | Why Required | Complexity | VLVT Status | Implementation Notes |
|---------|--------------|------------|-------------|---------------------|
| **Error Tracking** | Know when things break in production. | Low | Firebase Crashlytics (mobile) | Add backend error tracking: Sentry or similar. Error grouping, alerting, stack traces. |
| **API Monitoring (Uptime)** | Know when services are down. 99.9% uptime target. | Low | Not implemented | Health check endpoints. External monitoring (UptimeRobot, Better Uptime). Alert on downtime. |
| **API Performance (Latency)** | Know when services are slow. p95 latency tracking. | Medium | Not implemented | APM: Datadog, New Relic, or open-source (Prometheus + Grafana). Alert on p95 > 500ms. |
| **Authentication Failures** | Detect brute force, credential stuffing. | Low | Winston logging (partial) | Log + alert on: 5+ failed logins same IP, 10+ failed logins same account. |
| **Rate Limit Hits** | Detect abuse attempts. | Low | Not implemented | Log when rate limits triggered. Alert on sustained limit hits from single source. |
| **Database Metrics** | Detect performance issues before they become outages. | Medium | Not implemented | Connection pool usage, query latency, slow query logging (>100ms). |

---

## Nice to Have (Post-Beta)

Features that improve security and compliance but are not blocking for beta launch.

### Enhanced Security

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| **Certificate Pinning** | Prevents MITM attacks even with compromised CA. | Medium | Can cause issues if certificates rotate. Implement with backup pins. |
| **Device Attestation** | OWASP M7 - Verify app integrity, detect rooted/jailbroken devices. | High | Google SafetyNet / Play Integrity API, Apple DeviceCheck. Consider for v2. |
| **Biometric Authentication** | Stronger than PIN. Better UX than password re-entry. | Medium | iOS Face ID / Touch ID, Android BiometricPrompt. Supplement to, not replacement for, password. |
| **End-to-End Encryption (Messages)** | Signal Protocol level security. | Very High | Complex key management. Users expect platform-readable for moderation. Conflict with safety. |
| **Web Application Firewall** | Block common attack patterns at edge. | Low (if using Cloudflare) | Cloudflare, AWS WAF, etc. Good defense-in-depth. |
| **Penetration Testing** | Professional security audit. Find vulnerabilities before attackers. | Low (effort), High (cost) | Engage for v2 or before major scale. Remediate findings. |
| **Bug Bounty Program** | Crowdsourced security testing. | Low | HackerOne, Bugcrowd. Start after basic security is solid. |

### Enhanced Compliance

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| **Cookie Consent (Web)** | GDPR/ePrivacy requirement for any web presence. | Medium | If you have a web app or marketing site. |
| **Data Processing Agreements** | GDPR Art 28. Contracts with processors (Firebase, AWS, etc.). | Low (effort), Medium (legal) | Required but often overlooked. Template DPAs available from vendors. |
| **Records of Processing Activities** | GDPR Art 30. Document all processing. | Medium | Spreadsheet or tool. Update when data practices change. |
| **Privacy Impact Assessment** | GDPR Art 35. Required for high-risk processing (dating app likely qualifies). | High | Consider before beta if targeting EU heavily. |
| **Children's Privacy (COPPA)** | US requirement if any chance of users under 13. | Medium | 18+ gate reduces risk, but consider explicit compliance. |

### Enhanced Monitoring

| Feature | Value | Complexity | Notes |
|---------|-------|------------|-------|
| **Real User Monitoring (RUM)** | Track actual user experience by geography, device, network. | Medium | Firebase Performance Monitoring (free), Datadog RUM (paid). |
| **Business Metrics Dashboard** | Track: DAU, MAU, match rate, message rate, premium conversion. | Medium | Custom dashboard. Mixpanel, Amplitude, or custom. |
| **Anomaly Detection** | ML-based detection of unusual patterns. | High | Datadog, New Relic AI features. Consider for scale. |
| **Distributed Tracing** | Track requests across microservices. Debug complex failures. | Medium | OpenTelemetry, Jaeger. Helpful at scale with 3+ services. |

---

## Anti-Patterns (Do NOT Do)

Features and practices to explicitly avoid. These create security vulnerabilities, compliance violations, or platform rejection.

### Security Anti-Patterns

| Anti-Pattern | Why Dangerous | What to Do Instead |
|--------------|---------------|-------------------|
| **Storing Secrets in Mobile App** | Extractable via reverse engineering. API keys, tokens visible. | Backend-for-Frontend pattern. Secrets on server only. |
| **Long-Lived Access Tokens** | Breach impact increases with token lifetime. | 15-minute access tokens + refresh tokens. |
| **Trusting Client-Side Validation** | Client can be modified. All validation bypassable. | Server-side validation for everything. Client validation is UX only. |
| **Verbose Error Messages** | "User not found" vs "Invalid credentials" reveals user existence. | Generic errors to client. Detailed logging server-side. |
| **Hardcoded Credentials in Code** | OWASP M1 - Improper Credential Usage. Found via GitHub scanning. | Environment variables. Secrets management (AWS Secrets Manager, etc.). |
| **Storing Passwords in Plaintext** | Single breach = all passwords exposed. | bcrypt with cost 12+. Never reversible encryption. |
| **SMS-Only 2FA** | SIM swapping, SS7 attacks. NIST deprecated for high-security. | Email + TOTP app option. SMS as fallback only. |
| **Ignoring Dependency Vulnerabilities** | Supply chain attacks increasing. Log4Shell, etc. | npm audit, Snyk, Dependabot. Block on critical. |

### Compliance Anti-Patterns

| Anti-Pattern | Why Dangerous | What to Do Instead |
|--------------|---------------|-------------------|
| **Pre-Checked Consent Boxes** | GDPR requires affirmative action. Pre-checked = invalid consent. | Default unchecked. User must actively check. |
| **Bundled Consent** | "Accept all" without granular options. Invalid under GDPR. | Separate consent for each purpose. Accept essential only as option. |
| **"Email Support to Delete"** | Apple rejects apps without in-app deletion. GDPR requires "without undue delay". | In-app account deletion. Automated or max 14 days manual. |
| **Keeping Data After Deletion Request** | GDPR violation. Significant fines possible. | Actual deletion from all systems. Keep only legally required audit logs. |
| **No Data Retention Policy** | GDPR requires defined retention. "Forever" is rarely justifiable. | Define retention periods. Automate deletion. |
| **Ignoring DSAR Requests** | Data Subject Access Requests legally required. 30-day deadline. | Process in place. Automated export preferred. |
| **Location Without Explicit Consent** | Location is high-sensitivity. Implicit consent insufficient. | Separate location permission dialog. Clear purpose explanation. |

### Testing Anti-Patterns

| Anti-Pattern | Why Dangerous | What to Do Instead |
|--------------|---------------|-------------------|
| **Manual Testing Only** | Not repeatable. Misses regressions. Slow feedback. | Automated tests for critical paths. CI/CD integration. |
| **Testing Happy Path Only** | Unhappy paths cause production incidents. | Error cases, edge cases, boundary conditions. |
| **No Production Monitoring** | Don't know when things break. Users discover bugs. | Error tracking, uptime monitoring, alerting. |
| **Testing in Production** | Users encounter bugs. Data corruption possible. | Staging environment. Feature flags for gradual rollout. |

### Platform Anti-Patterns

| Anti-Pattern | Why Dangerous | What to Do Instead |
|--------------|---------------|-------------------|
| **Hiding Premium Features in Review** | Apple detects. Rejection and potential ban. | Provide full access test account. Transparent review. |
| **Explicit Content Without Age Gate** | App Store/Play Store rejection. Potential legal issues. | 18+ rating declared. Age verification. |
| **Missing Report/Block** | Apple Guideline 1.2 violation. Rejection guaranteed. | Easy access report and block on all profiles/messages. |
| **Copying Competitor UI Exactly** | Apple 4.3 Design Spam. Dating apps face extra scrutiny. | Unique value proposition. Original design elements. |

---

## Feature Dependencies

```
SECURITY FOUNDATION
├── Rate Limiting (all services)
├── JWT Security (short expiry, algorithm validation)
├── Input Validation (all endpoints)
└── Error Handling (no info leak)
    │
    ├── AUTHENTICATION HARDENING
    │   ├── Account Lockout
    │   ├── Session Management
    │   └── 2FA Option
    │
    └── MONITORING FOUNDATION
        ├── Error Tracking (Sentry)
        ├── Uptime Monitoring
        └── Auth Failure Alerts

GDPR COMPLIANCE
├── Privacy Policy (accessible in-app)
├── Consent Collection (granular)
│   └── Consent Records (timestamp + version)
├── Age Verification (18+)
│
├── DATA SUBJECT RIGHTS
│   ├── Right to Access (data export)
│   └── Right to Erasure (account deletion)
│       └── Third-Party Notification
│
└── DATA GOVERNANCE
    ├── Data Minimization Audit
    ├── Retention Policy Definition
    └── Breach Notification Process

APP STORE COMPLIANCE
├── In-App Account Deletion (links to GDPR erasure)
├── Report & Block (already implemented)
├── Content Moderation System
├── Sign in with Apple
└── Privacy Nutrition Label

TESTING
├── Unit Tests (business logic)
├── Integration Tests (API flows)
│   ├── Auth Flow Tests
│   ├── Payment Flow Tests
│   ├── Match Flow Tests
│   ├── Chat Flow Tests
│   └── Safety Flow Tests
├── Data Deletion Tests (GDPR)
└── Load Tests (100+ concurrent users)
```

---

## Prioritized Implementation Order

Based on dependencies and risk, implement in this order:

### Phase 1: Security Foundation (Week 1-2)

1. **Rate Limiting Audit** - Verify all endpoints protected, appropriate limits
2. **JWT Security Review** - Expiration, algorithm validation, refresh flow
3. **Input Validation Audit** - All user inputs validated server-side
4. **Error Handling Review** - No info leaks in error responses
5. **Dependency Scan** - npm audit, fix critical vulnerabilities

### Phase 2: Monitoring & Observability (Week 2)

1. **Sentry Integration** (backend) - Error tracking with alerting
2. **Health Check Endpoints** - /health on each service
3. **Uptime Monitoring** - External service monitoring endpoints
4. **Authentication Failure Logging** - Alert on suspicious patterns

### Phase 3: GDPR Core Rights (Week 2-3)

1. **Privacy Policy** - Create and link in app
2. **Consent Collection** - Granular consent UI + backend storage
3. **Data Export** - User can download their data
4. **Account Deletion** - In-app deletion that actually deletes

### Phase 4: Testing (Week 3-4)

1. **Auth Flow Tests** - Complete happy + unhappy paths
2. **Payment Flow Tests** - RevenueCat integration verification
3. **Match Flow Tests** - Discovery through chat
4. **Safety Flow Tests** - Block and report work correctly
5. **Data Deletion Tests** - Verify GDPR compliance

### Phase 5: App Store Preparation (Week 4)

1. **Sign in with Apple** - If not already implemented
2. **Content Moderation** - Basic keyword filtering + photo moderation
3. **Privacy Nutrition Label** - Complete App Store questionnaire
4. **Demo Account** - Prepare test credentials for review

---

## Confidence Assessment

| Area | Confidence | Reasoning |
|------|------------|-----------|
| Security Requirements | HIGH | Based on OWASP Mobile Top 10 2024 (official source), verified JWT best practices from multiple authoritative sources. |
| GDPR Requirements | HIGH | Based on GDPR articles directly, GDPR.eu guidance, and dating-app-specific enforcement examples. |
| App Store Requirements | HIGH | Based on official Apple Developer Guidelines, recent 2025 updates documented in Apple Developer News. |
| Google Play Requirements | HIGH | Based on official Google Play Developer Policy, October 2025 policy update on age-gating. |
| Testing Requirements | MEDIUM | Based on general best practices. Specific coverage targets may need adjustment based on codebase. |
| Monitoring Requirements | MEDIUM | Based on industry standards. Tool selection may vary based on budget/preferences. |

---

## Sources

### OWASP Mobile Security
- [OWASP Mobile Top 10 2024 - Official](https://owasp.org/www-project-mobile-top-10/2023-risks/)
- [OWASP Mobile Top 10 2024 Guide - Astra](https://www.getastra.com/blog/mobile/owasp-mobile-top-10-2024-a-security-guide/)
- [OWASP Mobile Top 10 2024 - Indusface](https://www.indusface.com/blog/owasp-mobile-top-10-2024/)

### JWT Security
- [JWT Best Practices - Duende](https://duendesoftware.com/learn/best-practices-using-jwts-with-web-and-mobile-apps)
- [JWT Security Best Practices 2025 - JWT.app](https://jwt.app/blog/jwt-best-practices/)
- [OAuth for Mobile Apps - Curity](https://curity.io/resources/learn/oauth-for-mobile-apps-best-practices/)

### GDPR Compliance
- [GDPR Article 17 - Right to Erasure](https://gdpr-info.eu/art-17-gdpr/)
- [Right to be Forgotten Guide - GDPR.eu](https://gdpr.eu/right-to-be-forgotten/)
- [Privacy on Dating Sites - GDPR Local](https://gdprlocal.com/privacy-dating-sites-and-apps/)
- [GDPR Compliance for Apps 2025 - GDPR Local](https://gdprlocal.com/gdpr-compliance-for-apps/)

### Location Data & Privacy
- [Location Data Privacy Rules - Glance](https://thisisglance.com/learning-centre/what-privacy-rules-apply-to-location-data-collection)
- [Geolocation as Sensitive Data - IGS](https://www.informationgovernanceservices.com/articles/geolocation-the-new-sensitive-data/)
- [Dating Apps Privacy 2025 - PG Dating Pro](https://www.datingpro.com/blog/love-under-lock-and-key-how-modern-dating-apps-protect-user-privacy-in-2025/)

### App Store Guidelines
- [App Store Review Guidelines - Apple Developer](https://developer.apple.com/app-store/review/guidelines/)
- [App Store Review Guidelines 2025 Checklist - NextNative](https://nextnative.dev/blog/app-store-review-guidelines)
- [Dating App Approval Guide - jploft](https://www.jploft.com/blog/how-to-get-your-dating-app-approved-on-the-app-store)

### Google Play Store
- [Developer Program Policy - Google Play](https://support.google.com/googleplay/android-developer/answer/16810878?hl=en)
- [Dating Apps Age-Gating Requirements - Google Play](https://support.google.com/googleplay/android-developer/answer/16838200?hl=en)
- [Policy Announcement October 2025 - Google Play](https://support.google.com/googleplay/android-developer/answer/16550159?hl=en)

### Content Moderation
- [Dating App Safety & Chat Moderation - Stream](https://getstream.io/blog/dating-app-safety/)
- [Content Moderation Blueprint - developers.dev](https://www.developers.dev/tech-talk/content-moderation-in-dating-apps.html)
- [Content Moderation Strategies - PG Dating Pro](https://www.datingpro.com/blog/effective-strategies-for-content-moderation-for-dating-apps/)

### Monitoring & APM
- [APM Tools for Mobile Apps 2025 - Zee Palm](https://www.zeepalm.com/blog/apm-tools-mobile-apps)
- [Application Performance Monitoring - AWS](https://aws.amazon.com/what-is/application-performance-monitoring/)
- [APM Best Practices - Datadog](https://www.datadoghq.com/product/apm/)

### API Security
- [API Rate Limiting Best Practices 2025 - Zuplo](https://zuplo.com/learning-center/10-best-practices-for-api-rate-limiting-in-2025)
- [BFF Pattern for API Keys - GitGuardian](https://blog.gitguardian.com/stop-leaking-api-keys-the-backend-for-frontend-bff-pattern-explained/)
- [Mobile App Security Best Practices 2025 - isitdev](https://isitdev.com/mobile-app-security-best-practices-2025/)

### Testing
- [Mobile App Testing Best Practices 2025 - Wezom](https://wezom.com/blog/mobile-app-testing-best-practices-in-2025-how-to-deliver-quality-apps)
- [Beta Testing Guide - TestingXperts](https://www.testingxperts.com/blog/beta-testing)
- [Mobile App Release Checklist - NextNative](https://nextnative.dev/blog/mobile-app-release-checklist)
