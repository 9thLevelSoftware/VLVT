# Architecture

**Analysis Date:** 2026-01-22

## Pattern Overview

**Overall:** Microservices architecture with separate backend services (auth, profile, chat) and Flutter frontend communicating via HTTP REST APIs and WebSocket (Socket.IO) for real-time messaging. Provider-based state management on frontend with shared middleware and utilities library.

**Key Characteristics:**
- Three independent Node.js/Express microservices deployed separately
- Frontend uses Provider pattern with ChangeNotifierProxyProvider for dependency injection
- Shared middleware library (`@vlvt/shared`) for common concerns across services
- PostgreSQL as single source of truth with 20+ migration files
- Real-time messaging via Socket.IO for chat service
- Firebase integration for analytics, crash reporting, and push notifications

## Layers

**Frontend Presentation Layer:**
- Purpose: Render UI, handle user interactions, manage theme and navigation
- Location: `frontend/lib/screens/`
- Contains: Screen widgets (auth, discovery, matches, chat, profile, paywall)
- Depends on: Services layer via Provider, theme service
- Used by: User interactions and OS lifecycle events

**Frontend Services Layer (Business Logic):**
- Purpose: Encapsulate domain logic, API communication, state management
- Location: `frontend/lib/services/`
- Contains: AuthService, ProfileApiService, ChatApiService, SocketService, SubscriptionService, LocationService, CacheService, VerificationService, SafetyService, TicketsService, DateProposalService, ThemeService, NotificationService, DeepLinkService, MessageQueueService, AnalyticsService
- Depends on: HTTP client, Firebase Admin SDK, RevenueCat SDK, Socket.io client
- Used by: Screens and Provider tree

**Frontend Provider Configuration:**
- Purpose: Centralized dependency injection and provider setup
- Location: `frontend/lib/providers/provider_tree.dart`
- Contains: Provider definitions grouped by feature (core, discovery, profile, chat, safety, dating)
- Pattern: ChangeNotifierProxyProvider for services depending on AuthService

**Frontend Models:**
- Purpose: Data structures for type safety and serialization
- Location: `frontend/lib/models/`
- Contains: Profile, Match, Message classes with fromJson/toJson factories

**Backend Entry Points:**
- Auth Service: `backend/auth-service/src/index.ts` (port 3001)
- Profile Service: `backend/profile-service/src/index.ts` (port 3002)
- Chat Service: `backend/chat-service/src/index.ts` (port 3003)

**Backend Middleware Layer:**
- Purpose: Cross-cutting concerns (auth, rate limiting, validation, error handling, CORS, security headers)
- Locations:
  - Service-specific: `backend/[service]/src/middleware/`
  - Shared: `backend/shared/src/middleware/`
- Contains: authMiddleware, rate-limiter, error-handler, csrf, request-signing, socket-rate-limiter
- Pattern: Express middleware functions and factories

**Backend Services Layer:**
- Purpose: Business logic, external service integration, data operations
- Locations:
  - Auth: `backend/auth-service/src/services/` (email-service, kycaid-service)
  - Profile: `backend/profile-service/src/services/` (fcm-service for push notifications)
  - Chat: `backend/chat-service/src/services/` (fcm-service)
- Shared: `backend/shared/src/services/` (fcm-service)

**Backend Database Layer:**
- Purpose: Data persistence with PostgreSQL
- Location: `backend/migrations/` (001 through 020 SQL migration files)
- Tables: users, profiles, matches, messages, blocks, reports, typing_indicators, read_receipts, user_subscriptions, password_credentials, refresh_tokens, golden_tickets, date_proposals, verifications, kycaid_verifications, audit_logs, profile_filters

**Backend Shared Library:**
- Purpose: Common utilities and middleware across all services
- Location: `backend/shared/src/`
- Contains:
  - Errors: error-codes, error-response handling
  - Middleware: auth, csrf, rate-limiting, request-signing, api-version
  - Services: fcm-service (Firebase Cloud Messaging)
  - Types: api types, express extensions
  - Utils: audit-logger, env-validator, logger, response formatting

**Frontend Utils & Config:**
- Purpose: Shared utilities, configuration, constants
- Locations:
  - Config: `frontend/lib/config/app_config.dart` (service URLs, environment detection)
  - Constants: `frontend/lib/constants/spacing.dart`
  - Theme: `frontend/lib/theme/` (AppThemes with light/dark modes)
  - Utils: `frontend/lib/utils/`
  - Widgets: `frontend/lib/widgets/` (reusable UI components)

