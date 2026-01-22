# Technology Stack

**Analysis Date:** 2026-01-22

## Languages

**Primary:**
- TypeScript 5.9.3 - Backend microservices (Express, Node.js)
- Dart 3.0+ - Flutter frontend (iOS/Android mobile app)

**Secondary:**
- SQL - PostgreSQL database queries and migrations

## Runtime

**Environment:**
- Node.js 18+ (TypeScript compiled to ES2020)
- Flutter SDK 3.0+ with Dart VM

**Package Managers:**
- npm (Node.js) - Backend services and shared packages
- pub (Flutter) - Frontend dependencies
- Lockfiles: `package-lock.json` (npm), `pubspec.lock` (pub)

## Frameworks

**Backend:**
- Express 5.1.0 - HTTP server for auth-service, profile-service, chat-service
- Socket.io 4.7.2 - Real-time messaging (chat-service)
- Jest 29.7.0 - Testing framework

**Frontend:**
- Flutter (latest) - Cross-platform mobile framework
- Provider 6.1.2 - State management (ChangeNotifierProxyProvider pattern)

**Build/Dev:**
- ts-node 10.9.2 - TypeScript execution
- TypeScript Compiler (tsc) 5.9.3 - Compilation to CommonJS
- build_runner 2.10.4 - Dart code generation
- flutter_test - Flutter widget/integration testing

## Key Dependencies

**Backend - Core:**
- `pg` 8.16.3 - PostgreSQL database client
- `jsonwebtoken` 9.0.2 - JWT authentication
- `bcrypt` 6.0.0 - Password hashing
- `express-validator` 7.3.0 - Input validation
- `helmet` 8.1.0 - Security headers
- `express-rate-limit` 7.5.0+ - Rate limiting
- `redis` 4.7.1 - Session/cache storage
- `rate-limit-redis` 4.2.3 - Redis-backed rate limiting
- `winston` 3.18.3 - Structured logging

**Backend - Authentication:**
- `apple-signin-auth` 2.0.0 - Apple Sign-In verification
- `google-auth-library` 10.5.0 - Google OAuth verification
- `nodemailer` 7.0.11 - Email sending (auth-service)

**Backend - Image Processing:**
- `sharp` 0.33.0 - Image resizing/optimization (profile-service)
- `multer` 1.4.5-lts.1 - File upload handling (profile-service)
- `file-type` 16.5.4 - File type detection (profile-service)

**Backend - External Integrations:**
- `firebase-admin` 12.0.0+ - Firebase Cloud Messaging, Crashlytics
- `@aws-sdk/client-s3` 3.946.0 - AWS S3 for image uploads (via Cloudflare R2)
- `@aws-sdk/client-rekognition` 3.946.0 - Face verification (profile-service)
- `@aws-sdk/s3-request-presigner` 3.946.0 - Signed URL generation
- `@sentry/node` 7.0.0+ - Error tracking and monitoring

**Backend - Shared Package:**
- `@vlvt/shared` (local) - Shared middleware, validators, services across microservices

**Frontend - Core:**
- `http` 1.2.1 - HTTP client for API calls
- `flutter_secure_storage` 10.0.0-beta.5 - Secure token storage
- `shared_preferences` 2.2.3 - Local preference storage

**Frontend - Authentication:**
- `sign_in_with_apple` 7.0.1 - Apple Sign-In (iOS)
- `google_sign_in` 7.2.0 - Google Sign-In

**Frontend - Subscriptions & Monetization:**
- `purchases_flutter` 9.9.9 - RevenueCat SDK for subscriptions
- `purchases_ui_flutter` 9.9.9 - RevenueCat paywall UI

**Frontend - Real-time:**
- `socket_io_client` 3.1.3 - Socket.io client for real-time messaging
- `firebase_messaging` 16.0.4 - Push notifications
- `flutter_local_notifications` 19.5.0 - Local notification display

**Frontend - Firebase:**
- `firebase_core` 4.2.1 - Firebase initialization
- `firebase_crashlytics` 5.0.5 - Crash reporting
- `firebase_analytics` 12.0.4 - Analytics tracking

**Frontend - Location & Device:**
- `geolocator` 14.0.1 - GPS location services
- `permission_handler` 12.0.1 - Permission requests (iOS/Android)
- `device_info_plus` 12.3.0 - Device information

**Frontend - Media & UI:**
- `image_picker` 1.1.2 - Camera/gallery access
- `cached_network_image` 3.3.1 - Image caching and display
- `camera` 0.11.3 - Camera access
- `path_provider` 2.1.5 - File system paths
- `webview_flutter` 4.13.0 - WebView embedding
- `lottie` 3.1.2 - Animation library
- `flutter_markdown_plus` 1.0.5 - Markdown rendering
- `shimmer` 3.0.0 - Loading shimmer effect
- `flutter_native_splash` 2.4.4 - Splash screen
- `share_plus` 12.0.1 - Share functionality

**Frontend - Utilities:**
- `connectivity_plus` 7.0.0 - Network status
- `app_links` 6.4.1 - Deep linking
- `url_launcher` 6.3.0 - URL opening
- `json_annotation` 4.9.0 - JSON serialization annotations
- `crypto` 3.0.7 - Cryptographic operations

## Configuration

**Environment:**
Backend services use `.env` files with:
- Database: `DATABASE_URL` (PostgreSQL connection string)
- Security: `JWT_SECRET` (HMAC secret, shared across services)
- External APIs: `APPLE_CLIENT_ID`, `GOOGLE_CLIENT_ID`, `KYCAID_*`, `FIREBASE_*`, `AWS_*`, `R2_*`
- Deployment: `NODE_ENV`, `PORT` per service
- Monitoring: `SENTRY_DSN`
- CORS: `CORS_ORIGIN`

Frontend configuration via:
- `lib/config/app_config.dart` - Service URLs, API keys
- Build-time defines: `--dart-define=USE_PROD_URLS=true` for production
- Debug mode auto-detects localhost; release defaults to Railway URLs

**Build:**

Backend:
- `tsconfig.json` - Target ES2020, CommonJS modules, strict mode enabled
- `jest.config.js` - ts-jest preset, 50% coverage threshold per file

Frontend:
- `pubspec.yaml` - Platform-specific asset loading, font definitions
- `analysis_options.yaml` - flutter_lints configuration
- `flutter_native_splash` config - Splash screen styling
- `flutter_launcher_icons` config - App icon generation

## Platform Requirements

**Development:**

Backend:
- Node.js 18+
- PostgreSQL 15+
- Redis (for session/rate-limit storage)
- Docker (docker-compose with postgres, auth-service, profile-service, chat-service)

Frontend:
- Flutter SDK 3.0+
- Xcode 14+ (iOS)
- Android SDK 21+ (minimum API level)
- Dart SDK 3.0+

**Production:**

Backend:
- Railway Platform (Docker container deployment)
- PostgreSQL 15 (managed by Railway)
- Node.js 18+ runtime
- Environment variables for all external integrations

Frontend:
- iOS 14.0+ (minimum deployment)
- Android 5.0+ (API 21+)
- RevenueCat for subscription management
- Firebase project (analytics, crashlytics, messaging)

---

*Stack analysis: 2026-01-22*
