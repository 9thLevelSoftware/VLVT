# VLVT

## What This Is

VLVT is a dating app with Flutter frontend and Node.js microservices backend, featuring After Hours Mode for time-boxed spontaneous connections. Production-hardened with resilient backend infrastructure, screen reader accessibility, polished navigation animations, and comprehensive security/GDPR compliance. Ready for staged public beta.

## Core Value

When beta users sign up, their data must be secure, their privacy protected, and the app must not fail in ways that expose them to harm or embarrassment.

## Requirements

### Validated

- ✓ User authentication (email/password, Apple Sign-In, Google Sign-In) -- v1.0
- ✓ JWT token management with refresh token rotation -- v1.0
- ✓ User profiles with photos and bio -- v1.0
- ✓ Photo upload with Sharp processing and R2 storage -- v1.0
- ✓ Profile discovery with geo-proximity filtering -- v1.0
- ✓ Swipe-based matching (like/pass) -- v1.0
- ✓ Real-time messaging via Socket.IO -- v1.0
- ✓ Typing indicators and read receipts -- v1.0
- ✓ Push notifications via Firebase -- v1.0
- ✓ RevenueCat subscription management (premium/free tiers) -- v1.0
- ✓ User blocking and reporting -- v1.0
- ✓ ID verification via KYCAid -- v1.0
- ✓ Face verification via AWS Rekognition -- v1.0
- ✓ After Hours Mode with auto-matching -- v1.0
- ✓ Ephemeral chat with mutual save -- v1.0
- ✓ Location fuzzing for privacy -- v1.0
- ✓ TLS validation on all connections (documented Railway limitation) -- v1.1
- ✓ KYCAID data encryption at rest -- v1.1
- ✓ Dependency audit (0 critical/high vulnerabilities) -- v1.1
- ✓ BOLA/IDOR protection on all 60 endpoints -- v1.1
- ✓ Rate limiting on auth endpoints -- v1.1
- ✓ No hardcoded secrets in codebase -- v1.1
- ✓ PII scrubbed from logs (23 fields redacted) -- v1.1
- ✓ Input validation hardened across all endpoints -- v1.1
- ✓ Socket.IO adapter upgraded to @socket.io/redis-adapter -- v1.1
- ✓ Privacy policy accessible in-app -- v1.1
- ✓ Granular consent collection (4 purposes) -- v1.1
- ✓ Data export (Right to Access, Article 15) -- v1.1
- ✓ Account deletion with R2 cleanup (Right to Erasure, Article 17) -- v1.1
- ✓ Consent withdrawal mechanism -- v1.1
- ✓ Data retention policies documented -- v1.1
- ✓ Article 9 special category data handling -- v1.1
- ✓ Authentication flow tests (57/57 pass) -- v1.1
- ✓ Payment flow tests (17/17 pass) -- v1.1
- ✓ Match/chat flow tests -- v1.1
- ✓ Safety flow tests (block, report, unblock) -- v1.1
- ✓ After Hours flow tests -- v1.1
- ✓ Security regression tests -- v1.1
- ✓ Sentry error tracking across all services -- v1.1
- ✓ Health check endpoints with dependency status -- v1.1
- ✓ Brute force alerting via rate limiter -- v1.1
- ✓ Uptime monitoring configured -- v1.1
- ✓ Structured logging with correlation IDs -- v1.1
- ✓ PII redaction verified in logs -- v1.1
- ✓ Database backup to R2 (daily, 30-day retention) -- v1.1
- ✓ Environment variables documented -- v1.1
- ✓ Secrets management audited -- v1.1
- ✓ Backup restoration documented and tested -- v1.1
- ✓ Resend email service configured -- v1.1
- ✓ Apple Sign-In web flow for Android -- v1.1
- ✓ UI audit completed (29 screens, 47 issues fixed) -- v1.1
- ✓ UX flow problems fixed -- v1.1
- ✓ Incomplete features cleaned up -- v1.1
- ✓ Design system consistency enforced -- v1.1
- ✓ Error/loading states standardized -- v1.1
- ✓ Edge cases handled (empty states, timeouts) -- v1.1
- ✓ Chat preserved 30 days post-unmatch -- v1.1
- ✓ Content moderation capability -- v1.1
- ✓ Report handling workflow -- v1.1
- ✓ Ephemeral messages retained for safety (30 days) -- v1.1
- ✓ Resilient DB pool with auto-reconnection across all services -- v2.0
- ✓ Graceful shutdown with pool cleanup across all services -- v2.0
- ✓ Tooltip accessibility on all IconButtons -- v2.0
- ✓ Consistent page transition animations -- v2.0
- ✓ Pre-beta operations checklist -- v2.0

### Active

<!-- No active requirements -- between milestones -->

