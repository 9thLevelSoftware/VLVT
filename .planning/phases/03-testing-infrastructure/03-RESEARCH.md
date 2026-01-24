# Phase 3: Testing Infrastructure - Research

**Researched:** 2026-01-24
**Domain:** Jest/TypeScript backend testing, Flutter frontend testing, test coverage for critical paths
**Confidence:** HIGH

## Summary

This phase focuses on establishing comprehensive automated test coverage for critical application flows. The VLVT codebase already has substantial testing infrastructure in place - Jest 29 with ts-jest for all three backend services (auth-service, profile-service, chat-service), and Flutter test with Mockito for the frontend.

The primary blockers are:
1. **Jest config conflicts** - Services have both `jest.config.js` files AND `jest` keys in `package.json`, causing Jest to refuse to run
2. **Incomplete test coverage** for critical flows (After Hours, security regressions)
3. **Frontend tests** are minimal shell implementations rather than meaningful assertions

**Primary recommendation:** Fix Jest config conflicts first (delete `jest` keys from package.json, keep `jest.config.js`), then expand test coverage for untested critical paths following existing test patterns.

## Standard Stack

The established libraries/tools for this domain:

### Backend (Node.js/TypeScript)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| jest | ^29.7.0 | Test runner and assertions | Industry standard for Node.js, already installed |
| ts-jest | ^29.4.5 | TypeScript compilation for Jest | Required for TypeScript testing, already installed |
| supertest | ^7.1.4 | HTTP assertion library | Standard for Express API testing, already installed |
| @types/jest | ^29.5.14 | TypeScript types for Jest | Required for type safety in tests |

### Frontend (Flutter)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| flutter_test | SDK | Widget and unit testing | Built-in Flutter testing framework |
| mockito | ^5.6.1 | Mock generation | Standard Dart mocking library, already installed |
| integration_test | SDK | End-to-end testing | Built-in Flutter integration testing |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Jest | Vitest | Faster, but Jest is already configured and familiar |
| Supertest | Pactum | More features, but supertest is simpler and adequate |
| Mockito | Mocktail | Simpler API, but Mockito already in use |

**No additional installation required** - all dependencies are already present.

## Architecture Patterns

### Current Backend Test Structure (to follow)
```
backend/{service}/
├── src/                 # Source code
├── tests/
│   ├── setup.ts         # Test environment setup (env vars, console mocking)
│   ├── *.test.ts        # Test files following {feature}.test.ts naming
│   └── utils/           # Test utilities (location-fuzzer.test.ts pattern)
└── jest.config.js       # Jest configuration (authoritative)
```

### Existing Test Pattern: Unit Test with Mocked Dependencies
**What:** Mock pg Pool, external services (Sentry, Firebase, Auth libraries) at module level, then import app
**When to use:** All backend service tests
**Example:**
```typescript
// Source: backend/auth-service/tests/auth.test.ts
// Mock dependencies before importing the app
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  setupExpressErrorHandler: jest.fn(),
}));

import request from 'supertest';
import { Pool } from 'pg';
import app from '../src/index';

describe('Feature Name', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = new Pool();
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  it('should do something', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [{ id: '1' }] });

    const response = await request(app)
      .get('/endpoint')
      .set('Authorization', `Bearer ${validToken}`)
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
```

### Existing Test Pattern: Flutter Service Test
**What:** Generate mocks with @GenerateMocks, use setUp to initialize
**When to use:** All Flutter service tests
**Example:**
```dart
// Source: frontend/test/services/auth_service_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

import 'auth_service_test.mocks.dart';

@GenerateMocks([FlutterSecureStorage, http.Client])
void main() {
  group('AuthService Tests', () {
    late MockFlutterSecureStorage mockStorage;
    late MockClient mockHttpClient;

    setUp(() {
      mockStorage = MockFlutterSecureStorage();
      mockHttpClient = MockClient();
    });

    test('should store token on successful login', () async {
      when(mockHttpClient.post(any, headers: anyNamed('headers'), body: anyNamed('body')))
          .thenAnswer((_) async => http.Response(responseBody, 200));
      // ... assertions
    });
  });
}
```

### Anti-Patterns to Avoid
- **Multiple Jest configs:** Having both `jest.config.js` AND `jest` key in package.json causes Jest to fail
- **Importing app before mocks:** Jest.mock calls must come before imports
- **Not resetting mocks:** Always call `jest.clearAllMocks()` in beforeEach
- **Incomplete mock chains:** When mocking pg Pool.query sequences, mock ALL expected calls

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP request testing | Manual fetch/axios calls | supertest | Already integrated, handles Express app |
| JWT generation for tests | Manual token crafting | jsonwebtoken.sign() | Already used, maintains consistency |
| Mock object creation | Manual spy objects | jest.fn() and jest.mock() | Better tracking, auto-reset |
| Flutter async testing | Manual Future handling | thenAnswer() with async | Mockito handles timing correctly |
| Test user tokens | Hardcoded strings | Generate in test setup | Avoids expiration issues |

