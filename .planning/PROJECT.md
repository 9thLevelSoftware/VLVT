# VLVT — Production Readiness

## What This Is

VLVT is a dating app with Flutter frontend and Node.js microservices backend. This milestone focuses on making the codebase production-ready for staged beta launch: security hardening, GDPR compliance, bug fixes, testing coverage, and deployment infrastructure completion.

## Core Value

When beta users sign up, their data must be secure, their privacy protected, and the app must not fail in ways that expose them to harm or embarrassment.

## Requirements

### Validated

Existing VLVT capabilities (from v1.0):

- ✓ User authentication (email/password, Apple Sign-In, Google Sign-In) — existing
- ✓ JWT token management with refresh token rotation — existing
- ✓ User profiles with photos and bio — existing
- ✓ Photo upload with Sharp processing and R2 storage — existing
- ✓ Profile discovery with geo-proximity filtering — existing
- ✓ Swipe-based matching (like/pass) — existing
- ✓ Real-time messaging via Socket.IO — existing
- ✓ Typing indicators and read receipts — existing
- ✓ Push notifications via Firebase — existing
- ✓ RevenueCat subscription management (premium/free tiers) — existing
- ✓ User blocking and reporting — existing
- ✓ ID verification via KYCAid — existing
- ✓ Face verification via AWS Rekognition — existing
- ✓ After Hours Mode with auto-matching — v1.0
- ✓ Ephemeral chat with mutual save — v1.0
- ✓ Location fuzzing for privacy — v1.0

### Active

Production Readiness (Beta Launch):

- [ ] Security audit completed with all critical/high issues resolved
- [ ] OWASP Top 10 vulnerabilities checked and mitigated
- [ ] GDPR compliance verified (consent flows, data rights, privacy)
- [ ] Input validation hardened across all API endpoints
- [ ] Rate limiting configured appropriately for all services
- [ ] Secrets management audited (no hardcoded secrets)
- [ ] Known bugs identified and fixed
- [ ] Error handling reviewed and standardized
- [ ] Critical user flows have test coverage
- [ ] Database backup strategy implemented
- [ ] Monitoring and alerting configured
- [ ] Logging reviewed for security (no PII in logs)

### Out of Scope

- New feature development — this is hardening, not feature work
- Performance optimization beyond critical issues — defer to post-beta
- 100% test coverage — focus on critical paths
- SOC 2 / formal compliance certification — beta doesn't require this yet

## Context

**Current state:**
- Backend: ~9,200 LOC TypeScript across auth-service, profile-service, chat-service
- Frontend: ~32,500 LOC Dart (Flutter)
- Database: 25 migrations, PostgreSQL
- No prior security review conducted
- Minimal automated test coverage
- Deployment: Railway hosting + CI/CD configured
- Missing: Monitoring, alerting, database backups

**Beta launch plan:**
- Staged rollout: start with closed beta, expand gradually
- Real users with real data — security and privacy are non-negotiable

**Sensitive data handled:**
- Location data (GPS coordinates, fuzzy display)
- Photos (profile photos, After Hours photos)
- Messages (regular chat, ephemeral After Hours chat)
- Personal info (email, bio, preferences)
- Implicit sexual/romantic context (After Hours Mode)

## Constraints

- **Existing stack**: Must work with current Flutter + Node.js/TypeScript architecture
- **No breaking changes**: Existing functionality must continue working
- **GDPR critical**: Data protection compliance required before any real users
- **Railway deployment**: Infrastructure improvements within Railway's capabilities
- **Comprehensive scope**: Full audit, not just quick fixes

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Comprehensive audit over quick fixes | Beta users deserve a solid foundation | — Pending |
| GDPR as critical priority | Dating app + location + EU users = high risk | — Pending |
| Staged rollout for beta | Catch issues with small group before expanding | — Pending |

---
*Last updated: 2026-01-24 after initialization*
