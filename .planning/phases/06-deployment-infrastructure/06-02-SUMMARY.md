---
phase: 06-deployment-infrastructure
plan: 02
subsystem: infra
tags: [email, resend, smtp, transactional-email, railway, migrations]

# Dependency graph
requires:
  - phase: 06-deployment-infrastructure/01
    provides: "Environment variable audit and secrets management documentation"
  - phase: 01-security-hardening
    provides: "Auth service with email verification and password reset flows"
provides:
  - "Production email delivery via Resend HTTP API"
  - "Email configuration documented in .env.example"
  - "Migration runner updated to include all 26 migrations"
  - "Idempotent migration 006 (IF NOT EXISTS on unique index)"
affects:
  - 06-deployment-infrastructure (remaining plans depend on working email)
  - 07-safety-systems (email notifications for safety features)

# Tech tracking
tech-stack:
  added: [resend (npm package)]
  patterns:
    - "Resend HTTP API instead of SMTP (Railway blocks port 587)"
    - "Migration runner must enumerate all migration files explicitly"

key-files:
  created: []
  modified:
    - "backend/auth-service/.env.example"
    - "backend/auth-service/package.json"
    - "backend/auth-service/src/services/email-service.ts"
    - "backend/migrations/run_migration.js"
    - "backend/migrations/006_add_auth_credentials.sql"

key-decisions:
  - "Resend HTTP API over SMTP: Railway blocks outbound port 587, so switched from nodemailer SMTP to Resend npm package (HTTPS port 443)"
  - "Migration runner must include all migrations: run_migration.js only had 001-014, causing 500 errors on registration (verification_token_hash column missing)"
  - "IF NOT EXISTS on unique indexes: Migration 006 CREATE UNIQUE INDEX lacked idempotency guard, breaking re-runs"

patterns-established:
  - "HTTP API for email: Use provider HTTP APIs (not SMTP) on Railway due to port restrictions"
  - "Migration runner checklist: When adding new migrations, always update run_migration.js file list"

requirements-completed: [DEP-05]

# Metrics
duration: ~4 days (checkpoint wait for user configuration)
completed: 2026-01-29
---

# Phase 6 Plan 2: Email Service Configuration Summary

**Resend HTTP API configured for production email delivery with migration runner and idempotency fixes discovered during checkpoint verification**

## Performance

- **Duration:** ~4 days (including checkpoint wait for user Resend/Railway configuration)
- **Started:** 2026-01-25T22:31:39-05:00
- **Completed:** 2026-01-29T18:33:17-05:00
- **Tasks:** 2 (1 auto + 1 checkpoint:human-verify)
- **Files modified:** 5

## Accomplishments

- Email configuration variables documented in auth-service .env.example with instructions for Resend, SendGrid, and SMTP providers
- User configured Resend API key and sending domain in Railway production environment
- Switched email-service.ts from nodemailer SMTP transport to Resend HTTP API (Railway blocks port 587)
- Fixed migration runner to include all 26 migrations (was missing 015-026, causing registration failures)
- Fixed migration 006 idempotency bug (CREATE UNIQUE INDEX without IF NOT EXISTS)

## Task Commits

Each task was committed atomically:

1. **Task 1: Document Email Configuration in .env.example** - `83ebcd6` (docs)
2. **Checkpoint: User configured Resend in Railway** - No commit (user action)

Bug fix commits discovered during checkpoint verification:

3. **Fix: Migration runner and idempotency** - `f2ed447` (docs/fix)
4. **Fix: Switch to Resend HTTP API** - `91fcd54` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `backend/auth-service/.env.example` - Added EMAIL_PROVIDER, RESEND_API_KEY, EMAIL_FROM, APP_NAME, APP_URL with documentation
- `backend/auth-service/package.json` - Added `resend` npm dependency
- `backend/auth-service/src/services/email-service.ts` - Switched from nodemailer SMTP transport to Resend HTTP API
- `backend/migrations/run_migration.js` - Added migrations 015 through 026 to the runner
- `backend/migrations/006_add_auth_credentials.sql` - Added IF NOT EXISTS to CREATE UNIQUE INDEX

