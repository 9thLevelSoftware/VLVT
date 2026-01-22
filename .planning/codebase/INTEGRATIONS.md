# External Integrations

**Analysis Date:** 2026-01-22

## APIs & External Services

**Authentication (OAuth2):**
- Apple Sign-In - Native iOS/macOS authentication
  - SDK: `apple-signin-auth` 2.0.0
  - Backend: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\auth-service\src\routes\auth.ts`
  - Frontend: `sign_in_with_apple` 7.0.1
  - Config: `APPLE_CLIENT_ID` env var

- Google OAuth - Android/Web authentication
  - SDK: `google-auth-library` 10.5.0 (backend), `google_sign_in` 7.2.0 (frontend)
  - Backend: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\auth-service\src\routes\auth.ts`
  - Frontend: `google_sign_in` with Flutter
  - Config: `GOOGLE_CLIENT_ID` env var (optional)

- Instagram OAuth - Social profile linking (optional)
  - SDK: HTTP client + custom implementation
  - Backend: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\auth-service\src\routes\auth.ts`
  - Config: `INSTAGRAM_CLIENT_ID`, `INSTAGRAM_CLIENT_SECRET`, `INSTAGRAM_REDIRECT_URI` env vars
  - Status: Currently optional, may be deprecated

**Identity Verification:**
- KYCAID - Government ID verification service
  - API: REST endpoints at `https://api.kycaid.com`
  - Backend service: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\auth-service\src\services\kycaid-service.ts`
  - Auth: `KYCAID_API_TOKEN` env var
  - Config: `KYCAID_FORM_ID`, `KYCAID_API_URL`, `KYCAID_ENCRYPTION_KEY` env vars
  - Purpose: Paywall gate - users must verify government ID before creating profile
  - Webhook: Callback endpoint at `/auth/kycaid/webhook` (auth-service)
  - Data: Stores encrypted verification results (first name, last name, DOB, document type, country)

**Payment & Subscriptions:**
- RevenueCat - Subscription management and monetization
  - SDK: `purchases_flutter` 9.9.9 (frontend)
  - SDK: `purchases_ui_flutter` 9.9.9 (paywall UI)
  - Frontend service: `C:\Users\dasbl\AndroidStudioProjects\VLVT\frontend\lib\services\subscription_service.dart`
  - Purpose: In-app subscriptions for iOS/Android
  - Auth: RevenueCat API key configured in Flutter
  - Webhook: Auth service listens for RevenueCat webhooks (`REVENUECAT_WEBHOOK_AUTH` env var)

## Data Storage

**Databases:**

PostgreSQL 15:
- Connection: `DATABASE_URL` env var (format: `postgresql://user:password@host:port/database`)
- Client: `pg` 8.16.3 (Node.js driver)
- Deployment: Railway managed Postgres
- SSL: Auto-enabled when `DATABASE_URL` contains "railway"

Schema location: `C:\Users\dasbl\AndroidStudioProjects\VLVT\database\*` (migrations)
- Migration tool: Custom Node.js script at `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\migrations\`
- Tables: users, profiles, matches, messages, blocks, reports, typing_indicators, read_receipts, subscriptions, auth_credentials

**File Storage:**

Cloudflare R2 (S3-compatible object storage):
- Purpose: User profile images
- Client: `@aws-sdk/client-s3` 3.946.0 with R2 endpoint
- Service: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\profile-service\src\services\storage-service.ts`
- Config env vars:
  - `R2_ACCOUNT_ID` - Cloudflare account identifier
  - `R2_ACCESS_KEY_ID` - API access key
  - `R2_SECRET_ACCESS_KEY` - API secret
  - `R2_BUCKET_NAME` - Bucket name (typically "vlvt-images")
  - `R2_URL_EXPIRY_SECONDS` - Signed URL expiration (default: 3600)
- Operations: Upload, resize via Sharp, generate signed URLs for download

**Caching:**