**Key insight:** The test infrastructure is mature - patterns exist for every test type needed. Copy existing patterns rather than inventing new approaches.

## Common Pitfalls

### Pitfall 1: Jest Config Conflict (BLOCKING)
**What goes wrong:** Jest refuses to run, exits with error about multiple configs
**Why it happens:** Both `jest.config.js` and `jest` key in package.json exist
**How to avoid:** Delete the `jest` key from package.json in all three services, keep only `jest.config.js`
**Warning signs:** `Multiple configurations found` error when running `npm test`

### Pitfall 2: Mock Order Matters
**What goes wrong:** Tests fail with "cannot read property of undefined" or mocks not being used
**Why it happens:** `jest.mock()` hoisted but import happens before mock setup
**How to avoid:** Place ALL jest.mock() calls at very top of file, before any imports
**Warning signs:** Mocked module still runs real code

### Pitfall 3: Mock Pool Query Sequence Mismatch
**What goes wrong:** Tests fail because wrong mock data returned
**Why it happens:** Pool.query is called multiple times, mocks consumed in order
**How to avoid:** Use mockResolvedValueOnce() for each expected query, in exact order
**Warning signs:** Test expects user data but gets empty array

### Pitfall 4: Inconsistent Coverage Thresholds
**What goes wrong:** CI may fail if coverage thresholds mismatch between config file and package.json
**Why it happens:** jest.config.js has 30% threshold, package.json `jest` key has 50%
**How to avoid:** Remove package.json `jest` key entirely
**Warning signs:** Tests pass locally but fail in CI

### Pitfall 5: Flutter Mock Generation Not Run
**What goes wrong:** Import errors for `.mocks.dart` files
**Why it happens:** build_runner not executed after adding @GenerateMocks
**How to avoid:** Run `flutter pub run build_runner build` after adding new mocks
**Warning signs:** `Could not find auth_service_test.mocks.dart`

## Code Examples

Verified patterns from the existing codebase:

### Creating JWT Tokens for Tests
```typescript
// Source: backend/auth-service/tests/auth.test.ts
const JWT_SECRET = process.env.JWT_SECRET!;

const validToken = jwt.sign(
  { userId: 'user_1', provider: 'google', email: 'user1@example.com' },
  JWT_SECRET,
  { expiresIn: '7d' }
);
```

### Mocking @vlvt/shared Package
```typescript
// Source: backend/auth-service/tests/token-rotation.test.ts
jest.mock('@vlvt/shared', () => ({
  createCsrfMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  createCsrfTokenHandler: jest.fn(() => (req: any, res: any) => res.json({ token: 'mock-token' })),
  createAuditLogger: jest.fn(() => ({
    logAction: jest.fn().mockResolvedValue(undefined),
  })),
  AuditAction: { LOGIN: 'LOGIN', /* ... */ },
  AuditResourceType: { USER: 'USER', /* ... */ },
  addVersionToHealth: jest.fn((obj: any) => obj),
  createVersionMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  API_VERSIONS: { V1: 'v1' },
  CURRENT_API_VERSION: 'v1',
  ErrorCodes: {},
  sendErrorResponse: jest.fn(),
  createErrorResponseSender: jest.fn(() => jest.fn()),
}));
```

### Mocking PostgreSQL Transaction
```typescript
// Source: backend/auth-service/tests/auth.test.ts
const mockClient = {
  query: jest.fn()
    .mockResolvedValueOnce({ rows: [] }) // BEGIN
    .mockResolvedValueOnce({ rows: [] }) // INSERT INTO users
    .mockResolvedValueOnce({ rows: [] }) // INSERT INTO auth_credentials
    .mockResolvedValueOnce({ rows: [] }), // COMMIT
  release: jest.fn(),
};
mockPool.connect = jest.fn().mockResolvedValue(mockClient);
```

### Socket.IO Handler Testing
```typescript
// Source: backend/chat-service/tests/socket-handlers.test.ts
let socketEventHandlers: Record<string, Function>;

mockSocket = {
  id: 'socket_123',
  userId: 'user_1',
  on: jest.fn(function(this: any, event: string, handler: Function) {
    socketEventHandlers[event] = handler;
    return this;
  }),
} as any;

// Later: invoke captured handler
await socketEventHandlers['send_message']({ matchId: 'match_1', text: 'Hello!' }, mockCallback);
```

