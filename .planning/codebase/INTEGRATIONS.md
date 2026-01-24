# External Integrations

**Analysis Date:** 2026-01-24

## APIs & External Services

**Authentication (OAuth2):**
- Apple Sign-In - Native iOS/macOS authentication
  - SDK/Client: `apple-signin-auth` 2.0.0 (backend), `sign_in_with_apple` 7.0.1 (frontend)
  - Backend: `backend/auth-service/src/routes/auth.ts`
  - Frontend: `frontend/lib/services/auth_service.dart`
  - Auth: `APPLE_CLIENT_ID` env var (typically "app.vlvt")

- Google OAuth - Android/Web authentication
  - SDK/Client: `google-auth-library` 10.5.0 (backend), `google_sign_in` 7.2.0 (frontend)
  - Backend: `backend/auth-service/src/routes/auth.ts`
  - Frontend: `frontend/lib/services/auth_service.dart`
  - Auth: `GOOGLE_CLIENT_ID` env var

**Identity Verification:**
- KYCAID - Government ID verification service
  - API: REST endpoints at `https://api.kycaid.com`
  - SDK/Client: HTTP client (native implementation)
  - Backend service: `backend/auth-service/src/services/kycaid-service.ts`
  - Auth: `KYCAID_API_TOKEN` env var
  - Config: `KYCAID_FORM_ID`, `KYCAID_API_URL`, `KYCAID_ENCRYPTION_KEY` env vars
  - Purpose: Paywall gate - users must verify government ID before creating profile
  - Webhook: Callback endpoint at `/auth/kycaid/webhook` (auth-service)
  - Data: Stores encrypted verification results (first name, last name, DOB, document type, country, expiry date)
  - Encryption: AES-256-GCM for PII data storage

**Payment & Subscriptions:**
- RevenueCat - Subscription management and monetization
  - SDK/Client: `purchases_flutter` 9.9.9, `purchases_ui_flutter` 9.9.9 (frontend)
  - Frontend service: `frontend/lib/services/subscription_service.dart`
  - Purpose: In-app subscriptions for iOS/Android
  - Auth: RevenueCat API key configured via `--dart-define=REVENUECAT_API_KEY_IOS` or `REVENUECAT_API_KEY_ANDROID`
  - Webhook: Auth service receives RevenueCat subscription events
  - Webhook Auth: `REVENUECAT_WEBHOOK_AUTH` env var
  - Platform: Integrates with App Store and Google Play Store

**Image Analysis:**
- AWS Rekognition - Face verification for selfie validation
  - SDK/Client: `@aws-sdk/client-rekognition` 3.946.0
  - Service: `backend/profile-service/src/utils/r2-client.ts`, `backend/profile-service/src/index.ts`
  - Auth: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION` env vars
  - Purpose: Verify profile photo contains a real face
  - Status: Optional - can run without it (selfie verification gated feature)

## Data Storage

**Databases:**
- PostgreSQL 15
  - Connection: `DATABASE_URL` env var (format: `postgresql://user:password@host:port/database`)
  - Client: `pg` 8.16.3 (Node.js driver)
  - Deployment: Railway managed Postgres
  - SSL: Auto-enabled when `DATABASE_URL` contains "railway"
  - Schema: 25 migrations in `backend/migrations/` (001-025)
  - Tables: users, profiles, matches, messages, blocks, reports, typing_indicators, read_receipts, subscriptions, auth_credentials, refresh_tokens, golden_tickets, date_proposals, verifications, kycaid_verifications, login_attempts, audit_log, after_hours_sessions, after_hours_preferences, etc.

**File Storage:**
- Cloudflare R2 (S3-compatible object storage)
  - Purpose: User profile images
  - SDK/Client: `@aws-sdk/client-s3` 3.946.0, `@aws-sdk/s3-request-presigner` 3.946.0
  - Service: `backend/profile-service/src/utils/r2-client.ts`
  - Config env vars:
    - `R2_ACCOUNT_ID` - Cloudflare account identifier
    - `R2_ACCESS_KEY_ID` - API access key
    - `R2_SECRET_ACCESS_KEY` - API secret
    - `R2_BUCKET_NAME` - Bucket name (typically "vlvt-images")
    - `R2_URL_EXPIRY_SECONDS` - Signed URL expiration (default: 3600)
  - Operations: Upload, resize via Sharp, generate presigned URLs for download
  - Image processing: Sharp 0.33.0 for resizing/optimization
  - Duplicate detection: sharp-phash 2.2.0 for perceptual hashing

