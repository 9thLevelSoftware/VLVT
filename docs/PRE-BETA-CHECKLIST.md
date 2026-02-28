# Pre-Beta Operations Checklist

Operational prerequisites that must be completed before inviting real users to the VLVT beta. Each item is independently verifiable.

**Last updated:** 2026-02-28
**Progress:** 0/8 items completed

---

## 1. Security Keys

- [ ] **Set `KYCAID_ENCRYPTION_KEY` environment variable in Railway for auth-service**
  - **What:** Generate a 64-character hex encryption key and set it as a sealed environment variable. This key encrypts PII data at rest for ID verification. It is required in production -- auth-service throws an error at startup if missing.
  - **Where:** Railway Dashboard > auth-service > Variables (mark as sealed)
  - **Generate:** `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
  - **Verify:** `railway variables` for auth-service shows `KYCAID_ENCRYPTION_KEY` is set (value is non-empty, 64 hex characters). Service starts without KYCAID encryption error in logs.
  - **Owner:** Ops
  - **Warning:** This key must NEVER be rotated without a planned data migration (decrypt with old key, re-encrypt with new). Generate once and store securely.
  - **Source:** PROJECT.md, CONCERNS.md, docs/SECRETS_MANAGEMENT.md

---

## 2. Monitoring

- [ ] **Configure UptimeRobot monitors for all 3 service health endpoints**
  - **What:** Create HTTP(s) keyword monitors in UptimeRobot for each backend service health endpoint. Configure alert contacts (email/Slack) for downtime notifications.
  - **Where:** UptimeRobot dashboard (https://uptimerobot.com) > Add New Monitor > HTTP(s) - Keyword
  - **Endpoints:**
    - `https://{auth-service-url}/health`
    - `https://{profile-service-url}/health`
    - `https://{chat-service-url}/health`
  - **Settings:** Check interval 5 minutes, keyword "ok" or "healthy" (match health response body), alert contacts configured
  - **Verify:** UptimeRobot shows "Up" status for all 3 monitors. Trigger a test alert to confirm notifications are received.
  - **Owner:** Ops
  - **Source:** PROJECT.md, UPTIME-MONITORING.md

---

## 3. External Services

- [ ] **Configure Apple Developer Portal Services ID for Android Apple Sign-In** (OPTIONAL)
  - **What:** Create and configure a Services ID in the Apple Developer Portal to enable the Apple Sign-In web flow on Android devices. This is only needed if supporting Apple Sign-In on Android.
  - **Where:** Apple Developer Portal > Certificates, Identifiers & Profiles > Identifiers > Services IDs
  - **Steps:**
    1. Register a Services ID (e.g., `vip.getvlvt.web`)
    2. Enable "Sign In with Apple" for this Services ID
    3. Configure the return URL to point to auth-service: `https://{auth-service-url}/auth/apple/callback`
    4. Set the following Railway env vars on auth-service: `APPLE_TEAM_ID`, `APPLE_SERVICES_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`, `APPLE_REDIRECT_URI`
  - **Verify:** Apple Sign-In flow completes successfully from an Android device or emulator. User is redirected back to the app after authenticating with Apple.
  - **Owner:** Ops
  - **Source:** PROJECT.md, STATE.md, docs/ENVIRONMENT_VARIABLES.md

---

## 4. Backup Validation

- [ ] **Install AWS CLI and configure R2 access for backup operations**
  - **What:** Install the AWS CLI on the machine that will perform backup operations (local or CI). Configure it with Cloudflare R2 credentials so backups can be listed, downloaded, and restored.
  - **Where:** Local machine or CI environment
  - **Steps:**
    1. Install AWS CLI v2: https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html
    2. Configure with R2 credentials: `aws configure` (use R2 access key/secret, region `auto`)
    3. Set the R2 endpoint in commands or as an alias
  - **Verify:** `aws s3 ls s3://vlvt-backups --endpoint-url https://{ACCOUNT_ID}.r2.cloudflarestorage.com` returns bucket contents (backup files listed with dates and sizes)
  - **Owner:** Ops
  - **Source:** PROJECT.md, docs/BACKUP_CONFIGURATION.md

- [ ] **Execute backup restore test using the runbook**
  - **What:** Download a recent backup from R2, restore it to a local test database, and verify the data is intact. This validates the entire backup-restore pipeline end-to-end.
  - **Where:** Local development environment with a test PostgreSQL database
  - **Steps:**
    1. List recent backups: `aws s3 ls s3://vlvt-backups --endpoint-url https://{ACCOUNT_ID}.r2.cloudflarestorage.com`
    2. Download latest: `aws s3 cp s3://vlvt-backups/{latest-backup}.sql.gz ./backup.sql.gz --endpoint-url https://{ACCOUNT_ID}.r2.cloudflarestorage.com`
    3. Decompress: `gunzip backup.sql.gz`
    4. Restore to test DB: `psql postgresql://postgres:password@localhost:5432/vlvt_restore_test < backup.sql`
    5. Verify tables and data: `psql -c "\dt" postgresql://postgres:password@localhost:5432/vlvt_restore_test`
  - **Verify:** Restored database contains all expected tables (users, profiles, matches, messages, blocks_reports, etc.) and recent data. Runbook steps complete without errors.
  - **Owner:** Ops
  - **Source:** PROJECT.md, docs/BACKUP_CONFIGURATION.md, docs/runbooks/

