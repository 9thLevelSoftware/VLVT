# Testing Patterns

**Analysis Date:** 2026-01-22

## Test Framework

**Backend (Node.js/TypeScript):**

**Runner:**
- Jest 29.7.0
- Config: `jest.config.js` in each service (auth-service, profile-service, chat-service)
- TypeScript support via `ts-jest` 29.4.5
- Supertest for HTTP testing

**Assertion Library:**
- Jest built-in expect() function
- Additional matchers from jest-extended (through supertest)

**Run Commands:**

All services follow the same npm script pattern:
```bash
npm test                    # Run all tests once
npm run test:watch         # Run tests in watch mode
npm run test:coverage      # Generate coverage report (text + lcov + html)
npm run test:ci            # CI mode with coverage (text-summary reporter)

# Run single test file
npm test -- --testPathPattern="auth.test.ts"
```

## Test File Organization

**Location:**

Backend: Co-located in separate `tests/` directory at service root:
```
backend/auth-service/
├── src/
│   ├── index.ts
│   ├── middleware/
│   ├── services/
│   └── utils/
├── tests/
│   ├── setup.ts           # Jest setup file
│   ├── auth.test.ts
│   ├── middleware.test.ts
│   └── *.test.ts
├── jest.config.js
└── tsconfig.json
```

Frontend: Co-located with source in `test/` directory:
```
frontend/
├── lib/
│   ├── services/
│   │   ├── auth_service.dart
│   │   └── ...
│   └── models/
├── test/
│   ├── services/
│   │   ├── auth_service_test.dart
│   │   ├── auth_service_test.mocks.dart
│   │   └── ...
│   └── ...
└── pubspec.yaml
```

**Naming:**

Backend:
- `[feature].test.ts` or `[feature].spec.ts`
- Examples: `auth.test.ts`, `middleware.test.ts`, `rate-limiter.test.ts`
- Setup file: `setup.ts`

Frontend:
- `[service]_test.dart`
- Mock files auto-generated: `[service]_test.mocks.dart`
- Examples: `auth_service_test.dart`, `location_service_test.dart`

**Structure:**

Jest looks for test files with patterns defined in jest.config.js:
```javascript
testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts']
```

## Test Structure

**Backend Suite Organization:**

Describe blocks for feature grouping:
```typescript
describe('Auth Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = new Pool();
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        service: 'auth-service',
      });
    });
  });

  describe('POST /auth/google', () => {
    beforeEach(() => {
      // Test-specific setup
    });

    it('should authenticate with valid Google token', async () => {
      // Arrange
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Act
      const response = await request(app)
        .post('/auth/google')
        .send({ idToken: 'valid_google_token' })
        .expect(200);

      // Assert
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
    });

    it('should return 400 for missing idToken', async () => {
      const response = await request(app)
        .post('/auth/google')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('idToken is required');
    });
  });
});
```

**Patterns:**

Setup with `beforeEach()`:
- Clear all mocks: `jest.clearAllMocks()`
- Reset modules if needed: `jest.resetModules()`
- Reinitialize mock instances
- Set default mock return values

Teardown rarely needed (Jest handles cleanup):
```typescript
afterEach(() => {
  // Usually not needed - mocks are cleared in beforeEach
});
```

Assertion patterns (Supertest + Jest):
```typescript
// Status code assertion
const response = await request(app)
  .get('/endpoint')
  .expect(200);

// Response body assertions
expect(response.body.success).toBe(true);
expect(response.body).toHaveProperty('token');
expect(response.body.matches).toBeInstanceOf(Array);

// Header assertions
expect(response.headers['content-type']).toMatch(/json/);
```

**Dart Test Structure:**