**Caching:**
- Redis 4.7.1
  - Purpose: Session storage, rate limit counters, token blacklisting, background job queues
  - Client: `redis` 4.7.1 (standard client), `ioredis` 5.9.2 (BullMQ client)
  - Connection: Configured per service (typically `redis://host:port`)
  - Rate limiter adapter: `rate-limit-redis` 4.2.3
  - Job queue: BullMQ 5.66.7 for background tasks (`profile-service`, `chat-service`)
  - Services using Redis: All three backend services
  - Use cases:
    - Rate limiting per endpoint
    - Session cleanup jobs (`profile-service/src/jobs/session-cleanup-job.ts`)
    - After Hours session scheduling (`profile-service/src/services/session-scheduler.ts`)
    - Socket.IO scaling adapter (`socket.io-redis` 6.1.1)

## Authentication & Identity

**Auth Provider:**
- Custom JWT-based authentication (not Firebase Auth)

**Implementation:**
- Service: `backend/auth-service/src/`
- Token generation: `backend/auth-service/src/utils/crypto.ts` (HMAC with `JWT_SECRET`)
- Token types: Access token (short-lived), refresh token (long-lived with rotation detection)
- Shared middleware: `backend/shared/src/middleware/auth.ts`
- Refresh token rotation: Enabled with reuse detection to prevent token theft
- Token storage (backend): PostgreSQL tables `auth_credentials`, `refresh_tokens`
- Token storage (frontend): `flutter_secure_storage` (keychain on iOS, Keystore on Android)
- Frontend service: `frontend/lib/services/auth_service.dart`

**Password Management:**
- Hashing: bcrypt 6.0.0 with cost factor 10
- Verification: Timing-safe comparison in `backend/auth-service/src/utils/password.ts`
- Storage: `auth_credentials` table (email_hash, password_hash)

**Email Verification:**
- Service: `backend/auth-service/src/services/email-service.ts`
- Providers supported: Console (dev), SMTP, SendGrid, Resend
- Config: `EMAIL_PROVIDER`, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`, `SENDGRID_API_KEY`, `RESEND_API_KEY` env vars
- SDK/Client: `nodemailer` 7.0.11
- Templates: HTML email templates for verification and password reset

## Monitoring & Observability

**Error Tracking:**
- Sentry (optional)
  - SDK/Client: `@sentry/node` 10.25.0 (backend)
  - Backend: Initialized in service index files if `SENTRY_DSN` env var set
  - Auth: `SENTRY_DSN` env var
  - Config: `NODE_ENV` for environment tagging
  - Status: Optional - app runs without it

- Firebase Crashlytics (frontend)
  - SDK/Client: `firebase_crashlytics` 5.0.5
  - Flutter initialization: `frontend/lib/main.dart`
  - Auth: Firebase service account credentials
  - Captures uncaught exceptions and fatal errors
  - Test mode: Reports disabled in debug builds

**Logs:**
- Structured logging: Winston 3.18.3
- Logger files: `backend/shared/src/utils/logger.ts`
- Levels: error, warn, info, debug
- Format: JSON with timestamp, level, message, metadata
- Destinations: Console (all environments), files configurable per service

**Analytics:**
- Firebase Analytics
  - SDK/Client: `firebase_analytics` 12.0.4 (frontend)
  - Frontend service: `frontend/lib/services/analytics_service.dart`
  - Purpose: User behavior tracking, custom events
  - Configuration: Firebase project setup required
  - Events tracked: User actions, screen views, After Hours Mode events

## CI/CD & Deployment

**Hosting:**
- Railway Platform (railway.app)
  - Services deployed as separate Docker containers
  - Database: Railway managed PostgreSQL
  - Deployment: `railway up` (manual deployment)
  - Configuration: `backend/railway.json`
  - Production URLs:
    - `https://vlvtauth.up.railway.app` (auth-service)
    - `https://vlvtprofiles.up.railway.app` (profile-service)
    - `https://vlvtchat.up.railway.app` (chat-service)

**CI Pipeline:**
- Not detected - manual deployment workflow
- Test coverage reporting available but CI/CD integration not configured
- Tests run locally with Jest before deployment

**Build Process:**
- Backend: `npm run build` (TypeScript → JavaScript), `npm start` (run compiled)
- Frontend: `flutter build ios`, `flutter build apk --release`

## Environment Configuration

**Required env vars (all services):**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - HMAC secret (MUST be same across all services)
- `NODE_ENV` - "production", "development", or "test"
- `PORT` - Service port (3001 auth, 3002 profile, 3003 chat)
- `CORS_ORIGIN` - Frontend URL for CORS (e.g., "http://localhost:19006")

