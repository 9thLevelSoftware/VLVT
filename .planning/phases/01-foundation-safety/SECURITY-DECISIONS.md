# Phase 1 Security Decisions

This document captures security decisions made during Phase 1 (Security Hardening) with rationale, alternatives considered, and any accepted limitations.

## Decision Index

| ID | Decision | Status | Risk Level |
|----|----------|--------|------------|
| SEC-01 | TLS Configuration for Railway PostgreSQL | DOCUMENTED | Medium |
| SEC-06 | Request Signing Secret Handling | DOCUMENTED | Low |
| SEC-07 | Dependency Vulnerability Management | IMPLEMENTED | Low |
| SEC-09 | Sensitive Field Logging Protection | IMPLEMENTED | Low |

---

## SEC-01: TLS Configuration for Railway PostgreSQL

**Status:** DOCUMENTED
**Risk Level:** Medium
**Date:** 2026-01-24

### Context

Railway PostgreSQL uses self-signed certificates and does not provide a CA bundle for certificate validation. This means standard TLS certificate verification (`rejectUnauthorized: true`) cannot be used.

### Decision

Use `rejectUnauthorized: false` for Railway database connections with comprehensive documentation in code.

### Configuration

```typescript
ssl: process.env.DATABASE_URL?.includes('railway')
  ? { rejectUnauthorized: false }
  : false,
```

### Security Implications

**What IS protected:**
- Data in transit is encrypted with TLS
- Connection string uses `sslmode=require` (enforces encryption)
- Railway internal networking provides additional isolation

**What is NOT protected:**
- Certificate validation (no MITM detection)
- Certificate chain verification

### Mitigations

1. **Encryption enforced:** DATABASE_URL contains `sslmode=require`
2. **Network isolation:** Railway services communicate over private network
3. **Automatic rotation:** Railway handles certificate rotation
4. **Environment detection:** Only disabled for Railway (production-like environments)

### Future Improvement

When Railway provides a CA bundle, update all services to:
```typescript
ssl: { rejectUnauthorized: true, ca: fs.readFileSync('railway-ca.crt') }
```

### References

- [Railway PostgreSQL SSL Issue](https://station.railway.com/questions/postgre-sql-ssl-connection-self-signed-33f0d3b6)
- Code locations: `backend/*/src/index.ts` (Pool initialization)

---

## SEC-06: Request Signing Secret Handling

**Status:** DOCUMENTED
**Risk Level:** Low
**Date:** 2026-01-24

### Context

The request signing middleware uses HMAC-SHA256 to verify request integrity. A secret is required, but developers need a convenient default for local development.

### Decision

1. Use `DEFAULT_DEV_SECRET` for local development only
2. Production MUST set `REQUEST_SIGNING_SECRET` (enforced with throw)
3. Log warning when using dev secret in non-production

### Configuration

```typescript
// Default development secret - NEVER used in production (throws error)
const DEFAULT_DEV_SECRET = 'vlvt-dev-signing-secret-DO-NOT-USE-IN-PRODUCTION';

export function getSigningSecret(): string {
  const secret = process.env.REQUEST_SIGNING_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REQUEST_SIGNING_SECRET must be set in production');
    }
    console.warn('[SECURITY] Using DEFAULT_DEV_SECRET for request signing...');
    return DEFAULT_DEV_SECRET;
  }
  return secret;
}
```

### Security Implications

**Protected:**
- Production guaranteed to use proper secret (throws if missing)
- Staging environments warned via console.warn
- Dev secret intentionally obvious to prevent accidental production use

**Not a concern:**
- Dev secret in source code (only for development convenience)
- Warning visibility (only appears in development logs)

### References

- Code location: `backend/shared/src/middleware/request-signing.ts`

---

## SEC-07: Dependency Vulnerability Management

**Status:** IMPLEMENTED (01-01)
**Risk Level:** Low
**Date:** 2026-01-24

### Context

npm audit identified 26 vulnerabilities across backend services, primarily in transitive dependencies. Most were low/moderate severity except for @sentry/node which had a high severity issue.

### Decision

1. Update direct dependencies via semver ranges to pull fixed transitive deps
2. Set minimum @sentry/node version to ^10.27.0 to ensure security fix persists
3. Note: package-lock.json is gitignored, so semver ranges are the enforcement mechanism

### Changes Made

| Package | Service | Old Range | New Range |
|---------|---------|-----------|-----------|
| @sentry/node | auth-service | ^8.47.0 | ^10.27.0 |
| @sentry/node | chat-service | ^8.47.0 | ^10.27.0 |
| @sentry/node | profile-service | ^8.47.0 | ^10.27.0 |
| express | shared | ^5.0.1 | ^5.1.0 |

### Verification

All services show 0 critical/high vulnerabilities:
```bash
cd backend/auth-service && npm audit --audit-level=high
cd backend/profile-service && npm audit --audit-level=high
cd backend/chat-service && npm audit --audit-level=high
cd backend/shared && npm audit --audit-level=high
```

### References

- Implementation: Plan 01-01-SUMMARY.md

---

## SEC-09: Sensitive Field Logging Protection

**Status:** IMPLEMENTED (01-02)
**Risk Level:** Low
**Date:** 2026-01-24

### Context

Winston sanitizer already protected 15 standard sensitive fields. Privacy requirements demand protection of location data (GPS coordinates) and message content.

### Decision

Extended SENSITIVE_FIELDS with 23 additional fields organized into categories:

1. **Authentication** (existing): password, token, secret, api_key, etc.
2. **Location** (12 new): latitude, longitude, lat, lng, gps_*, location_*, coordinates, position
3. **Message Content** (11 new): message, text, content, body, chat_*, conversation_*, dm_*

### Implementation

Fields are case-insensitive and match nested objects. Logged output shows `[REDACTED]` for sensitive values.

### References

- Code location: `backend/shared/src/utils/logger-sanitizer.ts`
- Implementation: Plan 01-02-SUMMARY.md

---

## Appendix: Accepted Risks Summary

| Risk | Severity | Mitigation | Monitor |
|------|----------|------------|---------|
| Railway TLS cert validation | Medium | Encryption enforced, network isolation | Railway announcements |
| Dev secret in source | Low | Production throw, warning logs | Staging logs |

---

*Document created: 2026-01-24*
*Phase: 01-security-hardening*
*Plans: 01-01, 01-02, 01-03, 01-04*
