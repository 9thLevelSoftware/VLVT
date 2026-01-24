# Technology Stack

**Analysis Date:** 2026-01-24

## Languages

**Primary:**
- TypeScript 5.9.3 - Backend microservices (`backend/auth-service`, `backend/profile-service`, `backend/chat-service`)
- Dart 3.10.1 - Frontend mobile application (`frontend/`)

**Secondary:**
- JavaScript (Node.js) - Database migrations (`backend/migrations/`), seed scripts (`backend/seed-data/`)
- SQL - PostgreSQL schema migrations (`backend/migrations/*.sql`)

## Runtime

**Environment:**
- Node.js v24.5.0 (backend services)
- Flutter 3.38.3 stable (frontend)
- PostgreSQL 15-alpine (database, Docker container)

**Package Manager:**
- npm (backend) - package-lock.json present in all services
- pub (frontend) - pubspec.lock present
- Docker Compose 3.8 - orchestrates services via `docker-compose.yml`

## Frameworks

**Core:**
- Express 5.1.0 - Web framework for all three backend microservices
- Flutter 3.38.3 - Cross-platform mobile framework (iOS, Android)
- Socket.IO 4.7.2 - Real-time bidirectional communication (`chat-service`)

**Testing:**
- Jest 29.7.0 - Unit testing for backend services with ts-jest preset
- flutter_test (SDK) - Widget and unit testing for Flutter app
- Supertest 7.1.4 - HTTP endpoint testing for Express APIs
- Mockito 5.6.1 - Mocking framework for Flutter tests

**Build/Dev:**
- ts-node 10.9.2 - TypeScript execution for development
- TypeScript Compiler (tsc) 5.9.3 - Compilation to JavaScript (ES2020 target, CommonJS modules)
- flutter build - iOS/Android release builds
- Gradle 8+ (Kotlin DSL) - Android build system (`frontend/android/app/build.gradle.kts`)
- Xcode/CocoaPods - iOS build system (`frontend/ios/Runner.xcworkspace`)
- build_runner 2.10.4 - Dart code generation
- json_serializable 6.11.3 - JSON serialization code generation

## Key Dependencies

**Critical:**
- pg 8.16.3 - PostgreSQL client library (all backend services)
- jsonwebtoken 9.0.2 - JWT authentication token handling
- firebase-admin 12.0.0/13.6.0 - Push notifications, crashlytics integration
- purchases_flutter 9.9.9 - RevenueCat SDK for subscription management
- purchases_ui_flutter 9.9.9 - RevenueCat paywall UI components
- sharp 0.33.0 - Image processing for photo uploads (`profile-service`)
- socket_io_client 3.1.3 - Real-time messaging client (`frontend`)

**Infrastructure:**
- winston 3.18.3 - Structured logging across all services
- helmet 8.1.0 - HTTP security headers
- express-rate-limit 7.5.0+ - API rate limiting (varies by service)
- express-validator 7.3.0 - Request validation middleware
- cors 2.8.5 - Cross-origin resource sharing
- dotenv 17.2.3 - Environment variable management
- redis 4.7.1 - Rate limiting and caching
- rate-limit-redis 4.2.3 - Redis adapter for rate limiting
- BullMQ 5.66.7 - Job queue for background tasks (`profile-service`, `chat-service`)
- ioredis 5.9.2 - Redis client for BullMQ
- cookie-parser 1.4.7 - Cookie parsing middleware

**Authentication & Security:**
- bcrypt 6.0.0 - Password hashing (`auth-service`)
- apple-signin-auth 2.0.0 - Apple Sign-In verification (`auth-service`)
- google-auth-library 10.5.0 - Google Sign-In verification (`auth-service`)
- sign_in_with_apple 7.0.1 - Apple Sign-In Flutter SDK
- google_sign_in 7.2.0 - Google Sign-In Flutter SDK
- flutter_secure_storage 10.0.0-beta.5 - Encrypted token storage (keychain/keystore)

**Storage & Cloud Services:**
- @aws-sdk/client-s3 3.946.0 - Cloudflare R2 image storage (`profile-service`)
- @aws-sdk/s3-request-presigner 3.946.0 - Presigned URL generation
- @aws-sdk/client-rekognition 3.946.0 - AWS Rekognition for selfie verification
- multer 1.4.5-lts.1 - Multipart form-data file uploads
- sharp-phash 2.2.0 - Perceptual hashing for duplicate photo detection
- file-type 16.5.4 - File type detection for uploads