### Out of Scope

- New feature development beyond current scope -- hardening complete, features for v3+
- 100% test coverage -- focus on critical paths; diminishing returns
- SOC 2 certification -- not required for beta; consider post-launch
- Performance optimization beyond critical issues -- defer to post-beta
- iOS background location fix -- known limitation; acceptable for beta
- Interests/tags system -- deferred from v1.0; not production-readiness
- Location encryption at rest -- deferred (KYCAID done, GPS plaintext with documented rationale)
- pg package upgrade (8.16.3 -> 8.19.0) -- current version has all needed features
- Custom retry wrappers for DB queries -- pg Pool handles reconnection internally

## Context

**Current state (post v2.0):**
- Backend: ~44,000 LOC TypeScript across auth-service, profile-service, chat-service, @vlvt/shared
- Frontend: ~33,300 LOC Dart (Flutter)
- Database: 25+ migrations, PostgreSQL
- Tests: 477 automated tests across all services (all passing)
- Deployment: Railway hosting + CI/CD configured
- Monitoring: Sentry + health checks + structured logging + correlation IDs
- Backups: Daily PostgreSQL to R2 with 30-day retention
- Safety: Block/report, device fingerprinting, photo hashing, chat preservation
- Accessibility: All IconButtons have screen reader tooltips
- Navigation: VlvtPageRoute (slide) + VlvtFadeRoute (crossfade) on all 33 navigation calls
- Resilience: Shared DB pool factory, graceful shutdown with awaited close, 10s force-exit

**Operational prerequisites before beta (see docs/PRE-BETA-CHECKLIST.md):**
1. Set KYCAID_ENCRYPTION_KEY in Railway
2. Configure UptimeRobot monitors for 3 services
3. Configure Apple Developer Portal for Android Apple Sign-In (optional)
4. Execute backup restore test to validate runbook
5. Verify Railway RAILWAY_DEPLOYMENT_DRAINING_SECONDS >= 15s

**Beta launch plan:**
- Staged rollout: start with closed beta, expand gradually
- Real users with real data -- security and privacy are non-negotiable

## Constraints

- **Existing stack**: Must work with current Flutter + Node.js/TypeScript architecture
- **No breaking changes**: Existing functionality must continue working
- **GDPR critical**: Data protection compliance required before any real users
- **Railway deployment**: Infrastructure improvements within Railway's capabilities

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Comprehensive audit over quick fixes | Beta users deserve a solid foundation | ✓ Good -- 40/40 v1.1 requirements satisfied |
| GDPR as critical priority | Dating app + location + EU users = high risk | ✓ Good -- full compliance achieved |
| Staged rollout for beta | Catch issues with small group before expanding | -- Pending (not yet launched) |
| Risk-priority phase ordering | Security first, then GDPR, then testing | ✓ Good -- each phase built on previous |
| KYCAID encryption, location deferred to v2 | Location fuzzing provides privacy; encryption adds complexity | ✓ Good -- acceptable for beta |
| Resend HTTP API over SMTP | Railway blocks outbound port 587 | ✓ Good -- working email service |
| Jest config only in jest.config.js | Prevents config conflicts | ✓ Good -- all tests pass |
| Fire-and-forget Redis adapter | Non-blocking; graceful degradation when unavailable | ✓ Good -- single-instance fallback works |
| R2 photo deletion before CASCADE | Photo keys lost after database CASCADE delete | ✓ Good -- GDPR deletion complete |
| Daily 3 AM UTC backup to separate R2 bucket | Off-peak for US timezones; isolation from photo storage | ✓ Good -- automated |
| Apple Services ID separate from Client ID | Web flow needs different identifier than native iOS | ✓ Good -- code deployed |
| 5s DB connection timeout for Railway cold starts | 2s default too aggressive for Railway cold boot | ✓ Good -- no connection timeouts |
| server.close() before pool.end() in shutdown | Prevents 500 errors on in-flight requests during redeploy | ✓ Good -- clean shutdown verified |
| Manual Promise wrapper over util.promisify for server/io.close | Explicit error handling; util.promisify doesn't handle callback errors well | ✓ Good -- consistent pattern across 3 services |
| VlvtPageRoute easeOutCubic 300ms slide-from-right | Matches MaterialPageRoute duration, smoother feel | ✓ Good -- consistent across 33 nav calls |
| VlvtFadeRoute for modals/overlays (paywall, filters, legal) | Crossfade distinguishes modal from forward navigation | ✓ Good -- clear visual hierarchy |
| Removed Semantics wrapper from non-outlined VlvtIconButton | Prevents duplicate screen reader announcements | ✓ Good -- verified no duplicates |

---
*Last updated: 2026-02-28 after v2.0 milestone completion*