Flutter test format with mocking:
```dart
import 'package:flutter_test/flutter_test.dart';
import 'package:mockito/mockito.dart';
import 'package:mockito/annotations.dart';

@GenerateMocks([FlutterSecureStorage, http.Client])
void main() {
  group('AuthService Tests', () => {
    late MockFlutterSecureStorage mockStorage;
    late MockClient mockHttpClient;

    setUp(() {
      mockStorage = MockFlutterSecureStorage();
      mockHttpClient = MockClient();
    });

    test('should initialize with no token', () {
      expect(mockStorage, isNotNull);
    });

    test('should store token on successful login', () async {
      final responseBody = json.encode({
        'success': true,
        'token': 'test_jwt_token',
        'userId': 'test_user_123',
      });

      when(mockHttpClient.post(
        any,
        headers: anyNamed('headers'),
        body: anyNamed('body'),
      )).thenAnswer((_) async => http.Response(responseBody, 200));

      // Act and assert
      expect(mockStorage, isNotNull);
    });
  });
}
```

## Mocking

**Framework (Backend):**
- Jest built-in jest.mock()
- Supertest for HTTP mocking
- No external mocking library needed

**Patterns:**

Mock before importing the app:
```typescript
// Mock dependencies BEFORE importing app
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

jest.mock('google-auth-library');
jest.mock('apple-signin-auth', () => ({
  verifyIdToken: jest.fn(),
}));

// NOW import app
import request from 'supertest';
import app from '../src/index';
```

Mock external libraries:
```typescript
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  setupExpressErrorHandler: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));
```

Mock rate limiters to bypass them in tests:
```typescript
jest.mock('../src/middleware/rate-limiter', () => ({
  authLimiter: (req: any, res: any, next: any) => next(),
  verifyLimiter: (req: any, res: any, next: any) => next(),
  generalLimiter: (req: any, res: any, next: any) => next(),
}));
```

Mock services:
```typescript
jest.mock('../src/services/email-service', () => ({
  emailService: {
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  },
}));
```

Configure mock return values per test:
```typescript
beforeEach(() => {
  mockPool = new Pool();
  mockPool.query.mockResolvedValue({ rows: [] });
});

// In specific test
it('should authenticate', async () => {
  mockPool.query
    .mockResolvedValueOnce({ rows: [] })        // Check 1
    .mockResolvedValueOnce({ rows: [] })        // Check 2
    .mockResolvedValueOnce({ rows: [user] });   // Create user

  const response = await request(app)
    .post('/auth/google')
    .send({ idToken: 'token' })
    .expect(200);
});
```

**Framework (Frontend - Dart):**
- Mockito package for generating mocks
- `@GenerateMocks` annotation for mock generation
- Manual mock setup in tests

**Patterns:**

Generate mocks with annotation:
```dart
@GenerateMocks([FlutterSecureStorage, http.Client])
void main() { ... }
```

Setup mock return values:
```dart
when(mockStorage.read(key: 'auth_token'))
  .thenAnswer((_) async => 'stored_token');

when(mockHttpClient.post(
  any,
  headers: anyNamed('headers'),
  body: anyNamed('body'),
)).thenAnswer((_) async => http.Response(responseBody, 200));
```

Setup error conditions:
```dart
when(mockHttpClient.post(
  any,
  headers: anyNamed('headers'),
  body: anyNamed('body'),
)).thenThrow(Exception('Network error'));
```

Verify mock was called:
```dart
verify(mockStorage.delete(key: 'auth_token')).called(1);
```

## What to Mock vs What NOT to Mock

**Mock in Backend Tests:**

✓ Database (pg Pool):
```typescript
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});
```

✓ External OAuth providers:
```typescript
jest.mock('google-auth-library');
jest.mock('apple-signin-auth', () => ({
  verifyIdToken: jest.fn(),
}));
```

✓ Rate limiters:
```typescript
jest.mock('../src/middleware/rate-limiter', () => ({
  authLimiter: (req: any, res: any, next: any) => next(),
}));
```

✓ Email service:
```typescript
jest.mock('../src/services/email-service', () => ({
  emailService: {
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
  },
}));
```

**Do NOT Mock in Backend Tests:**

