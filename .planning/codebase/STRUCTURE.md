# Codebase Structure

**Analysis Date:** 2026-01-24

## Directory Layout

```
VLVT/
├── frontend/                       # Flutter mobile app (iOS/Android)
│   ├── lib/
│   │   ├── main.dart              # App entry point, Firebase init, provider setup
│   │   ├── models/                # Data structures (Profile, Match, Message)
│   │   ├── services/              # Business logic and API clients (26 services)
│   │   ├── screens/               # UI screens (auth, discovery, chat, profile, after_hours, etc)
│   │   ├── providers/             # Provider configuration and dependency injection
│   │   ├── widgets/               # Reusable UI components
│   │   │   ├── after_hours/       # After Hours specific widgets
│   │   │   └── discovery/         # Discovery screen widgets
│   │   ├── theme/                 # AppThemes, light/dark mode definitions
│   │   ├── utils/                 # Helper functions
│   │   ├── config/                # Service URLs and environment configuration
│   │   ├── constants/             # Global constants (spacing, colors)
│   │   └── firebase_options.dart  # Firebase configuration
│   ├── test/                      # Widget and unit tests
│   ├── integration_test/          # E2E tests
│   ├── android/                   # Android native code and configuration
│   ├── ios/                       # iOS native code and configuration
│   ├── assets/                    # Static assets (fonts, images, legal docs)
│   ├── pubspec.yaml               # Dart dependencies
│   └── analysis_options.yaml      # Linting rules (flutter_lints)
│
├── backend/                       # Node.js/TypeScript microservices
│   ├── auth-service/              # Authentication service (port 3001)
│   │   ├── src/
│   │   │   ├── index.ts           # Express app setup, route definitions
│   │   │   ├── middleware/        # Auth, rate-limit, error-handler
│   │   │   ├── services/          # email-service, kycaid-service
│   │   │   ├── utils/             # Crypto, password, validation, logging, cache
│   │   │   ├── types/             # TypeScript type definitions
│   │   │   └── docs/              # Swagger documentation
│   │   ├── tests/                 # Jest test files
│   │   ├── dist/                  # Compiled JavaScript (gitignored)
│   │   ├── logs/                  # Development logs (gitignored)
│   │   ├── package.json           # Dependencies
│   │   ├── tsconfig.json          # TypeScript configuration
│   │   └── jest.config.js         # Jest test runner config
│   │
│   ├── profile-service/           # Profile & discovery service (port 3002)
│   │   ├── src/
│   │   │   ├── index.ts           # Express app setup, routes
│   │   │   ├── middleware/        # Auth, rate-limit, validation, after-hours-validation
│   │   │   ├── routes/            # After Hours routes
│   │   │   ├── services/          # FCM, matching-engine, matching-scheduler, session-scheduler, photo-hash
│   │   │   ├── jobs/              # session-cleanup-job
│   │   │   ├── shared/            # Reused middleware, services, types, utils
│   │   │   └── utils/             # Image handling, geo-redaction, R2 client, logger, id-generator
│   │   ├── tests/                 # Jest test files
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── chat-service/              # Messaging & matches service (port 3003)
│   │   ├── src/
│   │   │   ├── index.ts           # Express app setup, routes
│   │   │   ├── middleware/        # Auth, rate-limit, validation
│   │   │   ├── routes/            # After Hours chat routes
│   │   │   ├── services/          # FCM, after-hours-safety, match-conversion
│   │   │   ├── jobs/              # message-cleanup-job
│   │   │   ├── shared/            # Reused middleware, services, types, utils
│   │   │   ├── socket/            # Socket.IO handlers
│   │   │   │   ├── index.ts       # Socket.IO server initialization
│   │   │   │   ├── auth-middleware.ts  # JWT validation for WebSocket
│   │   │   │   ├── message-handler.ts  # Event handlers (send_message, typing, etc)
│   │   │   │   └── after-hours-handler.ts  # After Hours socket events
│   │   │   └── utils/             # ID generator, logger
│   │   ├── tests/                 # Jest test files
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── shared/                    # Shared library for all services (@vlvt/shared)
│   │   ├── src/
│   │   │   ├── index.ts           # Main exports
│   │   │   ├── errors/            # ErrorCodes enum, error response formatter
│   │   │   ├── middleware/        # Auth, CSRF, rate-limiting, request-signing, API versioning, after-hours-auth
│   │   │   ├── services/          # FCM (Firebase Cloud Messaging)
│   │   │   ├── types/             # Shared TypeScript types (api.ts, express.ts)
│   │   │   └── utils/             # Audit logger, env validator, logger, response formatter
│   │   ├── tests/                 # Shared library tests
│   │   ├── package.json
│   │   └── tsconfig.json
│   │
│   ├── migrations/                # Database schema
│   │   ├── 001_create_users_and_profiles.sql
│   │   ├── 002_create_matches_and_messages.sql
│   │   ├── 003_create_safety_tables.sql
│   │   ├── 004_add_realtime_features.sql
│   │   ├── 005_add_subscriptions_table.sql
│   │   ├── 006_add_auth_credentials.sql
│   │   ├── 007_add_refresh_tokens.sql
│   │   ├── 008_add_golden_tickets.sql
│   │   ├── 009_add_date_proposals.sql
│   │   ├── 010_add_verifications.sql
│   │   ├── 011_add_kycaid_verification.sql
│   │   ├── 012_fix_data_integrity.sql
│   │   ├── 013_security_improvements.sql
│   │   ├── 014_encrypt_kycaid_pii.sql
│   │   ├── 015_hash_verification_tokens.sql
│   │   ├── 016_add_login_attempts.sql
│   │   ├── 017_create_audit_log.sql
│   │   ├── 018_database_audit_triggers.sql
│   │   ├── 019_add_profile_filters.sql
│   │   ├── 020_token_rotation.sql
│   │   ├── 021_add_after_hours_tables.sql
│   │   ├── 022_add_after_hours_preferences_columns.sql
│   │   ├── 023_add_matching_engine_columns.sql
│   │   ├── 024_add_matches_source_column.sql
│   │   └── 025_ban_enforcement.sql
│   │   ├── run_migration.js         # Migration runner script
│   │   └── package.json
│   │
│   ├── seed-data/                 # Test data generation
│   │   ├── package.json
│   │   └── [seed scripts]
│   │
│   ├── Dockerfile                 # Container image for services
│   ├── railway.json               # Railway deployment config
│   └── README.md                  # Backend documentation
│
├── database/                      # Database utilities (if any)
│
├── docs/                          # Documentation
│   ├── features/                  # Feature specifications
│   ├── guides/                    # Developer guides
│   ├── plans/                     # Project plans
│   └── assets/                    # Images, diagrams
│
├── scripts/                       # Utility scripts
│
├── website/                       # Marketing website (separate from app)
│   ├── assets/
│   └── fonts/
│
├── .github/                       # GitHub configuration
│   ├── workflows/                 # CI/CD pipelines
│   └── ISSUE_TEMPLATE/
│
├── .planning/                     # GSD planning documents
│   ├── codebase/                  # Analysis documents (this file)
│   ├── milestones/                # Milestone tracking
│   ├── phases/                    # Phase implementation plans
│   └── research/                  # Research documents
│
├── .claude/                       # Claude agent configuration
├── .gemini/                       # Gemini agent configuration
├── .skills/                       # Agent skill definitions
├── .daem0nmcp/                    # MCP server storage
│
├── docker-compose.yml             # Local development stack
├── CLAUDE.md                      # Project-specific Claude instructions
└── GEMINI.md                      # Project-specific Gemini instructions
```