**Auth Service specific:**
- `APPLE_CLIENT_ID` - Required for iOS (typically "app.vlvt")
- `GOOGLE_CLIENT_ID` - Required for Google sign-in
- `KYCAID_API_TOKEN` - Required for ID verification
- `KYCAID_FORM_ID` - Required for ID verification
- `KYCAID_ENCRYPTION_KEY` - 64-char hex key for PII encryption (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- `KYCAID_API_URL` - Optional (defaults to `https://api.kycaid.com`)
- `REVENUECAT_WEBHOOK_AUTH` - Webhook auth token
- `API_BASE_URL` - For callback URLs (defaults to Railway auth-service URL)
- `EMAIL_PROVIDER` - Optional: "console", "smtp", "sendgrid", "resend"
- `EMAIL_FROM` - Email sender address
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` - SMTP configuration
- `SENDGRID_API_KEY` - SendGrid API key
- `RESEND_API_KEY` - Resend API key

**Profile Service specific:**
- `R2_ACCOUNT_ID` - Cloudflare R2 account
- `R2_ACCESS_KEY_ID` - Cloudflare API key
- `R2_SECRET_ACCESS_KEY` - Cloudflare API secret
- `R2_BUCKET_NAME` - S3 bucket name (typically "vlvt-images")
- `R2_URL_EXPIRY_SECONDS` - URL expiration duration (default: 3600)
- `AWS_ACCESS_KEY_ID` - AWS credentials for Rekognition (optional)
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `AWS_REGION` - AWS region (e.g., "us-east-1")
- Firebase credentials (see below)

**Chat Service specific:**
- Firebase credentials (see below)

**Firebase Configuration (profile-service, chat-service):**
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to service account JSON file
- Or inline env vars:
  - `FIREBASE_PROJECT_ID` - Firebase project ID
  - `FIREBASE_CLIENT_EMAIL` - Firebase service account email
  - `FIREBASE_PRIVATE_KEY` - Firebase private key (with newlines escaped)

**Optional (monitoring):**
- `SENTRY_DSN` - Error tracking

**Secrets location:**
- Development: `.env` file (local, git-ignored)
- Production: Railway Dashboard → Service → Variables
- Firebase: Service account JSON downloaded from Firebase Console (mounted in docker-compose.yml or via env vars)

## Webhooks & Callbacks

**Incoming:**
- KYCAID verification webhook
  - Endpoint: `POST /auth/kycaid/webhook` (auth-service)
  - Purpose: Receives ID verification results
  - Auth: Bearer token in Authorization header
  - Payload: Verification status, applicant data, document details
  - Handler: `backend/auth-service/src/services/kycaid-service.ts`

- RevenueCat subscription webhook
  - Endpoint: Received by auth-service
  - Purpose: Update subscription/entitlement status
  - Auth: `REVENUECAT_WEBHOOK_AUTH` env var
  - Payload: Subscription events, user entitlements

**Outgoing:**
- Email delivery
  - Service: Nodemailer 7.0.11
  - Implementation: `backend/auth-service/src/services/email-service.ts`
  - Purpose: Email verification, password reset, notifications
  - Providers: Console (dev), SMTP, SendGrid, Resend
  - Templates: HTML email templates embedded in service

- Push notifications
  - Service: Firebase Cloud Messaging (FCM)
  - SDK/Client: `firebase-admin` 12.0.0+ (backend), `firebase_messaging` 16.0.4 (frontend)
  - Implementation:
    - Chat service: `backend/chat-service/src/services/fcm-service.ts`
    - Profile service: `backend/profile-service/src/services/fcm-service.ts`
  - Frontend handler: `frontend/lib/services/notification_service.dart`
  - Flow: Store device FCM tokens in DB, send notifications via Firebase Admin SDK
  - Use cases: New messages, matches, After Hours notifications

- Real-time WebSocket
  - Technology: Socket.IO 4.7.2
  - Service: Chat-service at port 3003
  - Purpose: Real-time messaging, typing indicators, read receipts, After Hours sessions
  - Auth: JWT validation in socket auth middleware
  - Redis adapter: `socket.io-redis` 6.1.1 for multi-instance scaling
  - Implementation: `backend/chat-service/src/socket.ts`, `backend/chat-service/src/socket/after-hours-handler.ts`
  - Frontend client: `frontend/lib/services/socket_service.dart`
  - Events: message, typing, read_receipt, match_update, after_hours_*

## Platform-Specific Services

**iOS:**
- Apple Sign-In (required for App Store)
- Push Notifications via APNs (through Firebase)
- App Store Connect for app distribution

**Android:**
- Google Sign-In
- Firebase Cloud Messaging for push notifications
- Google Play Console for app distribution
- Google Services configuration: `frontend/android/app/google-services.json`

---

*Integration audit: 2026-01-24*
