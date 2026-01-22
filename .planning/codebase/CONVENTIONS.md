# Coding Conventions

**Analysis Date:** 2026-01-22

## Naming Patterns

**Files (TypeScript/Backend):**
- Kebab-case for filenames: `auth-handler.ts`, `error-handler.ts`, `email-service.ts`
- Service files end in `-service.ts`: `email-service.ts`, `kycaid-service.ts`, `fcm-service.ts`
- Utility files in `utils/` folder: `logger.ts`, `password.ts`, `crypto.ts`, `input-validation.ts`
- Middleware files in `middleware/` folder: `auth.ts`, `error-handler.ts`, `rate-limiter.ts`
- Test files use `.test.ts` or `.spec.ts` suffix with same name as source: `auth.test.ts`, `middleware.test.ts`

**Files (Dart/Frontend):**
- Snake_case for all Dart files: `auth_service.dart`, `chat_api_service.dart`, `location_service.dart`
- Screen files in `lib/screens/`: `discovery_screen.dart`, `auth_screen.dart`, `chat_screen.dart`
- Widget files in `lib/widgets/`: `vlvt_button.dart`, `empty_state_widget.dart`
- Service files in `lib/services/`: `auth_service.dart`, `profile_api_service.dart`
- Model files in `lib/models/`: `profile.dart`, `match.dart`, `message.dart`
- Test files use `_test.dart` suffix: `auth_service_test.dart`, `location_service_test.dart`

**Functions/Methods (TypeScript):**
- camelCase for all function names: `validateEmail()`, `hashPassword()`, `generateVerificationToken()`
- Private/internal functions prefixed with underscore: `_generateNonce()`, `_sha256ofString()`, `_loadToken()`
- Express middleware functions: `authenticateJWT()`, `globalErrorHandler()`, `asyncHandler()`
- Factory functions use `create` prefix: `createAuthMiddleware()`, `createLogger()`, `createErrorHandler()`

**Functions/Methods (Dart):**
- camelCase for function and method names: `signInWithApple()`, `refreshToken()`, `initializeDiscovery()`
- Private methods prefixed with underscore: `_loadToken()`, `_sha256ofString()`, `_initializeDiscovery()`
- Getter methods can be properties via `get` keyword
- Async methods explicitly marked with `Future<T>`

**Variables/Properties (TypeScript):**
- camelCase for all variable and property names: `_token`, `_isAuthenticated`, `_refreshToken`, `userId`, `accessToken`
- Private instance variables prefixed with underscore: `_token`, `_isRefreshing`, `_googleSignIn`
- Constants in SCREAMING_SNAKE_CASE: `JWT_SECRET`, `ACCESS_TOKEN_EXPIRY`, `REFRESH_TOKEN_EXPIRY_MS`, `CORS_ORIGIN`
- Configuration objects use camelCase properties

**Variables/Properties (Dart):**
- camelCase for local variables and properties: `_currentProfileIndex`, `_isLoading`, `_filteredProfiles`
- Private variables prefixed with underscore: `_token`, `_isAuthenticated`, `_photoPageController`
- Constants in camelCase (not SCREAMING_CASE): `defaultDuration`, `maxRetries`
- Final fields clearly marked: `final String userId`

**Types/Interfaces (TypeScript):**
- PascalCase for all type/interface names: `AppError`, `ErrorResponse`, `JWTPayload`, `EmailOptions`, `EmailConfig`
- Interface names describe the contract: `AuthMiddlewareOptions`, `SignatureMiddlewareOptions`, `RateLimiterOptions`
- Enum values in SCREAMING_SNAKE_CASE: `ERROR_CODES`, `API_VERSIONS`
- Generic type parameters use single capital letter or descriptive PascalCase: `T`, `K`, `V`, or `JWTPayload`

**Classes (Dart):**
- PascalCase for all class names: `AuthService`, `Profile`, `DiscoveryScreen`, `DiscoveryScreenState`
- State classes follow Flutter convention: `_DiscoveryScreenState`, `_ChatScreenState`
- Model classes are simple data holders: `Profile`, `Match`, `Message`
- Service classes handle business logic: `AuthService`, `ChatApiService`, `ProfileApiService`

## Code Style

**Formatting (TypeScript):**
- 2-space indentation (set in tsconfig.json)
- Single quotes for strings: `'auth_token'`, `'user_id'`
- Semicolons at end of statements
- No trailing commas in function parameters
- Files must have newline at end

**Formatting (Dart):**
- 2-space indentation (enforced by Dart/Flutter)
- Single quotes for strings: `'auth_token'`, `'user_id'`
- Semicolons at end of statements
- Trailing commas in multiline constructs (Flutter convention)
- Files must have newline at end