✗ Express app itself (import real app)
✗ Middleware implementations (test real behavior)
✗ Error handlers (test error handling directly)
✗ Request validation (test with real requests via supertest)
✗ JWT library (test with real tokens for security)

Instead, test authentication with real JWT:
```typescript
const validToken = jwt.sign(
  { userId: 'test_user_123', provider: 'google', email: 'test@example.com' },
  JWT_SECRET,
  { expiresIn: '7d' }
);

const response = await request(app)
  .get('/endpoint')
  .set('Authorization', `Bearer ${validToken}`)
  .expect(200);
```

**Mock in Frontend Tests:**

✓ Flutter secure storage
✓ HTTP client
✓ Firebase services (if any)
✓ Location service
✓ Platform-specific APIs

**Do NOT Mock:**

✗ Service business logic (test real behavior)
✗ Provider/ChangeNotifier (test state changes)
✗ Navigation (if possible, test logic separately)

## Fixtures and Factories

**Test Data (Backend):**

Generate JWT tokens for tests:
```typescript
const JWT_SECRET = process.env.JWT_SECRET!;

let validToken: string;

beforeEach(() => {
  validToken = jwt.sign(
    { userId: 'test_user_123', provider: 'google', email: 'test@example.com' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
});

// Use in tests
const response = await request(app)
  .post('/endpoint')
  .set('Authorization', `Bearer ${validToken}`);
```

Mock database response patterns:
```typescript
const mockUser = {
  id: 'user_1',
  email: 'test@example.com',
  created_at: new Date(),
};

const mockProfile = {
  user_id: 'user_1',
  name: 'Test User',
  age: 25,
  bio: 'Test bio',
  photos: ['photo1.jpg', 'photo2.jpg'],
  interests: ['hiking', 'reading'],
};

// Setup mock to return this data
mockPool.query.mockResolvedValue({ rows: [mockProfile] });
```

**Test Data (Frontend - Dart):**

Define test objects inline:
```dart
final responseBody = json.encode({
  'success': true,
  'token': 'test_jwt_token',
  'userId': 'test_user_123',
  'provider': 'google',
});

when(mockHttpClient.post(...))
  .thenAnswer((_) async => http.Response(responseBody, 200));
```

No separate fixture files - data lives in tests

**Location:**

Backend: Test data embedded in test files (no separate fixtures directory)
Frontend: Test data embedded in test files with `@GenerateMocks` annotations

## Coverage

**Requirements:**

Backend coverage thresholds defined per service in package.json jest config:

Auth-service:
```javascript
"coverageThreshold": {
  "global": {
    "branches": 30,
    "functions": 30,
    "lines": 30,
    "statements": 30
  }
}
```

Profile-service (higher threshold):
```javascript
"coverageThreshold": {
  "global": {
    "branches": 50,
    "functions": 50,
    "lines": 50,
    "statements": 50
  }
}
```

Chat-service:
```javascript
"coverageThreshold": {
  "global": {
    "branches": 30,
    "functions": 30,
    "lines": 30,
    "statements": 30
  }
}
```

**View Coverage:**

Generate local HTML report:
```bash
npm run test:coverage
# Open coverage/index.html in browser
```

Reporters configured:
- `text` - Terminal output
- `lcov` - For CI/coverage services
- `html` - Browsable report

Exclude from coverage:
- `.d.ts` files (type definitions)
- `src/types/` directory (interfaces)
- `.interface.ts` files (pure interfaces)

## Test Types

**Unit Tests:**

Scope: Individual functions and classes
Approach: Mock dependencies, test isolated behavior

Examples in `backend/auth-service/tests/`:
- `auth.test.ts` - Tests individual auth endpoints with mocked database
- `middleware.test.ts` - Tests middleware functions
- `rate-limiter.test.ts` - Tests rate limiting logic

Pattern: Test one function/endpoint with all dependencies mocked

**Integration Tests:**

Scope: Multiple services working together
Approach: Real database (in memory or test database), mocked external APIs

Not explicitly labeled but present in test files - tests verify:
- Full request-response cycle
- Database state changes
- Cross-middleware interactions