Redis 4.7.1:
- Purpose: Session storage, rate limit counters, token blacklisting
- Client: `redis` 4.7.1
- Connection: `redis://host:port` (inferred from environment)
- Rate limiter adapter: `rate-limit-redis` 4.2.3
- Services using Redis: All three backend services

## Authentication & Identity

**Auth Provider:**
Custom JWT-based authentication (not Firebase Auth)

Implementation approach:
- Service: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\auth-service\src\`
- Token generation: `utils/crypto.ts` (HMAC with `JWT_SECRET`)
- Token types: Access token (short-lived), refresh token (long-lived with rotation detection)
- Middleware: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\shared\src\middleware\auth.ts`
- Refresh token rotation: Recent implementation (commit 212b8a7)
- Reuse detection: Enabled to prevent token theft

**Frontend token storage:**
- Location: `flutter_secure_storage` (keychain on iOS, Keystore on Android)
- Tokens stored: Access token, refresh token
- Service: `C:\Users\dasbl\AndroidStudioProjects\VLVT\frontend\lib\services\auth_service.dart`

**Password Management:**
- Hashing: bcrypt with cost factor 10
- Verification: Timing-safe comparison in `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\auth-service\src\utils\password.ts`

## Monitoring & Observability

**Error Tracking:**
- Sentry (optional)
  - SDK: `@sentry/node` 10.25.0 (backend), firebase_crashlytics (frontend)
  - Backend: Initialized in `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\auth-service\src\index.ts` if `SENTRY_DSN` env var set
  - Config: `SENTRY_DSN`, `NODE_ENV` for environment tagging
  - Status: Optional - app runs without it

- Firebase Crashlytics (frontend)
  - SDK: `firebase_crashlytics` 5.0.5
  - Flutter initialization: `C:\Users\dasbl\AndroidStudioProjects\VLVT\frontend\lib\main.dart`
  - Captures uncaught exceptions and fatal errors
  - Test mode: Reports disabled in debug builds