**TypeScript Compiler Settings:**
- Target: ES2020
- Module: commonjs
- Strict: true (enables strict null checks, strict function types, etc.)
- esModuleInterop: true
- skipLibCheck: true
- forceConsistentCasingInFileNames: true
- resolveJsonModule: true

**Dart Analysis:**
- Uses `package:flutter_lints/flutter.yaml` from analysis_options.yaml
- No custom lint rules disabled by default
- Can suppress individual lints with `// ignore: lint_name`

## Import Organization

**TypeScript Order:**
1. External packages (npm): `import express from 'express'`, `import jwt from 'jsonwebtoken'`
2. Node built-ins: `import { Request, Response } from 'express'`
3. Type imports: `import type { JWTPayload } from '../types'`
4. Relative imports from same directory: `import logger from './logger'`
5. Relative imports from parent/sibling: `import { validateEmail } from '../utils/input-validation'`
6. Path aliases (if configured): `import { authMiddleware } from '@vlvt/shared'`

**Dart Order:**
1. Dart imports: `import 'dart:async'`, `import 'dart:convert'`
2. Flutter imports: `import 'package:flutter/material.dart'`
3. Package imports: `import 'package:provider/provider.dart'`, `import 'package:http/http.dart' as http`
4. Relative imports: `import '../services/auth_service.dart'`
5. Conditional imports (if needed): `import 'file.dart' if (dart.library.io) 'file_io.dart'`

**Path Aliases:**
- Backend: Uses monorepo structure with `@vlvt/shared` package
- Frontend: Uses relative paths, no aliases configured in analysis
- Each service has its own node_modules structure

## Error Handling

**TypeScript Patterns:**

Throw AppError instances with statusCode, errorCode, and message:
```typescript
throw new AppError(
  'Invalid email format',
  400,
  'VALIDATION_ERROR',
  true,
  { field: 'email' }
);
```

Catch JWT-specific errors:
```typescript
if (error instanceof jwt.TokenExpiredError) {
  // Handle token expired
}
if (error instanceof jwt.JsonWebTokenError) {
  // Handle invalid token
}
```

Log errors with context and redact sensitive data:
```typescript
logger.error('Operation failed', {
  error: err.message,
  stack: err.stack,
  userId: req.user?.userId,
  isOperational: true
});
```

Standardized error responses in all services:
```typescript
{
  success: false,
  error: 'Error message',
  code: 'ERROR_CODE',
  timestamp: new Date().toISOString()
}
```

**Dart Patterns:**

Try-catch with specific exception handling:
```dart
try {
  final response = await http.post(...);
  // Handle response
} catch (e) {
  debugPrint('Error: $e');
  // Handle error
}
```

Return null or empty collection for errors:
```dart
Future<List<Profile>> getProfiles() async {
  try {
    // Fetch profiles
    return profiles;
  } catch (e) {
    debugPrint('Failed to load profiles: $e');
    return [];
  }
}
```

Use ChangeNotifier error states:
```dart
String? _errorMessage;
void _handleError(String message) {
  _errorMessage = message;
  notifyListeners();
}
```

## Logging

**Framework (TypeScript):**
- Winston logger with structured logging
- Configured in `src/utils/logger.ts` in each service
- Integrates with Sentry for error reporting

**Patterns:**

Log levels by use case:
- `logger.info()`: Service startup, major operations, user actions
- `logger.warn()`: Validation failures, configuration issues, degraded state
- `logger.error()`: Exceptions, failed operations, security events

Redaction of sensitive data:
```typescript
// Email redaction
redactEmail('user@example.com') // Returns 'u***@example.com'

// Sensitive field redaction (auto-applied)
// tokens, passwords, secrets, apiKeys, bearer, jwt, code all become '[REDACTED]'
```

Always include context:
```typescript
logger.info('User authenticated', {
  userId: decoded.userId,
  provider: decoded.provider,
  email: redactEmail(decoded.email)
});
```

Conditional logging by environment:
- Production: JSON format for structured logging
- Development: Colorized console output with pretty-printed metadata
- Test: Silent mode (console methods mocked)

**Dart/Frontend:**
- `debugPrint()` for development logging (only prints in debug mode)
- Firebase Crashlytics for error reporting (enabled only in release mode)
- No Winston or structured logging on frontend

Patterns:
```dart
debugPrint('Firebase initialized successfully');
if (!kDebugMode) {
  // Only in release mode - report to Crashlytics
}
```

## Comments

**When to Comment (TypeScript):**