Examples:
- Full auth flow: Google token verification → user creation → JWT generation
- Profile creation: Auth check → validation → database insert

**E2E Tests:**

Status: Not implemented
Approach: Would use Jest + test containers or similar
Target: Full app flows end-to-end

Frontend: No E2E tests (would use Flutter integration tests with similar structure)

## Common Patterns

**Async Testing (TypeScript):**

Use async/await with Jest:
```typescript
it('should authenticate with valid token', async () => {
  // Setup
  const validToken = jwt.sign(
    { userId: 'test_user_123', provider: 'google', email: 'test@example.com' },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Act
  const response = await request(app)
    .get('/endpoint')
    .set('Authorization', `Bearer ${validToken}`)
    .expect(200);

  // Assert
  expect(response.body.success).toBe(true);
});
```

Test rejected promises:
```typescript
it('should handle network errors', async () => {
  const { OAuth2Client } = require('google-auth-library');
  OAuth2Client.prototype.verifyIdToken = jest.fn()
    .mockRejectedValue(new Error('Invalid token'));

  const response = await request(app)
    .post('/auth/google')
    .send({ idToken: 'invalid_token' })
    .expect(401);

  expect(response.body.error).toContain('Invalid');
});
```

**Error Testing:**

Test success and failure paths:
```typescript
describe('POST /auth/google', () => {
  it('should authenticate with valid token', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });
    // ... test successful auth
  });

  it('should return 400 for missing idToken', async () => {
    const response = await request(app)
      .post('/auth/google')
      .send({})
      .expect(400);

    expect(response.body.success).toBe(false);
  });

  it('should return 401 for invalid token', async () => {
    const { OAuth2Client } = require('google-auth-library');
    OAuth2Client.prototype.verifyIdToken = jest.fn()
      .mockRejectedValue(new Error('Invalid'));

    const response = await request(app)
      .post('/auth/google')
      .send({ idToken: 'bad_token' })
      .expect(401);
  });
});
```

Test security validations:
```typescript
it('should use userId from JWT, not request body', async () => {
  await request(app)
    .post('/profile')
    .set('Authorization', `Bearer ${validToken}`)
    .send({
      userId: 'malicious_user_id', // Should be ignored
      name: 'Test',
      age: 25,
    })
    .expect(200);

  // Verify userId came from token, not body
  // (check database call args or response)
});
```

**Async Testing (Dart):**

Use async with when/then:
```dart
test('should store token on successful login', () async {
  final responseBody = json.encode({
    'success': true,
    'token': 'test_jwt_token',
    'userId': 'test_user_123',
  });

  when(mockHttpClient.post(
    any,
    headers: anyNamed('headers'),
    body: anyNamed('body'),
  )).thenAnswer((_) async => http.Response(responseBody, 200));

  // Assert or act on the result
  expect(mockStorage, isNotNull);
});
```

## Setup and Environment

**Backend Setup (`tests/setup.ts`):**

```typescript
// Test setup file
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.CORS_ORIGIN = 'http://localhost:19006';
process.env.APPLE_CLIENT_ID = 'com.vlvt.app.test';

// Mock console methods to reduce test output
global.console = {
  ...console,
  log: jest.fn(),
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
};
```

**Running Tests Locally:**

Ensure PostgreSQL is running:
```bash
# Docker (if using docker-compose)
docker-compose up postgres

# OR local PostgreSQL service
# Must have test database created
```

Run tests:
```bash
cd backend/auth-service
npm test

# Watch mode during development
npm run test:watch
```

**CI Environment:**

Tests run with:
```bash
npm run test:ci
# Runs with --coverage and --ci flags
# Uses text-summary reporter for compact output
```

GitHub Actions or similar CI systems should:
1. Start PostgreSQL service
2. Create test database
3. Run `npm run test:ci` in each service
4. Collect coverage reports
5. Optionally upload to coverage service (Codecov, etc.)

---

*Testing analysis: 2026-01-22*