**Logs:**
- Structured logging: Winston 3.18.3
- Logger files: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\shared\src\utils\logger.ts`
- Levels: error, warn, info, debug
- Format: JSON with timestamp, level, message, metadata
- Destinations: Console (all environments), files configurable per service

**Analytics:**
- Firebase Analytics
  - SDK: `firebase_analytics` 12.0.4 (frontend)
  - Purpose: User behavior tracking
  - Configuration: `firebase_options.dart` with per-platform settings

## CI/CD & Deployment

**Hosting:**
- Railway Platform (railway.app)
- Services deployed as separate Docker containers
- Database: Railway managed PostgreSQL

**CI Pipeline:**
- Not detected - manual deployment via `railway login && railway link && railway up`
- Test coverage reporting available but CI/CD integration status unclear
- Tests run locally with Jest before deployment

**Build Process:**

Backend:
```bash
npm run build          # TypeScript compilation to dist/
npm start              # Run compiled code
```

Frontend:
```bash
flutter build ios      # iOS release build
flutter build apk --release  # Android release build
```

## Environment Configuration

**Required env vars for all services:**
- `DATABASE_URL` - PostgreSQL connection string
- `JWT_SECRET` - HMAC secret (MUST be same across all services)
- `NODE_ENV` - "production", "development", or "test"
- `PORT` - Service port (3001 auth, 3002 profile, 3003 chat)
- `CORS_ORIGIN` - Frontend URL for CORS (or "*" for testing)

**Auth Service specific:**
- `APPLE_CLIENT_ID` - Required for iOS
- `GOOGLE_CLIENT_ID` - Optional for Google sign-in
- `KYCAID_API_TOKEN` - Required for ID verification
- `KYCAID_FORM_ID` - Required for ID verification
- `KYCAID_ENCRYPTION_KEY` - 64-char hex key for PII encryption
- `INSTAGRAM_CLIENT_ID` - Optional
- `INSTAGRAM_CLIENT_SECRET` - Optional
- `INSTAGRAM_REDIRECT_URI` - Optional
- `REVENUECAT_WEBHOOK_AUTH` - Webhook auth token
- `API_BASE_URL` - For callback URLs (defaults to Railway auth-service URL)

**Profile Service specific:**
- `R2_ACCOUNT_ID` - Cloudflare R2 account
- `R2_ACCESS_KEY_ID` - Cloudflare API key
- `R2_SECRET_ACCESS_KEY` - Cloudflare API secret
- `R2_BUCKET_NAME` - S3 bucket name
- `R2_URL_EXPIRY_SECONDS` - URL expiration duration
- Firebase credentials (see below)
- AWS credentials for Rekognition (see below)

**Chat Service specific:**
- Firebase credentials (see below)

**Optional (if used):**
- `SENTRY_DSN` - Error tracking
- `FIREBASE_PROJECT_ID` - Firebase project ID
- `FIREBASE_CLIENT_EMAIL` - Firebase service account email
- `FIREBASE_PRIVATE_KEY` - Firebase private key (with newlines escaped)
- `AWS_ACCESS_KEY_ID` - AWS credentials for S3/Rekognition
- `AWS_SECRET_ACCESS_KEY` - AWS credentials
- `AWS_REGION` - AWS region (e.g., us-east-1)

**Secrets location:**
- Development: `.env` file (local, git-ignored)
- Production: Railway Dashboard → Service → Variables
- Firebase: Service account JSON downloaded from Firebase Console (mounted in docker-compose.yml)

## Webhooks & Callbacks

**Incoming Webhooks:**

KYCAID verification webhook:
- Endpoint: `POST /auth/kycaid/webhook` (auth-service)
- Purpose: Receives ID verification results
- Auth: Bearer token in Authorization header
- Payload: Verification status, applicant data, document details

RevenueCat subscription webhook:
- Endpoint: Received by auth-service
- Purpose: Update subscription/entitlement status
- Auth: `REVENUECAT_WEBHOOK_AUTH` env var
- Payload: Subscription events, user entitlements

Firebase Cloud Messaging (FCM) tokens:
- Purpose: Push notification delivery
- Services: Chat-service and profile-service send notifications
- Implementation: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\chat-service\src\services\fcm-service.ts`
- Flow: Store device tokens in DB, send notifications via Firebase Admin SDK

**Outgoing Webhooks:**

Email delivery:
- Service: Nodemailer 7.0.11
- Auth service: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\auth-service\src\services\email-service.ts`
- Purpose: Email verification, password reset, notifications
- SMTP config: Via environment (provider agnostic)

Real-time WebSocket:
- Technology: Socket.io 4.7.2
- Service: Chat-service at port 3003
- Purpose: Real-time messaging, typing indicators, read receipts
- Auth: JWT validation in socket auth middleware
- Redis adapter: `socket.io-redis` 6.1.1 for multi-instance scaling
- Implementation: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\chat-service\src\socket.ts`

## External Service Dependencies

**Rekognition (Face Verification):**
- Service: AWS Rekognition
- SDK: `@aws-sdk/client-rekognition` 3.946.0
- Purpose: Selfie verification for profile photo
- Implementation: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\profile-service\src\services\`
- Config: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`
- Status: Optional, can run without it (selfie verification gated feature)

**Firebase Admin SDK:**
- Service: Google Firebase
- SDK: `firebase-admin` 12.0.0+ (backend)
- Purpose: Push notifications (FCM), crash reporting
- Implementation:
  - Chat service: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\chat-service\src\services\fcm-service.ts`
  - Profile service: `C:\Users\dasbl\AndroidStudioProjects\VLVT\backend\profile-service\src\services\fcm-service.ts`
- Auth: Service account JSON (via GOOGLE_APPLICATION_CREDENTIALS or env vars)
- Config: `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`

---

*Integration audit: 2026-01-22*