Document complex logic:
```typescript
// Generate cryptographically random nonce for Apple Sign-In CSRF protection
String _generateNonce([int length = 32]) { ... }

// SQL injection pattern detection - blocks SQL keywords and dangerous operators
const SQL_INJECTION_PATTERNS = [ ... ];
```

Document security decisions:
```typescript
// Critical security fix: Remove fallback to prevent secret exposure
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET environment variable is required and was not provided');
  process.exit(1);
}
```

Document non-obvious parameter choices:
```typescript
// Access tokens are short-lived for security, refresh tokens are long-lived
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
```

**JSDoc/TSDoc Documentation:**

Use JSDoc for public API functions:
```typescript
/**
 * Validate and sanitize string input
 * @param input String to validate
 * @param fieldName Name of the field for logging
 * @returns Sanitized string or throws error
 */
export function validateAndSanitizeString(input: string, fieldName: string): string { ... }
```

Document middleware behavior:
```typescript
/**
 * Global error handling middleware
 * Handles all unhandled errors and converts them to consistent response format
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void { ... }
```

**Dart Comments:**

Use `///` for public documentation:
```dart
/// Whether user has completed selfie verification
final bool isVerified;

/// Distance in kilometers from current user
final double? distance;
```

Use `//` for implementation comments:
```dart
// Undo functionality
Profile? _lastProfile;

// Animation
late AnimationController _cardAnimationController;
```

## Function Design

**Size (TypeScript):**
- Most functions 20-50 lines
- Complex functions broken into smaller helpers
- Services typically have 3-8 public methods
- Controllers should delegate to services, not contain business logic

**Parameters:**
- Maximum 3-4 positional parameters
- Use options object for more: `createAuthMiddleware(options: AuthMiddlewareOptions)`
- Required parameters first, optional after

**Return Values:**
- TypeScript: Use types `Promise<T>`, `T | null`, `T | undefined` explicitly
- Dart: Use `Future<T>`, `T?`, `List<T>`, `Map<String, dynamic>` explicitly
- Avoid bare `any` or `dynamic` except when unavoidable (mocking, JSON parsing)

**Async Pattern (TypeScript):**
```typescript
// Prefer async/await
async function refreshToken(): Promise<boolean> {
  try {
    const response = await http.post(...);
    return response.statusCode === 200;
  } catch (e) {
    logger.error('Token refresh error', { error: e });
    return false;
  }
}
```

**Async Pattern (Dart):**
```dart
Future<bool> refreshToken() async {
  try {
    final response = await http.post(...);
    return response.statusCode == 200;
  } catch (e) {
    debugPrint('Token refresh error: $e');
    return false;
  }
}
```

## Module Design

**Exports (TypeScript):**

Named exports for reusability:
```typescript
export class AppError extends Error { ... }
export function globalErrorHandler(...) { ... }
export interface ErrorResponse { ... }
```

Default export only for entry points (`src/index.ts` exports app):
```typescript
export default app;
```

Shared utilities are re-exported from index for convenience:
```typescript
// In @vlvt/shared/src/index.ts
export * from './types/express';
export { authMiddleware, authenticateJWT } from './middleware/auth';
```

**Barrel Files (Dart):**

Common pattern for organizing exports in widgets:
```dart
// lib/widgets/discovery/discovery_widgets.dart
export 'discovery_action_buttons.dart';
export 'discovery_profile_card.dart';
export 'swipe_hint_indicator.dart';

// Usage in screens:
import '../widgets/discovery/discovery_widgets.dart';
```

**Service Pattern (Both Languages):**

TypeScript services:
- Constructor initializes config/dependencies
- Private methods for internal logic
- Public methods for external API
- Singleton or dependency-injected instance

Dart services:
- Extend `ChangeNotifier` for state management
- Private fields with underscore prefix
- Public getters for exposed state
- Explicit `notifyListeners()` after state changes

Example TypeScript:
```typescript
class EmailService {
  private config: EmailConfig;
  private transporter: Transporter | null = null;

  constructor() {
    this.config = this.loadConfig();
    this.initializeTransporter();
  }

  private loadConfig(): EmailConfig { ... }
  private initializeTransporter(): void { ... }
  public async sendEmail(options: EmailOptions): Promise<boolean> { ... }
}
```

Example Dart:
```dart
class AuthService extends ChangeNotifier {
  String? _token;
  bool _isAuthenticated = false;

  String? get token => _token;
  bool get isAuthenticated => _isAuthenticated;

  Future<bool> signInWithGoogle() async {
    // Logic
    _isAuthenticated = true;
    notifyListeners();
    return true;
  }
}
```

---

*Convention analysis: 2026-01-22*