**Frontend State & Utilities:**
- provider 6.1.2 - State management pattern (ChangeNotifierProxyProvider)
- http 1.2.1 - HTTP client
- http_parser 4.0.2 - HTTP header parsing
- cached_network_image 3.3.1 - Image caching and display
- geolocator 14.0.1 - GPS location services
- permission_handler 12.0.1 - Runtime permissions (iOS/Android)
- flutter_local_notifications 19.5.0 - Local push notifications
- shared_preferences 2.2.3 - Key-value persistence
- flutter_foreground_task 9.2.0 - Background location tracking for After Hours Mode

**Frontend UI/UX:**
- shimmer 3.0.0 - Loading shimmer effect
- lottie 3.1.2 - Animation library
- flutter_markdown_plus 1.0.5 - Markdown rendering
- flutter_native_splash 2.4.4 - Native splash screen configuration
- flutter_launcher_icons 0.14.3 - App icon generation
- cupertino_icons 1.0.8 - iOS-style icons

**Frontend Media:**
- image_picker 1.1.2 - Camera/gallery access
- camera 0.11.3 - Camera access
- path_provider 2.1.5 - File system paths

**Frontend Integration:**
- connectivity_plus 7.0.0 - Network status monitoring
- app_links 6.4.1 - Deep linking
- url_launcher 6.3.0 - URL opening
- webview_flutter 4.13.0 - WebView embedding
- share_plus 12.0.1 - Share functionality
- device_info_plus 12.3.0 - Device information
- package_info_plus 9.0.0 - App version info

**Frontend Firebase:**
- firebase_core 4.2.1 - Firebase initialization
- firebase_crashlytics 5.0.5 - Crash reporting
- firebase_analytics 12.0.4 - User analytics
- firebase_messaging 16.0.4 - Push notifications

**Frontend Utilities:**
- json_annotation 4.9.0 - JSON serialization annotations
- crypto 3.0.7 - Cryptographic operations

**Monitoring & Observability:**
- @sentry/node 10.25.0 - Error tracking and performance monitoring (all backend services)
- firebase_crashlytics 5.0.5 - Crash reporting (Flutter)
- firebase_analytics 12.0.4 - User analytics (Flutter)

**Email Service (Optional):**
- nodemailer 7.0.11 - Email sending (`auth-service`)

**Shared Package:**
- @vlvt/shared (local monorepo package) - Shared middleware, validators, services across microservices (`backend/shared/`)

## Configuration

**Environment:**
- `.env` files per service (auth, profile, chat) with service-specific vars
- `.env.example` - Template for environment configuration
- `--dart-define` for Flutter build-time configuration (API keys, URLs)
- Docker Compose environment variables for local orchestration
- Railway environment variables for production deployment

**Build:**
- `tsconfig.json` - TypeScript compiler config (target: ES2020, module: commonjs, strict: true)
- `pubspec.yaml` - Flutter dependencies and assets
- `android/app/build.gradle.kts` - Android build configuration (Kotlin DSL, minSdk 21, Java 11)
- `ios/Runner.xcworkspace` - iOS build configuration (Xcode)
- `jest` config embedded in package.json (ts-jest preset, 50% coverage threshold)
- `docker-compose.yml` - Multi-container orchestration (postgres, auth-service, profile-service, chat-service)
- `Dockerfile` per backend service
- `analysis_options.yaml` - Flutter lints configuration
- `flutter_native_splash` config in pubspec.yaml - Splash screen styling
- `flutter_launcher_icons` config in pubspec.yaml - App icon generation

## Platform Requirements

**Development:**
- Node.js 24.5.0 or compatible (backend)
- Flutter SDK 3.38.3 (Dart 3.10.1 included)
- PostgreSQL 15+ (or Docker)
- Redis (for rate limiting and background jobs)
- Android Studio / Xcode for mobile builds
- Docker and Docker Compose (for local full-stack development)

**Production:**
- Railway.app - Backend microservices deployment platform (Docker containers)
- PostgreSQL 15+ database (managed or self-hosted)
- Redis 4.7+ (for distributed rate limiting and job queues)
- Cloudflare R2 - S3-compatible image storage
- AWS Rekognition - Selfie verification API
- Firebase - Push notifications, analytics, crashlytics
- RevenueCat - Subscription infrastructure
- KYCAID - Government ID verification API
- iOS 14.0+ (minimum deployment target)
- Android 5.0+ (API 21+ minimum SDK)

---

*Stack analysis: 2026-01-24*