**Socket.IO Real-Time Layer:**
- Purpose: Real-time bidirectional communication for chat
- Backend: `backend/chat-service/src/socket/index.ts`, `socket/auth-middleware.ts`, `socket/message-handler.ts`
- Frontend: `frontend/lib/services/socket_service.dart`
- Events: send_message, typing, mark_read, get_online_status, user:status_changed
- Rate Limited: per-event limits to prevent abuse

## Data Flow

**Authentication Flow:**
1. User enters credentials or initiates social sign-in (Apple/Google)
2. Frontend (AuthService) sends credentials to auth-service
3. Auth-service validates, generates JWT pair (access + refresh tokens)
4. Frontend stores tokens in secure storage via flutter_secure_storage
5. Frontend sets Authorization header for all subsequent requests

**Token Refresh Flow:**
1. On 401 response from API, BaseApiService triggers token refresh
2. Frontend sends refresh token to auth-service `/auth/refresh` endpoint
3. Auth-service validates refresh token, generates new access token
4. Frontend updates stored tokens and retries original request
5. Implements token rotation with reuse detection for security

**Profile Discovery Flow:**
1. User navigates to discovery screen (requires premium or limited free access)
2. ProfileApiService fetches profiles via `/api/v[VERSION]/profiles/discover`
3. Backend profile-service queries matching profiles with geo-proximity filtering
4. Photos resolved from R2 (Cloudflare) via presigned URLs
5. Frontend displays profiles with swipe gestures (like/pass)

**Match & Messaging Flow:**
1. User swipes right (like) on profile
2. ProfileApiService sends like to `/api/profiles/likes`
3. When mutual like detected, backend creates match entry
4. Frontend receives push notification via Firebase
5. User enters chat screen, SocketService connects via Socket.IO
6. Messages sent via socket `send_message` event (rate limited: 30/min)
7. Messages stored in database, broadcast to recipient's socket connection
8. Typing indicators sent via `typing` event (rate limited: 10/10sec)
9. Read receipts sent via `mark_read` event

**Photo Upload Flow:**
1. User selects image via native file picker
2. Frontend validates image (magic bytes, dimensions)
3. Image processed via Sharp (compression, format conversion)
4. Presigned URL obtained from R2 API
5. Image uploaded directly to R2 storage
6. Frontend submits photo metadata to profile-service
7. Backend stores photo references in database

**Subscription Flow:**
1. Frontend initializes RevenueCat SDK with app-specific key
2. RevenueCat manages subscription purchases through app store
3. Frontend queries entitlements to check premium access
4. Backend enforces limits via subscription-middleware (daily action quotas)
5. Free users: 10 daily likes, 20 daily messages
6. Premium users: unlimited access

**State Management Flow:**
1. AuthService provides auth state (token, userId, isAuthenticated)
2. SubscriptionService depends on AuthService, fetches entitlements
3. ProfileApiService and ChatApiService depend on AuthService for auth headers
4. SocketService depends on AuthService for token
5. LocationService depends on ProfileApiService for updates
6. All dependent services recreated when AuthService token changes via ChangeNotifierProxyProvider

**Error Handling:**
- Frontend: BaseApiService catches HTTP errors, implements 401 retry
- Backend: globalErrorHandler middleware in each service
- Errors logged to Sentry if DSN configured
- Audit logs created for security-relevant events
- Rate limit errors trigger backoff and user notification

## Key Abstractions

**ApiResult<T> (Frontend):**
- Purpose: Standardized API response wrapper for type-safe error handling
- Examples: Used in all BaseApiService methods (get, post, patch, delete)
- Pattern: Result type with success() and error() factories
- Methods: getOrThrow(), getRawOrThrow() for exception-based flows

**BaseApiService (Frontend):**
- Purpose: Common HTTP client with auth, retry, and error handling
- Examples: `backend/lib/services/profile_api_service.dart`, chat_api_service.dart
- Pattern: Extends ChangeNotifier, overrides baseUrl in subclass
- Features: Auto-retry on 401, timeout handling, header injection

**ChangeNotifierProxyProvider (Frontend):**
- Purpose: Dependency injection for services depending on AuthService
- Examples: ProfileApiService, ChatApiService, SocketService, LocationService, VerificationService
- Pattern: Recreates dependent service when AuthService token changes
- Benefit: Ensures all dependents use current authentication state

**ErrorResponses (Backend):**
- Purpose: Standardized error response format with error codes
- Location: `backend/shared/src/errors/`
- Pattern: ErrorCodes enum mapped to HTTP status codes and messages
- Usage: sendErrorResponse() helper wraps errors in standard envelope

