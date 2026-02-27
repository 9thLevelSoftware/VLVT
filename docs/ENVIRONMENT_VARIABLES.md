# Environment Variables Audit

**Last Updated:** 2026-01-26
**Scope:** All backend microservices (auth-service, profile-service, chat-service) + planned backup-service

This document provides a complete audit of all environment variables used across VLVT backend services. Variables are classified by:
- **Secret** - Must use Railway sealed variables; never log or expose
- **Required** - Service fails to start without this variable
- **Source** - Where to obtain the value

---

## Table of Contents

1. [Cross-Service Variables](#cross-service-variables)
2. [auth-service Variables](#auth-service-variables)
3. [profile-service Variables](#profile-service-variables)
4. [chat-service Variables](#chat-service-variables)
5. [backup-service Variables (New)](#backup-service-variables-new)
6. [Environment Differences](#environment-differences)
7. [Security Verification](#security-verification)

---

## Cross-Service Variables

These variables must be consistent across all services. Configure as Railway Shared Variables.

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `JWT_SECRET` | Yes | **YES** | JWT signing key - MUST match across all services | Generate: `openssl rand -base64 64` |
| `DATABASE_URL` | Yes | **YES** | PostgreSQL connection string | Railway: `${{Postgres.DATABASE_URL}}` |
| `DATABASE_POOL_MAX` | No | No | Maximum database pool connections (default: 20) | Configuration |
| `DATABASE_IDLE_TIMEOUT_MS` | No | No | Close idle connections after N ms (default: 30000) | Configuration |
| `DATABASE_CONNECTION_TIMEOUT_MS` | No | No | Connection attempt timeout in ms (default: 2000) | Configuration |
| `NODE_ENV` | Yes | No | Environment mode (development/production/test) | Set per environment |
| `SENTRY_DSN` | No | No | Sentry error tracking DSN | Sentry dashboard > Project > Client Keys |
| `CORS_ORIGIN` | Conditional | No | Allowed CORS origin(s) | Frontend URL(s) |
| `LOG_LEVEL` | No | No | Winston log level (default: info) | Set per environment |
| `REDIS_URL` | No | **YES** | Redis connection for session/rate-limiting | Railway Redis addon or external |
| `REQUEST_SIGNING_SECRET` | Conditional | **YES** | Service-to-service request signing | Generate: `openssl rand -base64 32` |

### Cross-Service Variable Notes

- **JWT_SECRET**: Most critical shared variable. Mismatch causes authentication failures across services.
- **DATABASE_URL**: Use Railway reference syntax `${{Postgres.DATABASE_URL}}` to automatically inject.
- **DATABASE_POOL_MAX**: Tune based on expected load. Railway's shared Postgres supports ~100 connections; divide across services (e.g., 20 each for 3 services leaves headroom for migrations/admin).
- **DATABASE_IDLE_TIMEOUT_MS**: Lower values free connections faster but may increase connection churn. Default 30s is suitable for most workloads.
- **DATABASE_CONNECTION_TIMEOUT_MS**: How long to wait for a connection before failing. Default 2s prevents slow requests from hanging indefinitely.
- **CORS_ORIGIN**: Required in production to prevent CORS errors. Can be comma-separated for multiple origins.
- **REDIS_URL**: Optional but recommended for production. Enables distributed rate limiting and session management.
- **REQUEST_SIGNING_SECRET**: Required in production for service-to-service communication security.

---

## auth-service Variables

Port: 3001

### Core Configuration

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `PORT` | No | No | Service port (default: 3001) | Railway auto-assigns |
| `NODE_ENV` | Yes | No | Environment mode | Shared variable |
| `JWT_SECRET` | Yes | **YES** | JWT signing key | Shared variable |
| `DATABASE_URL` | Yes | **YES** | PostgreSQL connection | Shared variable |
| `CORS_ORIGIN` | Conditional | No | Allowed CORS origins | Frontend URL |
| `API_BASE_URL` | No | No | Base URL for callbacks (default: Railway URL) | Service URL |

### OAuth Providers

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `APPLE_CLIENT_ID` | Yes | No | Apple App ID (e.g., app.vlvt) | Apple Developer Console > Identifiers |
| `GOOGLE_CLIENT_ID` | Yes | No | Google OAuth client ID | Google Cloud Console > Credentials |
| `INSTAGRAM_CLIENT_ID` | No | No | Instagram OAuth client ID | Meta Developer Portal |
| `INSTAGRAM_CLIENT_SECRET` | No | **YES** | Instagram OAuth client secret | Meta Developer Portal |
| `INSTAGRAM_REDIRECT_URI` | No | No | Instagram OAuth callback URL | Service URL + /auth/instagram/callback |

### Apple Sign-In Web Flow (Phase 6 - DEP-06)

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `APPLE_TEAM_ID` | Conditional | No | 10-character Apple Team ID | Apple Developer Portal |
| `APPLE_SERVICES_ID` | Conditional | No | Services ID for web flow (e.g., vip.getvlvt.web) | Apple Developer Portal > Identifiers |
| `APPLE_KEY_ID` | Conditional | No | Key ID from Sign in with Apple key | Apple Developer Portal > Keys |
| `APPLE_PRIVATE_KEY` | Conditional | **YES** | Contents of .p8 private key file | Apple Developer Portal > Keys |
| `APPLE_REDIRECT_URI` | Conditional | No | Callback URL for web flow | Service URL + /auth/apple/callback |

> **Note:** Apple web flow variables are conditional - only required if supporting Apple Sign-In on Android/web.

### KYCAID Verification

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `KYCAID_API_TOKEN` | Yes | **YES** | KYCAID API authentication token | KYCAID Dashboard > Settings > API |
| `KYCAID_FORM_ID` | Yes | No | KYCAID verification form ID | KYCAID Dashboard > Forms |
| `KYCAID_API_URL` | No | No | KYCAID API base URL (default: https://api.kycaid.com) | Leave default |
| `KYCAID_ENCRYPTION_KEY` | Yes* | **YES** | 64-char hex key for PII encryption | Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

> **Note:** `KYCAID_ENCRYPTION_KEY` is required in production. Service throws error at startup if missing.

### Email Service (Phase 6 - DEP-05)

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `EMAIL_PROVIDER` | No | No | Email provider (console/smtp/sendgrid/resend) | Configuration choice |
| `RESEND_API_KEY` | Conditional | **YES** | Resend API key (if EMAIL_PROVIDER=resend) | Resend dashboard |
| `SENDGRID_API_KEY` | Conditional | **YES** | SendGrid API key (if EMAIL_PROVIDER=sendgrid) | SendGrid dashboard |
| `SMTP_HOST` | Conditional | No | SMTP server host (if EMAIL_PROVIDER=smtp) | Email provider |
| `SMTP_PORT` | Conditional | No | SMTP server port (default: 587) | Email provider |
| `SMTP_USER` | Conditional | No | SMTP username | Email provider |
| `SMTP_PASS` | Conditional | **YES** | SMTP password | Email provider |
| `EMAIL_FROM` | No | No | From address (default: noreply@getvlvt.vip) | Domain verification |
| `APP_NAME` | No | No | App name in emails (default: VLVT) | Branding |
| `APP_URL` | No | No | App URL in emails (default: https://getvlvt.vip) | Production URL |

### RevenueCat Integration

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `REVENUECAT_WEBHOOK_AUTH` | Conditional | **YES** | Webhook authentication secret | RevenueCat dashboard > Webhooks |

### Test Endpoints (Beta Only)

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `ENABLE_TEST_ENDPOINTS` | No | No | Enable test login endpoints (default: false) | Configuration |
| `TEST_ENDPOINTS_API_KEY` | Conditional | **YES** | API key for test endpoints | Generate: `openssl rand -base64 32` |
| `ENABLE_SWAGGER` | No | No | Enable Swagger docs in production | Configuration |

### Monitoring

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `SENTRY_DSN` | No | No | Sentry error tracking | Shared variable |
| `LOG_LEVEL` | No | No | Logging level | Configuration |
| `RAILWAY_GIT_COMMIT_SHA` | Auto | No | Git commit for release tracking | Railway auto-provides |
| `SERVICE_NAME` | No | No | Service identifier for logs | Default: vlvt |

---

## profile-service Variables

Port: 3002

### Core Configuration

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `PORT` | No | No | Service port (default: 3002) | Railway auto-assigns |
| `NODE_ENV` | Yes | No | Environment mode | Shared variable |
| `JWT_SECRET` | Yes | **YES** | JWT signing key (MUST match auth-service) | Shared variable |
| `DATABASE_URL` | Yes | **YES** | PostgreSQL connection | Shared variable |
| `CORS_ORIGIN` | Conditional | No | Allowed CORS origins | Frontend URL |

### Cloudflare R2 Storage

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `R2_ACCOUNT_ID` | Yes | No | Cloudflare account ID | Cloudflare Dashboard > R2 |
| `R2_ACCESS_KEY_ID` | Yes | **YES** | R2 API access key | Cloudflare Dashboard > R2 > API Tokens |
| `R2_SECRET_ACCESS_KEY` | Yes | **YES** | R2 API secret key | Cloudflare Dashboard > R2 > API Tokens |
| `R2_BUCKET_NAME` | Yes | No | R2 bucket name (default: vlvt-images) | Cloudflare R2 bucket |
| `R2_URL_EXPIRY_SECONDS` | No | No | Presigned URL expiry (default: 3600) | Configuration |

### AWS Rekognition (Selfie Verification)

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `AWS_ACCESS_KEY_ID` | Conditional | **YES** | AWS IAM access key | AWS Console > IAM |
| `AWS_SECRET_ACCESS_KEY` | Conditional | **YES** | AWS IAM secret key | AWS Console > IAM |
| `AWS_REGION` | No | No | AWS region (default: us-east-1) | Configuration |
| `REKOGNITION_SIMILARITY_THRESHOLD` | No | No | Face match threshold (default: 90) | Configuration |

> **Note:** AWS credentials are required if selfie verification is enabled.

### File Upload

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `UPLOAD_TEMP_DIR` | No | No | Temp directory for uploads | Default: system temp |

### Monitoring

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `SENTRY_DSN` | No | No | Sentry error tracking | Shared variable |
| `LOG_LEVEL` | No | No | Logging level | Configuration |
| `RAILWAY_GIT_COMMIT_SHA` | Auto | No | Git commit for release tracking | Railway auto-provides |
| `SERVICE_NAME` | No | No | Service identifier for logs | Default: vlvt |

---

## chat-service Variables

Port: 3003

### Core Configuration

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `PORT` | No | No | Service port (default: 3003) | Railway auto-assigns |
| `NODE_ENV` | Yes | No | Environment mode | Shared variable |
| `JWT_SECRET` | Yes | **YES** | JWT signing key (MUST match auth-service) | Shared variable |
| `DATABASE_URL` | Yes | **YES** | PostgreSQL connection | Shared variable |
| `CORS_ORIGIN` | Conditional | No | Allowed CORS origins | Frontend URL |

### Firebase Cloud Messaging

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `FIREBASE_PROJECT_ID` | Conditional | No | Firebase project ID | Firebase Console > Project Settings |
| `FIREBASE_CLIENT_EMAIL` | Conditional | No | Service account email | Firebase Console > Service Accounts |
| `FIREBASE_PRIVATE_KEY` | Conditional | **YES** | Service account private key (with \n) | Firebase Console > Service Accounts |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternative | **YES** | Path to service account JSON | Firebase Console > Service Accounts |

> **Note:** Either use `FIREBASE_*` env vars OR `GOOGLE_APPLICATION_CREDENTIALS` file path.

### Real-time Features

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `REDIS_URL` | No | **YES** | Redis for Socket.io adapter | Railway Redis addon |

### Admin Endpoints

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `TEST_ENDPOINTS_API_KEY` | Conditional | **YES** | API key for admin endpoints | Generate: `openssl rand -base64 32` |

### Monitoring

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `SENTRY_DSN` | No | No | Sentry error tracking | Shared variable |
| `LOG_LEVEL` | No | No | Logging level | Configuration |
| `RAILWAY_GIT_COMMIT_SHA` | Auto | No | Git commit for release tracking | Railway auto-provides |
| `SERVICE_NAME` | No | No | Service identifier for logs | Default: vlvt |

---

## backup-service Variables (New)

The backup service uses Railway's postgres-s3-backups template with R2 storage.

### R2 Configuration (Reuse profile-service credentials)

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `AWS_ACCESS_KEY_ID` | Yes | **YES** | R2 access key (same as R2_ACCESS_KEY_ID) | Cloudflare R2 API Tokens |
| `AWS_SECRET_ACCESS_KEY` | Yes | **YES** | R2 secret key (same as R2_SECRET_ACCESS_KEY) | Cloudflare R2 API Tokens |
| `AWS_S3_BUCKET` | Yes | No | Backup bucket name (vlvt-backups) | Cloudflare R2 |
| `AWS_S3_ENDPOINT` | Yes | No | R2 endpoint URL | `https://{ACCOUNT_ID}.r2.cloudflarestorage.com` |
| `AWS_S3_REGION` | Yes | No | S3 region (use: auto) | Fixed: auto |
| `AWS_S3_FORCE_PATH_STYLE` | Yes | No | Required for R2 compatibility | Fixed: true |

### Database Configuration

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `BACKUP_DATABASE_URL` | Yes | **YES** | PostgreSQL connection | Railway: `${{Postgres.DATABASE_URL}}` |

### Schedule Configuration

| Variable | Required | Secret | Description | Source |
|----------|----------|--------|-------------|--------|
| `BACKUP_CRON_SCHEDULE` | Yes | No | Cron expression for backup timing | `0 3 * * *` (3 AM UTC daily) |
| `RUN_ON_STARTUP` | No | No | Run backup on deploy (default: false) | Fixed: false |
| `BACKUP_FILE_PREFIX` | No | No | Backup filename prefix | Default: vlvt_backup_ |

---

## Environment Differences

### Development (Local)

```bash
NODE_ENV=development
PORT=3001/3002/3003
DATABASE_URL=postgresql://postgres:password@localhost:5432/vlvt
JWT_SECRET=dev-secret-not-for-production
CORS_ORIGIN=http://localhost:19006
# Most secrets can use placeholder values
# EMAIL_PROVIDER=console (logs instead of sending)
```

### Staging (Railway Preview)

```bash
NODE_ENV=staging
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=${{shared.JWT_SECRET}}
CORS_ORIGIN=https://staging.getvlvt.vip
# Use test credentials for external services
# ENABLE_TEST_ENDPOINTS=true (for QA testing)
```

### Production (Railway)

```bash
NODE_ENV=production
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=${{shared.JWT_SECRET}}  # Railway sealed variable
CORS_ORIGIN=https://getvlvt.vip
SENTRY_DSN=https://xxx@sentry.io/xxx
# All secrets must be sealed Railway variables
# ENABLE_TEST_ENDPOINTS=false
```

### Key Differences

| Setting | Development | Staging | Production |
|---------|-------------|---------|------------|
| DATABASE_URL | localhost | Railway ref | Railway ref (sealed) |
| JWT_SECRET | Placeholder | Shared sealed | Shared sealed |
| CORS_ORIGIN | localhost:19006 | staging domain | production domain |
| SENTRY_DSN | Empty | Optional | Required |
| EMAIL_PROVIDER | console | resend | resend |
| TEST_ENDPOINTS | Enabled | Enabled | Disabled |
| REQUEST_SIGNING_SECRET | Empty | Sealed | Sealed (required) |

---

## Security Verification

### Verified: No Hardcoded Secrets

The following patterns were scanned and returned no matches:

```bash
# Stripe-style keys
grep -rE "(sk_live|pk_live)" backend/*/src/
# Result: No matches

# AWS access key patterns
grep -rE "AKIA[A-Z0-9]{16}" backend/*/src/
# Result: No matches

# Long alphanumeric strings (potential API keys)
# Manual review confirmed all are:
# - Test values in .env.example files
# - Error messages or documentation
# - No actual credentials
```

### Verified: .gitignore Excludes Secrets

```
.env                    # Root .env file
backend/*/.env          # All service .env files
```

### Secret Variables Summary

| Service | Secret Variables Count |
|---------|----------------------|
| Cross-service | 4 (JWT_SECRET, DATABASE_URL, REDIS_URL, REQUEST_SIGNING_SECRET) |
| auth-service | 9 (KYCAID tokens, Apple key, email keys, etc.) |
| profile-service | 4 (R2 credentials, AWS credentials) |
| chat-service | 2 (Firebase key, TEST_ENDPOINTS_API_KEY) |
| backup-service | 3 (R2 credentials, DATABASE_URL) |

---

## Quick Reference: Railway Configuration

### Shared Variables (Project-level)

1. `JWT_SECRET` - Generate once, seal immediately
2. `DATABASE_URL` - Use `${{Postgres.DATABASE_URL}}` reference
3. `SENTRY_DSN` - Same across all services
4. `REDIS_URL` - Use `${{Redis.REDIS_URL}}` if using Railway Redis

### Per-Service Required Variables

**auth-service:**
- `APPLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`
- `KYCAID_API_TOKEN`, `KYCAID_FORM_ID`, `KYCAID_ENCRYPTION_KEY`

**profile-service:**
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`

**chat-service:**
- `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

**backup-service:**
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET`, `AWS_S3_ENDPOINT`
- `BACKUP_DATABASE_URL`, `BACKUP_CRON_SCHEDULE`

---

*Document generated as part of Phase 6 Deployment Infrastructure (DEP-02)*