### RevenueCat Testing Strategy
For RevenueCat subscription testing in Flutter:
```dart
// Create an abstraction layer around Purchases
abstract class SubscriptionRepository {
  Future<CustomerInfo> getCustomerInfo();
  Future<CustomerInfo> purchasePackage(Package package);
  Future<CustomerInfo> restorePurchases();
}

// Mock implementation for tests
class MockSubscriptionRepository implements SubscriptionRepository {
  CustomerInfo? mockCustomerInfo;

  @override
  Future<CustomerInfo> getCustomerInfo() async => mockCustomerInfo!;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| jest.config.js OR package.json jest | jest.config.js only | Jest 28+ | Single source of truth |
| Callback-based tests | async/await with supertest | 2020+ | Cleaner test code |
| Manual mock cleanup | jest.clearAllMocks() | Jest 24+ | Automatic reset |
| Flutter test + manual mocks | Mockito + build_runner | 2021+ | Generated type-safe mocks |

**Deprecated/outdated:**
- package.json `jest` key: Causes conflicts, remove in favor of jest.config.js
- @GenerateMocks without running build_runner: Mocks won't exist

## Existing Test Coverage Analysis

### Backend Services - Existing Tests
| Service | Test File | Coverage Area |
|---------|-----------|---------------|
| auth-service | auth.test.ts | Google/Apple OAuth, email auth, verify, forgot/reset |
| auth-service | account-lockout.test.ts | Failed attempts, locking, unlock timing |
| auth-service | token-rotation.test.ts | Refresh token rotation, reuse detection |
| auth-service | revenuecat-webhook.test.ts | Webhook auth validation |
| auth-service | security-tests.ts | SQL injection, XSS, input validation |
| profile-service | profile.test.ts | CRUD operations, authorization |
| profile-service | image-validation.test.ts | Photo upload validation |
| chat-service | chat.test.ts | Matches, messages, blocks, reports |
| chat-service | socket-handlers.test.ts | Socket.IO auth, messaging, typing, status |
| shared | csrf.test.ts, audit-logger.test.ts, etc. | Shared middleware/utilities |

### Gaps Requiring New Tests (TEST-01 through TEST-06)
| Requirement | Gap | Recommended Test File |
|-------------|-----|----------------------|
| TEST-01 | Logout flow not tested | auth-service/tests/auth.test.ts |
| TEST-02 | RevenueCat entitlement checks | auth-service/tests/subscription.test.ts (new) |
| TEST-03 | Swipe flow not tested | profile-service/tests/swipe.test.ts (new) |
| TEST-05 | After Hours flows | chat-service/tests/after-hours.test.ts (new) |
| TEST-06 | Security regression tests | Consolidate security-tests.ts into regression suite |

### Frontend - Existing Tests
| Test File | Coverage Area | Quality |
|-----------|---------------|---------|
| auth_service_test.dart | Token storage, login state | Minimal - mostly null checks |
| subscription_service_test.dart | Demo mode limits | Logic only - no service integration |
| chat_api_service_test.dart | API calls | Unknown coverage |
| socket_service_test.dart | Socket connection | Unknown coverage |

## Open Questions

Things that couldn't be fully resolved:

1. **After Hours table schema**
   - What we know: Routes reference `after_hours_matches`, `after_hours_messages` tables
   - What's unclear: Exact schema, timestamps, foreign keys
   - Recommendation: Check migration files or database schema before writing tests

2. **RevenueCat webhook format**
   - What we know: Authorization header checked, event types exist
   - What's unclear: Full event payload structure for all subscription events
   - Recommendation: Reference RevenueCat docs for exact payload structure

3. **Existing test failures**
   - What we know: Pre-existing failures mentioned in phase context
   - What's unclear: Which specific tests fail, root causes
   - Recommendation: Run tests after fixing config conflict to identify failures

## Sources

### Primary (HIGH confidence)
- Existing test files in backend/*/tests/ directories
- jest.config.js and package.json files in each service
- frontend/pubspec.yaml and test/ directory structure

### Secondary (MEDIUM confidence)
- [Jest Configuration Documentation](https://jestjs.io/docs/configuration) - Jest 29 config patterns
- [ts-jest Configuration](https://huafu.github.io/ts-jest/user/config/) - TypeScript integration
- [Flutter Mock dependencies](https://docs.flutter.dev/cookbook/testing/unit/mocking) - Mockito patterns

### Tertiary (LOW confidence)
- [RevenueCat Test Store](https://www.revenuecat.com/blog/engineering/testing-test-store/) - Testing without real payments
- Community patterns for Socket.IO testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed and in use
- Architecture: HIGH - Patterns extracted from existing codebase
- Pitfalls: HIGH - Jest config conflict confirmed by running tests
- Test gaps: MEDIUM - Based on requirements mapping, not full code audit

**Research date:** 2026-01-24
**Valid until:** 2026-02-24 (30 days - stable testing stack)