**Audit Logger (Backend):**
- Purpose: Track security-relevant events for compliance and debugging
- Location: `backend/shared/src/utils/audit-logger.ts`
- Events: User creation, authentication, token refresh, permission changes
- Storage: PostgreSQL audit_log table with user_id, action, resource_type, timestamp

**Socket.IO Rate Limiter:**
- Purpose: Per-event rate limiting for WebSocket connections
- Location: `backend/shared/src/middleware/socket-rate-limiter.ts`
- Configuration: Event-specific limits (send_message: 30/min, typing: 10/10sec)
- Applied to: Each socket connection after authentication

## Entry Points

**Frontend Entry Point:**
- Location: `frontend/lib/main.dart`
- Triggers: App launch from OS
- Responsibilities: Firebase initialization, theme setup, provider tree initialization, auth wrapper
- Special handling: Splash screen, notification tap routing, deep link setup

**Auth Service Entry Point:**
- Location: `backend/auth-service/src/index.ts`
- Triggers: HTTP requests from frontend
- Responsibilities: User registration, login, token management, token refresh, password reset, email verification, Apple/Google sign-in, KYC verification
- Database initialization and pool setup
- Middleware application (auth, rate-limit, CSRF, error handling)

**Profile Service Entry Point:**
- Location: `backend/profile-service/src/index.ts`
- Triggers: HTTP requests from frontend
- Responsibilities: Profile CRUD, photo management, discovery filtering, face verification with Rekognition, ID verification with KYCAid
- Multer setup for photo uploads
- Image processing pipeline with Sharp
- R2 (Cloudflare) integration for storage

**Chat Service Entry Point:**
- Location: `backend/chat-service/src/index.ts`
- Triggers: HTTP requests (REST), WebSocket connections (Socket.IO)
- Responsibilities: Match management, message history, real-time messaging, typing indicators, read receipts, date proposals
- Socket.IO server initialization via `socket/index.ts`
- Push notification delivery via Firebase Admin SDK

## Error Handling

**Strategy:** Multi-layered with frontend fallback and backend audit

**Patterns:**

Frontend (BaseApiService):
```
1. Catch HTTP errors from any source
2. If 401 Unauthorized → attempt token refresh + retry
3. If still fails → logout user
4. Otherwise → return ApiResult.error() to caller
5. Log to console and Sentry in debug mode
```

Backend (globalErrorHandler):
```
1. Catch synchronous and async errors
2. Log with Winston logger (includes context: userId, path, method)
3. Create audit log entry if security-relevant
4. Respond with standardized ErrorResponse envelope
5. Include error code for frontend to handle contextually
6. Hide implementation details in production
```

Socket.IO Error Handling:
```
1. Auth errors → disconnect socket with 'auth_error' reason
2. Rate limit exceeded → emit 'rate_limit_error' event
3. Message handler errors → log and respond with error event to client
4. Disconnection tracked and user status updated after timeout
```

## Cross-Cutting Concerns

**Logging:**
- Frontend: console.log via debugPrint() in debug mode, silent in release
- Backend: Winston logger with custom formatters, log levels (info, debug, warn, error)
- File storage in service-specific `logs/` directories during development
- Sentry integration for production error tracking

**Validation:**
- Frontend: Client-side validation in screens and services
- Backend: Input validation middleware in each service, shared input-validation utils
- Type validation via TypeScript interfaces

**Authentication:**
- Frontend: JWT token stored in flutter_secure_storage, included in Authorization header
- Backend: JWT verified via middleware, signature validation with JWT_SECRET
- Refresh tokens stored as hashes in database for revocation support

**Rate Limiting:**
- HTTP endpoints: express-rate-limit with trust proxy for Railway
- Socket.IO events: Custom socket rate limiter per event type
- Strategy: Fail closed (deny if limit exceeded), backoff handled by client

**CORS & Security:**
- CORS_ORIGIN configured per environment via env vars
- Helmet applied for security headers (CSP, HSTS, X-Frame-Options)
- CSRF protection via cookie validation for state-changing operations
- Socket.IO restricted to WebSocket transport only (no polling)

**Request Signing (Optional):**
- Middleware available in `backend/shared/src/middleware/request-signing.ts`
- Can validate request signatures for API-to-API calls if implemented

**API Versioning:**
- Header-based versioning via `X-API-Version` header
- Current version: tracked in `backend/shared/src/middleware/api-version.ts`
- Routes can be versioned for backward compatibility

---

*Architecture analysis: 2026-01-22*
