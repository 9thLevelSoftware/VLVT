# Secrets Management Guide

**Last Updated:** 2026-01-26
**Platform:** Railway
**Scope:** All VLVT backend services

This document provides Railway-specific configuration for managing secrets, including shared variables, sealed variables, and rotation procedures.

---

## Table of Contents

1. [Railway Shared Variables](#railway-shared-variables)
2. [Railway Sealed Variables](#railway-sealed-variables)
3. [Service-Specific Secrets](#service-specific-secrets)
4. [Rotation Procedures](#rotation-procedures)
5. [Verification Checklist](#verification-checklist)

---

## Railway Shared Variables

Shared variables are defined at the project level and automatically injected into all services.

### Configuration Steps

1. Navigate to Railway dashboard > Your Project > Settings > Shared Variables
2. Add each variable with the appropriate value
3. Mark secrets as "sealed" (see next section)

### Required Shared Variables

| Variable | Sealed | Description | Configuration |
|----------|--------|-------------|---------------|
| `JWT_SECRET` | **YES** | JWT signing key (CRITICAL) | Generate: `openssl rand -base64 64` |
| `DATABASE_URL` | YES | PostgreSQL connection | Use reference: `${{Postgres.DATABASE_URL}}` |
| `SENTRY_DSN` | No | Sentry error tracking DSN | Copy from Sentry dashboard |
| `REDIS_URL` | YES | Redis connection (if using) | Use reference: `${{Redis.REDIS_URL}}` |
| `REQUEST_SIGNING_SECRET` | YES | Service-to-service auth | Generate: `openssl rand -base64 32` |

### Railway Reference Syntax

Use Railway's reference syntax to automatically inject values from connected services:

```bash
# Database connection
DATABASE_URL=${{Postgres.DATABASE_URL}}

# Redis connection (if using Railway Redis)
REDIS_URL=${{Redis.REDIS_URL}}
```

This ensures secrets are never manually copied and automatically update if the connected service changes.

### Critical Warning: JWT_SECRET

**The `JWT_SECRET` MUST be identical across all services.** Mismatch causes:
- Users authenticated by auth-service rejected by profile-service/chat-service
- 401 errors across the application
- Token verification failures

**Before deployment:**
1. Generate ONE secret: `openssl rand -base64 64`
2. Add to Railway shared variables as SEALED
3. Verify all services see the same value

---

## Railway Sealed Variables

Sealed variables are encrypted at rest and masked in logs.

### When to Use Sealed Variables

| Variable Type | Seal? | Reason |
|--------------|-------|--------|
| API keys (KYCAID, Resend) | **YES** | Authentication credentials |
| Database URL | **YES** | Contains password |
| Private keys (Apple, Firebase) | **YES** | Cryptographic material |
| JWT_SECRET | **YES** | Application security |
| OAuth client secrets | **YES** | OAuth security |
| Webhook secrets | **YES** | Webhook authentication |
| Port, NODE_ENV | No | Non-sensitive configuration |
| Bucket names, client IDs | No | Public identifiers |

### How to Seal Variables in Railway

1. Navigate to service > Variables
2. Click the variable value
3. Click the lock icon OR toggle "Raw Value" to hidden
4. Confirm the variable shows as masked

### Sealed Variable Behavior

- Values appear as `********` in Railway dashboard
- Values are masked in deployment logs
- Values are still accessible to the application at runtime
- Cannot be "unsealed" without re-entering the value

---

## Service-Specific Secrets

### auth-service

| Secret | Purpose | Rotation Required | Source |
|--------|---------|-------------------|--------|
| `KYCAID_API_TOKEN` | ID verification API | As needed | KYCAID Dashboard |
| `KYCAID_ENCRYPTION_KEY` | PII encryption (64-char hex) | Never (data loss) | Generate once |
| `APPLE_PRIVATE_KEY` | Apple Sign-In JWT signing | 6 months (see DEP-06) | Apple Developer Portal |
| `RESEND_API_KEY` | Email delivery | As needed | Resend Dashboard |
| `REVENUECAT_WEBHOOK_AUTH` | Subscription webhooks | As needed | RevenueCat Dashboard |
| `INSTAGRAM_CLIENT_SECRET` | Instagram OAuth | As needed | Meta Developer Portal |

**KYCAID_ENCRYPTION_KEY Special Handling:**
- This key encrypts PII data at rest
- Rotation requires data migration (decrypt with old, re-encrypt with new)
- DO NOT rotate without a planned data migration
- Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

### profile-service

| Secret | Purpose | Rotation Required | Source |
|--------|---------|-------------------|--------|
| `R2_ACCESS_KEY_ID` | R2 storage access | As needed | Cloudflare Dashboard |
| `R2_SECRET_ACCESS_KEY` | R2 storage secret | As needed | Cloudflare Dashboard |
| `AWS_ACCESS_KEY_ID` | Rekognition access | As needed | AWS IAM |
| `AWS_SECRET_ACCESS_KEY` | Rekognition secret | As needed | AWS IAM |

**R2 Credentials:**
- Can be reused for backup-service (same Cloudflare account)
- Create separate API token with limited scope for production
- Cloudflare Dashboard > R2 > Manage R2 API Tokens

### chat-service

| Secret | Purpose | Rotation Required | Source |
|--------|---------|-------------------|--------|
| `FIREBASE_PRIVATE_KEY` | FCM push notifications | As needed | Firebase Console |
| `TEST_ENDPOINTS_API_KEY` | Admin API access | After exposure | Generate new |

**Firebase Credentials:**
- Store the private key content (not file path) in Railway
- Replace `\n` with actual newlines OR keep as `\n` (code handles both)
- Firebase Console > Project Settings > Service Accounts > Generate New Private Key

### backup-service

| Secret | Purpose | Rotation Required | Source |
|--------|---------|-------------------|--------|
| `AWS_ACCESS_KEY_ID` | R2 backup storage | As needed | Cloudflare (same as profile-service) |
| `AWS_SECRET_ACCESS_KEY` | R2 backup secret | As needed | Cloudflare (same as profile-service) |
| `BACKUP_DATABASE_URL` | Database backup source | Auto (Railway ref) | `${{Postgres.DATABASE_URL}}` |

---

## Rotation Procedures

### JWT_SECRET Rotation (Coordinated)

**Impact:** All active sessions immediately invalidated. All users must re-authenticate.

**Procedure:**
1. Schedule maintenance window (low-traffic period)
2. Notify users of planned logout (if possible)
3. Generate new secret: `openssl rand -base64 64`
4. Update Railway shared variable
5. Redeploy ALL services simultaneously
6. Verify authentication works end-to-end
7. Monitor error rates for 401 responses

**Recovery if failed:**
- Revert to previous JWT_SECRET
- Redeploy all services
- Users with old tokens will work again

### Apple Client Secret Rotation (Every 6 Months)

**Required by:** Apple (maximum 180-day JWT expiration)

**Reminder:** Set calendar reminder for 5.5 months after generation.

**Procedure:**
1. Generate new client secret JWT (see DEP-06 implementation)
2. Update `APPLE_PRIVATE_KEY` or regenerate client secret
3. Redeploy auth-service
4. Test Apple Sign-In flow

**Tracking:**
- Document last rotation date in this file
- Last rotated: [DATE]
- Next rotation due: [DATE + 6 months]

### R2/AWS Credential Rotation

**Procedure:**
1. Create new API token in Cloudflare/AWS
2. Update Railway variables (sealed)
3. Redeploy affected services
4. Verify uploads/downloads work
5. Revoke old credentials

**Best Practice:**
- Keep old credentials valid for 24 hours after rotation
- Verify in production before revoking old credentials

### KYCAID API Token Rotation

**Procedure:**
1. Generate new token in KYCAID Dashboard
2. Update `KYCAID_API_TOKEN` in Railway (sealed)
3. Redeploy auth-service
4. Verify ID verification flow works
5. Revoke old token in KYCAID

### Firebase Credentials Rotation

**Procedure:**
1. Generate new service account key in Firebase Console
2. Update `FIREBASE_PRIVATE_KEY` in Railway (sealed)
3. Redeploy chat-service
4. Verify push notifications work
5. Delete old key in Firebase Console

---

## Verification Checklist

### Pre-Deployment Verification

- [ ] No `.env` files committed to repository
  ```bash
  git ls-files | grep "\.env$"
  # Should return empty
  ```

- [ ] `.gitignore` excludes `.env` files
  ```bash
  grep "\.env" .gitignore
  # Should show: .env and backend/*/.env
  ```

- [ ] No hardcoded secrets in source code
  ```bash
  grep -rE "(sk_live|pk_live|AKIA[A-Z0-9]{16})" backend/*/src/
  # Should return empty
  ```

- [ ] All secret variables are sealed in Railway

### Production Verification

- [ ] JWT_SECRET is same across all services
  ```bash
  # In Railway dashboard, compare:
  # auth-service JWT_SECRET
  # profile-service JWT_SECRET
  # chat-service JWT_SECRET
  # All should reference the same shared variable
  ```

- [ ] All required variables are set
  - [ ] auth-service: JWT_SECRET, DATABASE_URL, APPLE_CLIENT_ID, GOOGLE_CLIENT_ID, KYCAID_*
  - [ ] profile-service: JWT_SECRET, DATABASE_URL, R2_*
  - [ ] chat-service: JWT_SECRET, DATABASE_URL, FIREBASE_*

- [ ] CORS_ORIGIN set to production domain

- [ ] NODE_ENV=production for all services

- [ ] SENTRY_DSN configured for error tracking

### Post-Rotation Verification

- [ ] Service starts successfully (check Railway logs)
- [ ] Authentication flow works (login/signup)
- [ ] Feature-specific flow works (uploads, push, ID verification)
- [ ] No spike in error rates (check Sentry)

---

## Emergency Procedures

### Suspected Secret Compromise

1. **Immediate:** Rotate the compromised secret
2. **If JWT_SECRET:** All sessions invalidated (expected)
3. **Notify:** Security team and document incident
4. **Review:** Access logs for unauthorized use
5. **Post-mortem:** How was secret exposed?

### Accidental Secret Commit

1. **Remove** from git history (if not pushed):
   ```bash
   git reset --soft HEAD~1
   # Remove secret from file
   git add .
   git commit -m "Remove accidental secret"
   ```

2. **If pushed:** Treat as compromised, rotate immediately

3. **Add to .gitignore** if not already present

---

## Secret Storage Summary

| Location | Purpose | Examples |
|----------|---------|----------|
| Railway Shared Variables | Cross-service secrets | JWT_SECRET, DATABASE_URL |
| Railway Service Variables | Service-specific secrets | KYCAID_API_TOKEN, R2_* |
| .env.example files | Documentation only | Placeholder values |
| .env files (local) | Local development | Never committed |

---

*Document generated as part of Phase 6 Deployment Infrastructure (DEP-03)*