---

## 5. Deployment Configuration

- [ ] **Verify `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` is set to >= 15 seconds for all three services**
  - **What:** Ensure Railway allows at least 15 seconds for graceful shutdown on each service before killing the process. This gives in-flight requests time to complete and database connections time to close cleanly during deployments.
  - **Where:** Railway Dashboard > each service (auth-service, profile-service, chat-service) > Settings > Deploy
  - **Verify:** The "Deployment Draining" value shows >= 15 seconds for all three services. If not configurable via dashboard, check Railway documentation for the default and confirm it meets the minimum.
  - **Owner:** Ops
  - **Source:** STATE.md, Phase 9 summaries (graceful shutdown implementation)

- [ ] **Verify Railway Custom Start Commands use `node dist/index.js` (not `npm start`) for all three services**
  - **What:** Ensure each service uses `node dist/index.js` as the start command instead of `npm start`. Direct node invocation avoids npm overhead and ensures SIGTERM signals are forwarded correctly to the Node.js process (npm swallows signals, preventing graceful shutdown).
  - **Where:** Railway Dashboard > each service (auth-service, profile-service, chat-service) > Settings > Deploy > Custom Start Command
  - **Verify:** Start command is exactly `node dist/index.js` for each service. Confirm by redeploying one service and checking Railway logs for the startup message (should not show npm lifecycle output).
  - **Owner:** Ops
  - **Source:** STATE.md, Phase 9 PITFALLS research

---

## 6. Environment Variables

- [ ] **Verify all required environment variables are set in Railway for each service**
  - **What:** Audit each service's Railway variables to confirm all required vars are present, non-empty, and correctly configured for production.
  - **Where:** Railway Dashboard > each service > Variables
  - **Per-service required variables:**

    **auth-service (port 3001):**
    | Variable | Secret | Source |
    |----------|--------|--------|
    | `DATABASE_URL` | YES (sealed) | Railway reference: `${{Postgres.DATABASE_URL}}` |
    | `JWT_SECRET` | YES (sealed) | Shared variable |
    | `NODE_ENV` | No | `production` |
    | `CORS_ORIGIN` | No | Production frontend URL |
    | `APPLE_CLIENT_ID` | No | Apple Developer Console |
    | `GOOGLE_CLIENT_ID` | No | Google Cloud Console |
    | `KYCAID_API_TOKEN` | YES (sealed) | KYCAID Dashboard |
    | `KYCAID_FORM_ID` | No | KYCAID Dashboard |
    | `KYCAID_ENCRYPTION_KEY` | YES (sealed) | Generated (see Section 1) |
    | `RESEND_API_KEY` | YES (sealed) | Resend Dashboard |
    | `EMAIL_PROVIDER` | No | `resend` |

    **profile-service (port 3002):**
    | Variable | Secret | Source |
    |----------|--------|--------|
    | `DATABASE_URL` | YES (sealed) | Railway reference: `${{Postgres.DATABASE_URL}}` |
    | `JWT_SECRET` | YES (sealed) | Shared variable (MUST match auth-service) |
    | `NODE_ENV` | No | `production` |
    | `CORS_ORIGIN` | No | Production frontend URL |
    | `R2_ACCOUNT_ID` | No | Cloudflare Dashboard |
    | `R2_ACCESS_KEY_ID` | YES (sealed) | Cloudflare R2 API Tokens |
    | `R2_SECRET_ACCESS_KEY` | YES (sealed) | Cloudflare R2 API Tokens |
    | `R2_BUCKET_NAME` | No | `vlvt-images` |

    **chat-service (port 3003):**
    | Variable | Secret | Source |
    |----------|--------|--------|
    | `DATABASE_URL` | YES (sealed) | Railway reference: `${{Postgres.DATABASE_URL}}` |
    | `JWT_SECRET` | YES (sealed) | Shared variable (MUST match auth-service) |
    | `NODE_ENV` | No | `production` |
    | `CORS_ORIGIN` | No | Production frontend URL |
    | `FIREBASE_PROJECT_ID` | No | Firebase Console |
    | `FIREBASE_CLIENT_EMAIL` | No | Firebase Console |
    | `FIREBASE_PRIVATE_KEY` | YES (sealed) | Firebase Console > Service Accounts |

  - **Verify:** Run `railway variables` for each service (or inspect via dashboard). Confirm:
    1. All required variables are present (no missing entries)
    2. No placeholder or empty values
    3. Secret variables are sealed (show as `********`)
    4. `JWT_SECRET` references the same shared variable across all services
    5. `NODE_ENV` is `production` (not `development` or empty)
    6. `CORS_ORIGIN` matches the production frontend URL
  - **Owner:** Ops
  - **Source:** docs/ENVIRONMENT_VARIABLES.md, docs/SECRETS_MANAGEMENT.md

---

## Sign-off

All items in this checklist have been verified and completed.

| Field | Value |
|-------|-------|
| **Date completed:** | _________________ |
| **Verified by:** | _________________ |
| **Notes:** | _________________ |

---

*Generated from operational prerequisites identified in STATE.md, PROJECT.md, CONCERNS.md, Phase 9 summaries, and existing ops documentation.*
