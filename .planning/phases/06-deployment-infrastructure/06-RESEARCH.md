# Phase 6: Deployment Infrastructure - Research

**Researched:** 2026-01-25
**Domain:** PostgreSQL backup automation, email service configuration, Apple Sign-In web flow, environment management
**Confidence:** MEDIUM-HIGH

## Summary

Phase 6 focuses on operational resilience through database backup automation, environment variable audit, and completing blocked features (email service, Apple Sign-In on Android). The infrastructure already uses Railway for deployment, PostgreSQL for data, and Cloudflare R2 for object storage (photos). The key challenge is implementing a reliable backup pipeline that runs on Railway's constraints.

Research confirms Railway provides native cron job support with minimum 5-minute intervals, and official templates exist for PostgreSQL-to-S3-compatible-storage backups. The existing R2 credentials can be reused for backup storage with a separate bucket or folder. Email service infrastructure already exists in the codebase (`email-service.ts`) with Resend/SendGrid/SMTP support - just needs configuration. Apple Sign-In web flow requires Services ID creation, domain verification, and client secret generation using the existing `apple-signin-auth` package.

**Primary recommendation:** Deploy Railway's official postgres-s3-backups template as a separate service with cron scheduling, configure Resend for email delivery, and create Apple Services ID for Android web flow.

## Standard Stack

The established libraries/tools for this domain:

### Core
| Library/Tool | Version | Purpose | Why Standard |
|--------------|---------|---------|--------------|
| [postgres-s3-backups](https://github.com/railwayapp-templates/postgres-s3-backups) | Latest | Railway-native PostgreSQL backup | Official Railway template, supports R2 |
| Resend | Latest | Transactional email delivery | Modern API, TypeScript-first, existing code support |
| apple-signin-auth | ^2.0.0 | Apple Sign-In token verification | Already in codebase, supports web flow |
| @aws-sdk/client-s3 | ^3.946.0 | R2 backup uploads | Already in profile-service, S3-compatible |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| pg_dump | PostgreSQL 15 | Database export | Core of backup process |
| node-cron | 3.x | In-app scheduling (alternative) | If Railway cron insufficient |
| jsonwebtoken | ^9.0.2 | Apple client secret generation | Web flow JWT creation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Railway cron + template | Custom backup script | More control but more maintenance |
| Resend | SendGrid | SendGrid more established, Resend simpler TypeScript API |
| Railway cron | pg_cron extension | pg_cron runs in DB, Railway cron runs as separate service |

**Installation:**
```bash
# For backup service (new Railway service)
# Use Railway template: https://railway.com/deploy/postgres-daily-backups

# For email (already installed):
npm install resend  # OR already using nodemailer

# For Apple Sign-In (already installed):
# apple-signin-auth already in auth-service
```

## Architecture Patterns

### Recommended Project Structure
```
backend/
├── auth-service/
│   └── src/services/
│       ├── email-service.ts       # EXISTS - needs configuration
│       └── apple-web-auth.ts      # NEW - Apple web flow
├── profile-service/
│   └── src/utils/
│       └── r2-client.ts           # EXISTS - reuse for backup
├── backup-service/                 # NEW - Railway template deployment
│   └── (Railway postgres-s3-backups template)
└── migrations/

docs/
├── ENVIRONMENT_VARIABLES.md       # NEW - complete audit
├── BACKUP_RESTORE_RUNBOOK.md      # NEW - restore procedures
└── SECRETS_MANAGEMENT.md          # NEW - Railway configuration

.planning/
└── runbooks/                      # Operational procedures
    ├── backup-restore.md
    └── apple-secret-rotation.md
```

### Pattern 1: Railway Native Cron for Backups
**What:** Deploy backup as a separate Railway service with cron scheduling
**When to use:** For scheduled tasks that should exit after completion
**Example:**
```typescript
// Railway service configuration (service settings in Railway dashboard)
// Cron Schedule: 0 3 * * * (daily at 3 AM UTC)
//
// Environment variables required:
// AWS_ACCESS_KEY_ID: (R2 access key)
// AWS_SECRET_ACCESS_KEY: (R2 secret key)
// AWS_S3_BUCKET: vlvt-backups
// AWS_S3_ENDPOINT: https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
// AWS_S3_REGION: auto
// BACKUP_DATABASE_URL: (PostgreSQL connection string)
// BACKUP_CRON_SCHEDULE: 0 3 * * *
```
Source: [Railway postgres-s3-backups template](https://github.com/railwayapp-templates/postgres-s3-backups)

### Pattern 2: Apple Client Secret Generation
**What:** Generate ES256 JWT for Apple web flow (requires 6-month rotation)
**When to use:** For Android users signing in with Apple via web flow
**Example:**
```typescript
// Source: Apple Developer Documentation + apple-signin-auth
import jwt from 'jsonwebtoken';
import fs from 'fs';

function generateAppleClientSecret(): string {
  const privateKey = fs.readFileSync(process.env.APPLE_PRIVATE_KEY_PATH!);

  const token = jwt.sign({}, privateKey, {
    algorithm: 'ES256',
    expiresIn: '180d', // Maximum 6 months
    audience: 'https://appleid.apple.com',
    issuer: process.env.APPLE_TEAM_ID,
    subject: process.env.APPLE_SERVICES_ID, // Services ID, NOT App ID
    keyid: process.env.APPLE_KEY_ID,
  });

  return token;
}
```

### Pattern 3: Environment Variable Organization
**What:** Use Railway shared variables for cross-service configuration
**When to use:** For variables needed by multiple services (JWT_SECRET, DATABASE_URL)
**Example:**
```
# Railway Shared Variables (Project → Settings → Shared Variables)
JWT_SECRET=<shared across all services>
SENTRY_DSN=<shared across all services>

# Service-Specific Variables (each service)
PORT=3001  # Different per service
APPLE_CLIENT_ID=app.vlvt  # Auth-service only
R2_ACCESS_KEY_ID=<profile-service only>
```
Source: [Railway Variables Documentation](https://docs.railway.com/reference/variables)

### Anti-Patterns to Avoid
- **Hard-coding backup paths:** Use environment variables for R2 bucket/folder configuration
- **Mixing App ID and Services ID:** Apple App ID for iOS native, Services ID for web flow
- **Storing Apple private key as env var:** Store the .p8 file securely, reference by path or mount
- **Running backup in main service:** Use separate Railway service with cron to avoid resource conflicts

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| PostgreSQL backup scheduling | Custom cron daemon | Railway postgres-s3-backups template | Handles pg_dump versioning, compression, retries |
| Email templates | Raw HTML strings | Existing email-service.ts templates | Already built with VLVT branding |
| Apple JWT generation | Manual ES256 signing | jsonwebtoken with ES256 | Handles key format, claims structure |
| Backup retention cleanup | Custom deletion logic | R2 lifecycle rules OR template's cleanup | S3-compatible lifecycle policies |

**Key insight:** Railway's official backup template handles PostgreSQL version detection, compression, error handling, and health endpoints. Building a custom solution risks pg_dump version mismatches and incomplete error handling.

## Common Pitfalls

### Pitfall 1: Railway Cron Minimum Interval
**What goes wrong:** Attempting to schedule backups more frequently than every 5 minutes
**Why it happens:** Railway cron has a 5-minute minimum between executions
**How to avoid:** Daily backups (required) are well within limits; use `0 3 * * *` for 3 AM UTC
**Warning signs:** Cron job not triggering, error in Railway logs

### Pitfall 2: R2 Endpoint Configuration
**What goes wrong:** Using AWS S3 endpoint format instead of R2 endpoint
**Why it happens:** R2 uses different endpoint pattern than AWS S3
**How to avoid:** Use `https://${ACCOUNT_ID}.r2.cloudflarestorage.com` NOT `https://s3.amazonaws.com`
**Warning signs:** "Access Denied" or "Bucket not found" errors

### Pitfall 3: Apple Services ID vs App ID Confusion
**What goes wrong:** Using App Bundle ID as client_id for web flow
**Why it happens:** iOS native uses App ID (bundle ID), web flow uses Services ID
**How to avoid:** Create separate Services ID in Apple Developer Portal for web flow
**Warning signs:** "Invalid client_id" errors on Android Apple Sign-In

### Pitfall 4: Apple Client Secret Expiration
**What goes wrong:** Authentication fails after 6 months
**Why it happens:** Apple requires maximum 180-day expiration on client secret JWTs
**How to avoid:** Set calendar reminder for 5.5 months; document rotation procedure
**Warning signs:** "Invalid client_secret" errors starting suddenly

### Pitfall 5: pg_dump Version Mismatch
**What goes wrong:** Backup fails with version error
**Why it happens:** pg_dump client version doesn't match PostgreSQL server version
**How to avoid:** Railway template auto-detects PostgreSQL version (15-17 supported)
**Warning signs:** "server version mismatch" in backup logs

### Pitfall 6: Backup Service Not Exiting
**What goes wrong:** Backup service runs continuously, skipping subsequent scheduled runs
**Why it happens:** Railway skips cron if previous execution still running
**How to avoid:** Ensure backup script exits cleanly; template handles this automatically
**Warning signs:** Only first backup runs, subsequent schedules skipped

## Code Examples

Verified patterns from official sources:

### Backup Service Environment Variables
```bash
# Source: Railway postgres-s3-backups template
# R2 Configuration (reuse existing R2 account)
AWS_ACCESS_KEY_ID=<R2_ACCESS_KEY_ID from profile-service>
AWS_SECRET_ACCESS_KEY=<R2_SECRET_ACCESS_KEY from profile-service>
AWS_S3_BUCKET=vlvt-backups  # Separate bucket for backups
AWS_S3_ENDPOINT=https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com
AWS_S3_REGION=auto
AWS_S3_FORCE_PATH_STYLE=true  # Required for R2

# Database Configuration
BACKUP_DATABASE_URL=${{Postgres.DATABASE_URL}}  # Railway reference syntax

# Schedule Configuration
BACKUP_CRON_SCHEDULE=0 3 * * *  # Daily at 3 AM UTC
RUN_ON_STARTUP=false  # Prevent backup on every deploy
BACKUP_FILE_PREFIX=vlvt_backup_
```

### Email Service Configuration (Existing)
```typescript
// Source: backend/auth-service/src/services/email-service.ts (existing)
// Required environment variables for Resend:
// EMAIL_PROVIDER=resend
// RESEND_API_KEY=re_xxxxxxxxx
// EMAIL_FROM=noreply@getvlvt.vip
// APP_NAME=VLVT
// APP_URL=https://getvlvt.vip

// The email service already supports:
// - sendVerificationEmail(email, token)
// - sendPasswordResetEmail(email, token)
```

### Apple Web Flow Callback Handler
```typescript
// Source: apple-signin-auth npm documentation + Apple Developer docs
// New endpoint for Android web flow callback
import appleSignin from 'apple-signin-auth';

// Environment variables required:
// APPLE_TEAM_ID=<10-character Team ID>
// APPLE_SERVICES_ID=<Services ID identifier, e.g., vip.getvlvt.web>
// APPLE_KEY_ID=<Key ID from Apple Developer Portal>
// APPLE_PRIVATE_KEY=<Contents of .p8 file OR path to file>
// APPLE_REDIRECT_URI=https://auth-service.railway.app/auth/apple/callback

app.post('/auth/apple/web', async (req, res) => {
  const { code, state } = req.body;  // From Apple redirect

  // Generate client secret
  const clientSecret = appleSignin.getClientSecret({
    clientID: process.env.APPLE_SERVICES_ID!,
    teamID: process.env.APPLE_TEAM_ID!,
    privateKey: process.env.APPLE_PRIVATE_KEY!,
    keyIdentifier: process.env.APPLE_KEY_ID!,
    expAfter: 15777000, // 6 months in seconds
  });

  // Exchange authorization code for tokens
  const tokenResponse = await appleSignin.getAuthorizationToken(code, {
    clientID: process.env.APPLE_SERVICES_ID!,
    clientSecret,
    redirectUri: process.env.APPLE_REDIRECT_URI!,
  });

  // Verify the id_token
  const { sub, email } = await appleSignin.verifyIdToken(
    tokenResponse.id_token,
    { audience: process.env.APPLE_SERVICES_ID }
  );

  // Continue with user creation/login...
});
```

### Database Restore Command
```bash
# Source: PostgreSQL documentation + Railway postgres-s3-backups
# Download backup from R2 and restore

# 1. Download backup from R2
aws s3 cp s3://vlvt-backups/vlvt_backup_2026-01-25.sql.gz ./backup.sql.gz \
  --endpoint-url https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com

# 2. Decompress
gunzip backup.sql.gz

# 3. Restore to test database
psql $TEST_DATABASE_URL < backup.sql

# 4. Verify restore
psql $TEST_DATABASE_URL -c "SELECT COUNT(*) FROM users;"
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Manual pg_dump scripts | Railway postgres-s3-backups template | 2024 | Automated version detection, health checks |
| SendGrid SMTP | Resend API | 2023 | Simpler TypeScript SDK, better DX |
| Apple Sign-In iOS only | Web flow for Android | Available since 2019 | Requires Services ID + client secret |
| Environment vars in code | Railway shared variables | 2024 | Better secrets management, reference syntax |

**Deprecated/outdated:**
- **socket.io-redis**: Replaced by @socket.io/redis-adapter (already done in Phase 1)
- **Manual backup cron via node-cron**: Railway native cron preferred for scheduled tasks

## Open Questions

Things that couldn't be fully resolved:

1. **R2 Bucket Separation**
   - What we know: Profile-service uses `vlvt-images` bucket; backups should be separate
   - What's unclear: Create new bucket `vlvt-backups` or use folder in existing bucket?
   - Recommendation: Create separate `vlvt-backups` bucket for isolation and different lifecycle rules

2. **Apple Private Key Storage**
   - What we know: Apple provides .p8 file that must not be committed to repo
   - What's unclear: How to securely provide to Railway (file mount vs env var)
   - Recommendation: Store private key content as Railway sealed variable (not ideal but works)

3. **Backup Retention Automation**
   - What we know: Requirement is 30-day retention
   - What's unclear: Railway template doesn't include retention cleanup
   - Recommendation: Configure R2 Object Lifecycle rules for automatic 30-day deletion

4. **Restore Time Validation**
   - What we know: Target is 1-hour restore time
   - What's unclear: Actual restore time depends on database size (unknown)
   - Recommendation: Test restore process and document actual time; database likely small for beta

## Sources

### Primary (HIGH confidence)
- [Railway postgres-s3-backups template](https://github.com/railwayapp-templates/postgres-s3-backups) - Environment variables, scheduling, R2 compatibility
- [Railway Cron Jobs Documentation](https://docs.railway.com/reference/cron-jobs) - Scheduling syntax, limitations, best practices
- [Railway Variables Documentation](https://docs.railway.com/reference/variables) - Shared variables, reference syntax, sealed variables
- Existing codebase: `backend/auth-service/src/services/email-service.ts` - Email service already built
- Existing codebase: `backend/profile-service/src/utils/r2-client.ts` - R2 integration pattern

### Secondary (MEDIUM confidence)
- [Resend Node.js Documentation](https://resend.com/nodejs) - Email sending API
- [apple-signin-auth npm](https://www.npmjs.com/package/apple-signin-auth) - Apple Sign-In web flow support
- [Railway Blog: Automated PostgreSQL Backups](https://blog.railway.com/p/automated-postgresql-backups) - Backup strategy overview
- [postgres-r2-backup GitHub](https://github.com/jacksonkasi0/postgres-r2-backup) - 30-day retention implementation example

### Tertiary (LOW confidence - WebSearch only)
- Various Medium/DEV.to articles on Apple Sign-In implementation
- Community discussions on Hacker News about R2 backup strategies

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Official Railway templates, existing codebase
- Architecture: MEDIUM-HIGH - Railway patterns documented, some decisions discretionary
- Pitfalls: MEDIUM - Based on documentation and community reports
- Email service: HIGH - Already implemented, just needs configuration
- Apple web flow: MEDIUM - Documented but requires Apple Developer Portal steps

**Research date:** 2026-01-25
**Valid until:** 2026-02-25 (30 days - Railway and Apple APIs stable)

---

## Quick Reference: Environment Variables Audit Preview

Based on existing `.env.example` files, here's the full audit scope:

### auth-service
| Variable | Current Status | Secret? | Notes |
|----------|---------------|---------|-------|
| PORT | Configured | No | 3001 |
| JWT_SECRET | Must be shared | YES | Same across all services |
| DATABASE_URL | Railway ref | YES | ${{Postgres.DATABASE_URL}} |
| APPLE_CLIENT_ID | Configured | No | app.vlvt (iOS native) |
| GOOGLE_CLIENT_ID | Configured | No | |
| KYCAID_API_TOKEN | Configured | YES | |
| KYCAID_FORM_ID | Configured | No | |
| KYCAID_ENCRYPTION_KEY | Configured | YES | |
| SENTRY_DSN | Should be shared | No | Same across all services |
| EMAIL_PROVIDER | NOT CONFIGURED | No | DEP-05 |
| RESEND_API_KEY | NOT CONFIGURED | YES | DEP-05 |
| APPLE_TEAM_ID | NOT CONFIGURED | No | DEP-06 |
| APPLE_SERVICES_ID | NOT CONFIGURED | No | DEP-06 |
| APPLE_KEY_ID | NOT CONFIGURED | No | DEP-06 |
| APPLE_PRIVATE_KEY | NOT CONFIGURED | YES | DEP-06 |

### profile-service
| Variable | Current Status | Secret? | Notes |
|----------|---------------|---------|-------|
| PORT | Configured | No | 3002 |
| JWT_SECRET | Must match auth | YES | |
| DATABASE_URL | Railway ref | YES | |
| R2_ACCOUNT_ID | Configured | No | |
| R2_ACCESS_KEY_ID | Configured | YES | |
| R2_SECRET_ACCESS_KEY | Configured | YES | |
| R2_BUCKET_NAME | Configured | No | vlvt-images |
| AWS_ACCESS_KEY_ID | Optional | YES | Rekognition |
| AWS_SECRET_ACCESS_KEY | Optional | YES | Rekognition |
| SENTRY_DSN | Should be shared | No | |

### chat-service
| Variable | Current Status | Secret? | Notes |
|----------|---------------|---------|-------|
| PORT | Configured | No | 3003 |
| JWT_SECRET | Must match auth | YES | |
| DATABASE_URL | Railway ref | YES | |
| GOOGLE_APPLICATION_CREDENTIALS | Configured | YES | Firebase |
| SENTRY_DSN | Should be shared | No | |

### backup-service (NEW)
| Variable | Status | Secret? | Notes |
|----------|--------|---------|-------|
| AWS_ACCESS_KEY_ID | NEW | YES | R2 credentials |
| AWS_SECRET_ACCESS_KEY | NEW | YES | R2 credentials |
| AWS_S3_BUCKET | NEW | No | vlvt-backups |
| AWS_S3_ENDPOINT | NEW | No | R2 endpoint |
| BACKUP_DATABASE_URL | NEW | YES | Railway ref |
| BACKUP_CRON_SCHEDULE | NEW | No | 0 3 * * * |