## Decisions Made

1. **Resend HTTP API over SMTP** - Railway blocks outbound SMTP port 587. Switched from nodemailer SMTP transport (smtp.resend.com:587) to the `resend` npm package which uses HTTPS (port 443). This is more reliable on PaaS platforms that restrict outbound ports.

2. **Migration runner must explicitly list all files** - The run_migration.js file had a hardcoded list of migration files (001-014). Migrations 015-026 existed on disk but were never executed, causing the `verification_token_hash` column to be missing. Registration requests returned 500 errors.

3. **Idempotent DDL statements** - Migration 006 used `CREATE UNIQUE INDEX` without `IF NOT EXISTS`, causing failures when re-running migrations. All DDL should be idempotent for safe re-runs.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Migration runner missing migrations 015-026**
- **Found during:** Checkpoint verification (user testing registration flow)
- **Issue:** run_migration.js only listed migrations 001-014. Migrations 015-026 (including the one adding verification_token_hash) were never applied to production, causing 500 errors on user registration.
- **Fix:** Added all migrations 015 through 026 to the migration runner file list and re-ran migrations against production database.
- **Files modified:** backend/migrations/run_migration.js
- **Verification:** Registration endpoint returned 200 after migrations applied
- **Committed in:** f2ed447

**2. [Rule 1 - Bug] Migration 006 CREATE UNIQUE INDEX not idempotent**
- **Found during:** Checkpoint verification (re-running migrations)
- **Issue:** `CREATE UNIQUE INDEX idx_auth_credentials_user_provider` failed on re-run because the index already existed. No `IF NOT EXISTS` guard.
- **Fix:** Changed to `CREATE UNIQUE INDEX IF NOT EXISTS`
- **Files modified:** backend/migrations/006_add_auth_credentials.sql
- **Verification:** Migration re-run completed without errors
- **Committed in:** f2ed447

**3. [Rule 3 - Blocking] SMTP port 587 blocked on Railway**
- **Found during:** Checkpoint verification (email sending failed)
- **Issue:** nodemailer SMTP transport to smtp.resend.com:587 was blocked by Railway's network policy. Connection timed out.
- **Fix:** Replaced nodemailer SMTP transport with Resend npm package (`resend`) which uses HTTPS API calls on port 443.
- **Files modified:** backend/auth-service/src/services/email-service.ts, backend/auth-service/package.json
- **Verification:** Email verification and password reset emails sent successfully via Resend dashboard
- **Committed in:** 91fcd54

---

**Total deviations:** 3 auto-fixed (1 bug, 2 blocking)
**Impact on plan:** All fixes were essential for email delivery to work in production. The plan assumed SMTP would work and that all migrations were applied -- both assumptions proved false during checkpoint verification.

## Issues Encountered

- **Registration 500 errors:** Root cause was missing database columns (verification_token_hash) because migration runner didn't include recent migrations. Resolved by updating run_migration.js and applying migrations.
- **SMTP connection timeout:** Railway blocks outbound port 587. Resolved by switching to Resend HTTP API. This is a known Railway limitation that should be documented for future reference.

## User Setup Required

User completed the following during checkpoint:
1. Created Resend account and verified sending domain (getvlvt.vip)
2. Generated Resend API key from Resend Dashboard
3. Configured Railway environment variables for auth-service:
   - EMAIL_PROVIDER=resend
   - RESEND_API_KEY=(configured)
   - EMAIL_FROM=noreply@getvlvt.vip
   - APP_NAME=VLVT
   - APP_URL=https://getvlvt.vip

## Next Phase Readiness

- Email service fully operational in production (DEP-05 resolved)
- Email verification and password reset flows working end-to-end
- Ready for remaining deployment infrastructure plans (06-03 through 06-05)
- Future email-dependent features (safety notifications in Phase 7) can rely on this infrastructure

---
*Phase: 06-deployment-infrastructure*
*Completed: 2026-01-29*