## Directory Purposes

**Frontend: lib/main.dart:**
- Purpose: App entry point and setup
- Initialization: Firebase, theme service, AfterHours foreground task, provider tree
- Contains: MyApp widget, AuthWrapper for auth state routing
- Special: Global navigator key for notification tap handling

**Frontend: lib/services/**
- Purpose: Business logic and external integrations
- Contains: 26 service classes for different concerns
- Key services:
  - `auth_service.dart`: JWT auth, social sign-in, token refresh
  - `profile_api_service.dart`: Profile CRUD, discovery, photo management
  - `chat_api_service.dart`: Matches, messages, date proposals
  - `socket_service.dart`: Real-time messaging via Socket.IO
  - `subscription_service.dart`: RevenueCat integration, entitlement checks
  - `location_service.dart`: GPS, location-based discovery
  - `notification_service.dart`: Firebase push notifications
  - `cache_service.dart`: Offline caching layer
  - `after_hours_service.dart`: Session management for After Hours mode
  - `after_hours_chat_service.dart`: Ephemeral chat for After Hours matches
  - `after_hours_profile_service.dart`: After Hours profile operations
  - `after_hours_safety_service.dart`: Block and report for After Hours
  - `analytics_service.dart`: Firebase Analytics event tracking
  - `device_fingerprint_service.dart`: Device identification for security
  - `feedback_service.dart`: User feedback submission

**Frontend: lib/screens/**
- Purpose: UI screens for different app features
- Pattern: StatefulWidget per screen route
- Contains: 24+ screen files including auth, discovery, chat, matches, profile, paywall, after_hours
- Naming: `snake_case_screen.dart`
- Special screens:
  - `splash_screen.dart`: Launch animation, initial auth check
  - `auth_screen.dart`: Login/register/forgot password flows
  - `main_screen.dart`: Tab navigation (discovery/matches/chats/profile)
  - `discovery_screen.dart`: Profile browsing with swipe gestures
  - `chat_screen.dart`: Real-time messaging with typing indicators
  - `after_hours_tab_screen.dart`: After Hours mode main screen
  - `after_hours_chat_screen.dart`: Ephemeral chat for After Hours matches

**Frontend: lib/providers/provider_tree.dart**
- Purpose: Centralized provider configuration
- Structure: Organized by feature (core, discovery, profile, chat, safety, dating, afterHours)
- Pattern: ChangeNotifierProxyProvider for dependent services
- Methods: `core()`, `discovery()`, `profile()`, `chat()`, `safety()`, `dating()`, `afterHours()`, `all()`

**Frontend: lib/models/**
- Purpose: Data structures with serialization
- Contains: Profile, Match, Message classes
- Pattern: fromJson() factory and toJson() method for API communication
- Example: `profile.dart` has userId, name, age, bio, photos, interests, distance, isVerified

**Frontend: lib/widgets/**
- Purpose: Reusable UI components
- Contains: Custom buttons, inputs, cards, dialogs, loaders
- Subdirectories:
  - `after_hours/`: After Hours specific widgets
  - `discovery/`: Discovery screen widgets
- Naming: `snake_case.dart` for files, PascalCase for widget classes
- Examples: `vlvt_button.dart`, `vlvt_input.dart`, `vlvt_card.dart`, `premium_gate_dialog.dart`

**Frontend: lib/theme/**
- Purpose: App theme definitions
- Contains: Light/dark theme variants with color palette
- File: `lib/theme/app_themes.dart`

**Frontend: lib/config/app_config.dart**
- Purpose: Environment-specific configuration
- Contains: Service URLs (auth, profile, chat base URLs), API version configuration
- Feature: Auto-detection of localhost vs production based on build mode
- Override: `--dart-define=USE_PROD_URLS=true` for release mode testing

**Frontend: test/**
- Purpose: Widget and unit tests
- Pattern: `filename_test.dart` mirrors `lib/` structure
- Framework: Flutter testing framework with mocked services

**Backend: src/index.ts (all services)**
- Purpose: Express app setup and route definitions
- Initialization: Database pool, Sentry, middleware setup
- Routes: REST endpoints defined inline
- Exports: App instance for testing or HTTP server binding

**Backend: src/middleware/**
- Purpose: Request processing pipeline
- Common files:
  - `auth.ts`: JWT token validation
  - `rate-limiter.ts`: HTTP request rate limiting
  - `error-handler.ts`: Centralized error handling
  - `validation.ts`: Request body validation (service-specific)
  - `after-hours-validation.ts`: After Hours specific validation (profile-service)

**Backend: src/services/**
- Purpose: External service integration and core business logic
- Examples:
  - `email-service.ts`: Send emails (verification codes, password resets)
  - `kycaid-service.ts`: ID verification integration
  - `fcm-service.ts`: Firebase Cloud Messaging for push notifications
  - `matching-engine.ts`: After Hours matching algorithm with Haversine distance
  - `matching-scheduler.ts`: Background job for running matching engine
  - `session-scheduler.ts`: Periodic session expiration checks
  - `photo-hash-service.ts`: Perceptual hashing for duplicate photo detection
  - `after-hours-safety-service.ts`: Safety features for After Hours mode

**Backend: src/jobs/**
- Purpose: Background cron jobs
- Files:
  - `session-cleanup-job.ts`: Clean expired After Hours sessions (profile-service)
  - `message-cleanup-job.ts`: Delete expired After Hours messages (chat-service)
- Pattern: BullMQ job queues with cron schedules

**Backend: src/routes/**
- Purpose: Modular route handlers (used in some services)
- Files:
  - `after-hours.ts`: After Hours session routes (profile-service)
  - `after-hours-chat.ts`: After Hours chat routes (chat-service)

**Backend: src/utils/**
- Purpose: Utility functions
- Common files:
  - `logger.ts`: Winston logger instance
  - `id-generator.ts`: Generate unique IDs for entities
  - `input-validation.ts`: Request validation helpers
  - `crypto.ts`: Token generation and hashing (auth-service)
  - `password.ts`: Password hashing with bcrypt (auth-service)
  - `image-handler.ts`: Photo upload and processing (profile-service)
  - `r2-client.ts`: Cloudflare R2 storage integration (profile-service)
  - `geo-redact.ts`: Coordinate precision reduction for privacy (profile-service)

**Backend: shared/src/**
- Purpose: Shared code across all microservices
- Structure:
  - `errors/`: ErrorCodes enum, error response formatter
  - `middleware/`: auth, CSRF, rate-limiting, request-signing, API versioning, after-hours-auth, socket-rate-limiter
  - `services/`: FCM integration
  - `types/`: TypeScript interfaces for API and Express extensions
  - `utils/`: audit-logger, env-validator, logger, response formatter

**Backend: socket/index.ts (chat-service)**
- Purpose: Socket.IO server initialization and connection handling
- Responsibility: JWT auth for WebSocket, user room management, online status
- Pattern: Middleware-based event handler setup

**Backend: socket/message-handler.ts (chat-service)**
- Purpose: Handle real-time events (send_message, typing, mark_read)
- Responsibility: Message storage, broadcast to recipients, typing indicators
- Rate limiting: Applied per event type

**Backend: socket/after-hours-handler.ts (chat-service)**
- Purpose: Handle After Hours specific WebSocket events
- Events: `after_hours:join_chat`, `after_hours:send_message`, `after_hours:typing`
- Pattern: Ephemeral chat with automatic cleanup

**Backend: migrations/001-025_*.sql**
- Purpose: Schema versioning and data model evolution
- Pattern: Numbered files executed in order, idempotent operations
- Contents: CREATE TABLE, ALTER TABLE, ADD COLUMN, CREATE INDEX operations
- Testing: Migrations run on every test environment setup

**Backend: seed-data/**
- Purpose: Generate test users and data
- Exports: Commands to create google_test001...google_test020 users
- Usage: `npm run seed` populates database with fixtures

## Key File Locations

**Entry Points:**
- `frontend/lib/main.dart`: Flutter app launch
- `backend/auth-service/src/index.ts`: Auth service REST API
- `backend/profile-service/src/index.ts`: Profile service REST API
- `backend/chat-service/src/index.ts`: Chat service REST API + Socket.IO

**Configuration:**
- `frontend/lib/config/app_config.dart`: Service URLs, environment detection, API version
- `backend/auth-service/.env`: JWT_SECRET, DATABASE_URL, CORS_ORIGIN
- `backend/profile-service/.env`: DATABASE_URL, AWS credentials, R2 credentials
- `backend/chat-service/.env`: DATABASE_URL, Firebase credentials
- `frontend/pubspec.yaml`: Dart dependencies
- `backend/*/package.json`: Node dependencies per service
- `docker-compose.yml`: Local development Postgres + services

**Core Logic:**
- `frontend/lib/services/auth_service.dart`: Authentication state and token management
- `frontend/lib/services/socket_service.dart`: Real-time messaging
- `frontend/lib/providers/provider_tree.dart`: Dependency injection setup
- `backend/chat-service/src/socket/index.ts`: WebSocket connection management
- `backend/shared/src/middleware/auth.ts`: JWT validation
- `backend/profile-service/src/services/matching-engine.ts`: After Hours matching algorithm

**Testing:**
- `frontend/test/`: Flutter widget tests
- `backend/*/tests/`: Jest test files (jest.config.js in each service)
- `backend/seed-data/`: Test data setup scripts

**Database:**
- `backend/migrations/`: 25 SQL migration files for schema
- `backend/migrations/run_migration.js`: Migration runner

**Documentation:**
- `docs/features/`: Feature specifications
- `docs/guides/`: Developer setup and patterns
- `CLAUDE.md`: Project-specific Claude instructions (build commands, conventions)
- `GEMINI.md`: Gemini agent instructions
- `.planning/`: GSD planning documents, milestones, phases

## Naming Conventions

**Dart Files (Frontend):**
- Services: `snake_case.dart` (auth_service.dart, socket_service.dart)
- Screens: `snake_case_screen.dart` (discovery_screen.dart, chat_screen.dart)
- Models: `snake_case.dart` (profile.dart, message.dart)
- Widgets: `snake_case.dart` (vlvt_button.dart, premium_gate_dialog.dart)
- Classes: PascalCase (AuthService, SocketService, Profile)

**TypeScript Files (Backend):**
- Files: `kebab-case.ts` (error-handler.ts, auth-middleware.ts)
- Classes: PascalCase (AuthService, KycaidService, AuditLogger)
- Functions: camelCase (validateEmail, sendErrorResponse, issueTokenPair)
- Constants: UPPER_SNAKE_CASE (ACCESS_TOKEN_EXPIRY, MAX_PHOTOS_PER_PROFILE)

**SQL Migration Files:**
- Pattern: `NNN_description_of_change.sql` (001_create_users_and_profiles.sql)
- Numbering: Sequential, padded to 3 digits (001, 002, ..., 025)

**Database Tables:**
- Tables: snake_case (users, user_profiles, messages, swipes, blocks, after_hours_sessions)
- Columns: snake_case (user_id, created_at, is_verified)
- IDs: Primary key named `id`, foreign keys named `{table}_id`
- Timestamps: `created_at` (not null, default now()), `updated_at` (nullable)

**Directories:**
- src/: Source code
- tests/: Test files
- dist/: Compiled output (TypeScript → JavaScript)
- coverage/: Test coverage reports
- node_modules/: Dependencies (not committed)
- build/: Flutter build artifacts (not committed)

## Where to Add New Code

**New REST Endpoint (Backend):**
1. Primary code: `backend/[service]/src/index.ts` - add route handler
2. Or: Create modular route file in `backend/[service]/src/routes/` and import
3. Validation: Use `validateInputMiddleware` or custom validation in route
4. Error handling: Use `asyncHandler()` wrapper and `sendError()` helper
5. Rate limiting: Apply appropriate rate limiter from `middleware/rate-limiter.ts`
6. Tests: Add to `backend/[service]/tests/` matching route path
7. Example: New profile endpoint → add to profile-service/src/index.ts

**New Service (Frontend):**
1. Create file: `frontend/lib/services/feature_service.dart`
2. Extend: `ChangeNotifier` for state management
3. Depend on: Inject AuthService if API auth needed
4. Register: Add to appropriate feature group in `provider_tree.dart`
5. Type it: Add to ProviderTree.all() method
6. Tests: Add to `frontend/test/services/feature_service_test.dart`
7. Example: New verification service → provider_tree.dart profile() group

**New Screen (Frontend):**
1. Create file: `frontend/lib/screens/feature_screen.dart`
2. Extend: StatefulWidget with associated State class
3. Use providers: `context.watch<ServiceName>()` or `context.read<ServiceName>()`
4. Add route: Register in main.dart or router if using navigation package
5. Tests: Add widget test in `frontend/test/screens/feature_screen_test.dart`
6. Example: New profile verification screen → screens/profile_verification_screen.dart

**New Shared Middleware (Backend):**
1. Create file: `backend/shared/src/middleware/middleware_name.ts`
2. Export: From `backend/shared/src/index.ts`
3. Integrate: Import into each service's index.ts and apply to app
4. Tests: Add to shared middleware test suite if created
5. Example: New CORS policy → shared/src/middleware/cors.ts

**New Database Table:**
1. Create migration: `backend/migrations/NNN_description.sql`
2. SQL: Define table, indexes, foreign keys
3. Testing: Test migration runs on clean database
4. Documentation: Update CLAUDE.md or docs/
5. Example: `026_add_user_preferences.sql`

**New Shared Type (Backend):**
1. Add to: `backend/shared/src/types/api.ts` or new file in types/
2. Export: From `backend/shared/src/index.ts`
3. Use in: Type route parameters, responses, shared payloads
4. Example: `backend/shared/src/types/api.ts` - add interface for new entity

**New Widget Component (Frontend):**
1. Create file: `frontend/lib/widgets/widget_name.dart`
2. Or: Add to subdirectory `frontend/lib/widgets/feature/widget_name.dart` for feature-specific widgets
3. Extend: StatelessWidget or StatefulWidget depending on needs
4. Accept parameters: Via constructor
5. Use theme: Access AppThemes via context for colors/typography
6. Tests: Add widget test in `frontend/test/widgets/widget_name_test.dart`
7. Example: New filter chip → widgets/filter_chip_widget.dart

**New Utility Function (Frontend):**
1. Create file: `frontend/lib/utils/utility_name.dart` or add to existing
2. Export: From file or create utils/index.dart for barrel export
3. Reuse: Across multiple widgets/services
4. Test: Add unit test in `frontend/test/utils/utility_name_test.dart`
5. Example: New date formatter → utils/date_utils.dart

**New Utility/Service (Backend):**
1. Location: `backend/shared/src/utils/utility_name.ts` if shared
2. Or: `backend/[service]/src/utils/utility_name.ts` if service-specific
3. Export: From service's index.ts or shared/index.ts
4. Tests: Add Jest test in appropriate tests/ directory
5. Example: New geolocation helper → shared/src/utils/geo-utils.ts

**New Background Job (Backend):**
1. Create file: `backend/[service]/src/jobs/job_name.ts`
2. Use BullMQ: Set up queue and worker with cron schedule
3. Initialize: Call initialization function from service's index.ts
4. Cleanup: Add cleanup handler for graceful shutdown
5. Example: New notification job → profile-service/src/jobs/notification-job.ts

## Special Directories

**frontend/.dart_tool/:**
- Purpose: Flutter build artifacts and cache
- Generated: Yes (by flutter pub get)
- Committed: No (in .gitignore)

**backend/dist/:**
- Purpose: Compiled JavaScript from TypeScript
- Generated: Yes (by npm run build)
- Committed: No (in .gitignore)

**backend/coverage/:**
- Purpose: Test coverage reports
- Generated: Yes (by npm test with coverage)
- Committed: No (in .gitignore)

**backend/node_modules/:**
- Purpose: npm dependencies
- Generated: Yes (by npm install)
- Committed: No (in .gitignore)

**frontend/build/:**
- Purpose: Flutter compiled artifacts
- Generated: Yes (by flutter build)
- Committed: No (in .gitignore)

**backend/logs/:**
- Purpose: Development-time log files
- Generated: Yes (by services during development)
- Committed: No (in .gitignore)

**docs/ and .planning/codebase/:**
- Purpose: Human-readable documentation and analysis
- Generated: Partially (codebase analysis documents)
- Committed: Yes (track documentation)

**.daem0nmcp/:**
- Purpose: MCP server storage for daemon agent
- Generated: Yes (by MCP server)
- Committed: Partial (.daem0nmcp/storage/daem0nmcp.db tracked for state)

**.planning/phases/:**
- Purpose: GSD phase implementation plans
- Generated: By /gsd commands
- Committed: Yes (track project planning)

---

*Structure analysis: 2026-01-24*
