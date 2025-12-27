/**
 * Tests for Request Signing Middleware (HMAC-SHA256)
 *
 * Verifies:
 * - Valid signatures are accepted
 * - Invalid signatures are rejected
 * - Expired timestamps are rejected
 * - Tampered body is rejected
 * - Missing headers are rejected
 * - Skip paths work correctly
 * - Safe methods can be skipped when configured
 */

import { Request, Response, NextFunction } from 'express';
import {
  computeHash,
  computeSignature,
  verifySignature,
  createSignatureMiddleware,
  signRequest,
  getSigningSecret,
} from '../src/middleware/request-signing';

// Test secret for consistent testing
const TEST_SECRET = 'test-signing-secret-12345';

// Empty body hash constant
const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    method: 'POST',
    path: '/api/resource',
    headers: {},
    body: undefined,
    ip: '127.0.0.1',
    ...overrides,
  };
}

// Mock response factory
function createMockResponse(): Partial<Response> & {
  statusCode: number;
  jsonData: any;
} {
  const res: any = {
    statusCode: 200,
    jsonData: null,
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data: any) => {
    res.jsonData = data;
    return res;
  });
  return res;
}

describe('Request Signing', () => {
  describe('computeHash()', () => {
    it('should compute correct SHA256 hash for empty string', () => {
      const hash = computeHash('');
      expect(hash).toBe(EMPTY_BODY_HASH);
    });

    it('should compute consistent hash for same input', () => {
      const input = 'test data';
      const hash1 = computeHash(input);
      const hash2 = computeHash(input);
      expect(hash1).toBe(hash2);
    });

    it('should compute different hashes for different inputs', () => {
      const hash1 = computeHash('input1');
      const hash2 = computeHash('input2');
      expect(hash1).not.toBe(hash2);
    });

    it('should return lowercase hex string', () => {
      const hash = computeHash('test');
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should compute correct hash for JSON body', () => {
      const body = JSON.stringify({ name: 'John', age: 30 });
      const hash = computeHash(body);
      expect(hash.length).toBe(64);
    });
  });

  describe('computeSignature()', () => {
    it('should compute HMAC-SHA256 signature', () => {
      const signature = computeSignature(
        TEST_SECRET,
        'POST',
        '/api/users',
        '1704067200000',
        EMPTY_BODY_HASH
      );
      expect(signature.length).toBe(64);
      expect(signature).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should compute consistent signature for same inputs', () => {
      const sig1 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      const sig2 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      expect(sig1).toBe(sig2);
    });

    it('should compute different signatures for different methods', () => {
      const sig1 = computeSignature(TEST_SECRET, 'GET', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      const sig2 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      expect(sig1).not.toBe(sig2);
    });

    it('should compute different signatures for different paths', () => {
      const sig1 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      const sig2 = computeSignature(TEST_SECRET, 'POST', '/api/profiles', '1704067200000', EMPTY_BODY_HASH);
      expect(sig1).not.toBe(sig2);
    });

    it('should compute different signatures for different timestamps', () => {
      const sig1 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      const sig2 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200001', EMPTY_BODY_HASH);
      expect(sig1).not.toBe(sig2);
    });

    it('should compute different signatures for different body hashes', () => {
      const bodyHash1 = computeHash('{"name":"John"}');
      const bodyHash2 = computeHash('{"name":"Jane"}');
      const sig1 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200000', bodyHash1);
      const sig2 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200000', bodyHash2);
      expect(sig1).not.toBe(sig2);
    });

    it('should compute different signatures for different secrets', () => {
      const sig1 = computeSignature('secret1', 'POST', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      const sig2 = computeSignature('secret2', 'POST', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      expect(sig1).not.toBe(sig2);
    });

    it('should normalize method to uppercase', () => {
      const sig1 = computeSignature(TEST_SECRET, 'post', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      const sig2 = computeSignature(TEST_SECRET, 'POST', '/api/users', '1704067200000', EMPTY_BODY_HASH);
      expect(sig1).toBe(sig2);
    });
  });

  describe('signRequest()', () => {
    it('should generate valid signature headers', () => {
      const result = signRequest(TEST_SECRET, 'POST', '/api/users');
      expect(result.signature).toBeDefined();
      expect(result.timestamp).toBeDefined();
      expect(result.bodyHash).toBe(EMPTY_BODY_HASH);
    });

    it('should include body hash when body is provided', () => {
      const body = { name: 'John' };
      const result = signRequest(TEST_SECRET, 'POST', '/api/users', body);
      expect(result.bodyHash).not.toBe(EMPTY_BODY_HASH);
      expect(result.bodyHash).toBe(computeHash(JSON.stringify(body)));
    });

    it('should work with string body', () => {
      const body = '{"name":"John"}';
      const result = signRequest(TEST_SECRET, 'POST', '/api/users', body);
      expect(result.bodyHash).toBe(computeHash(body));
    });
  });

  describe('verifySignature()', () => {
    it('should accept valid signature', () => {
      const timestamp = Date.now().toString();
      const bodyHash = EMPTY_BODY_HASH;
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', timestamp, bodyHash);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid signature with JSON body', () => {
      const timestamp = Date.now().toString();
      const body = { name: 'John', age: 30 };
      const bodyHash = computeHash(JSON.stringify(body));
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', timestamp, bodyHash);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
        body,
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it('should reject missing signature header', () => {
      const req = createMockRequest({
        headers: {
          'x-timestamp': Date.now().toString(),
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_MISSING');
    });

    it('should reject missing timestamp header', () => {
      const req = createMockRequest({
        headers: {
          'x-signature': 'some-signature',
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TIMESTAMP_MISSING');
    });

    it('should reject invalid timestamp format', () => {
      const req = createMockRequest({
        headers: {
          'x-signature': 'some-signature',
          'x-timestamp': 'not-a-number',
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TIMESTAMP_INVALID');
    });

    it('should reject expired timestamp (too old)', () => {
      const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', oldTimestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': oldTimestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TIMESTAMP_EXPIRED');
    });

    it('should reject expired timestamp (future)', () => {
      const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes in future
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', futureTimestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': futureTimestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TIMESTAMP_EXPIRED');
    });

    it('should accept timestamp within tolerance window', () => {
      const recentTimestamp = (Date.now() - 4 * 60 * 1000).toString(); // 4 minutes ago (within 5 min)
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', recentTimestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': recentTimestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const timestamp = Date.now().toString();

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': 'invalid-signature',
          'x-timestamp': timestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });

    it('should reject tampered body', () => {
      const timestamp = Date.now().toString();
      const originalBody = { name: 'John' };
      const bodyHash = computeHash(JSON.stringify(originalBody));
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', timestamp, bodyHash);

      // Create request with tampered body
      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
        body: { name: 'Jane' }, // Different from what was signed
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });

    it('should reject signature with wrong secret', () => {
      const timestamp = Date.now().toString();
      const signature = computeSignature('wrong-secret', 'POST', '/api/users', timestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });

    it('should reject signature with wrong method', () => {
      const timestamp = Date.now().toString();
      const signature = computeSignature(TEST_SECRET, 'GET', '/api/users', timestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST', // Different from what was signed
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });

    it('should reject signature with wrong path', () => {
      const timestamp = Date.now().toString();
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/other', timestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users', // Different from what was signed
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });

    it('should use custom header names', () => {
      const timestamp = Date.now().toString();
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', timestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-custom-sig': signature,
          'x-custom-time': timestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET, {
        signatureHeader: 'X-Custom-Sig',
        timestampHeader: 'X-Custom-Time',
      });
      expect(result.valid).toBe(true);
    });

    it('should use custom timestamp tolerance', () => {
      // 3 minutes ago would normally be valid, but with 1 minute tolerance it's expired
      const oldTimestamp = (Date.now() - 3 * 60 * 1000).toString();
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', oldTimestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': oldTimestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET, {
        timestampToleranceMs: 60 * 1000, // 1 minute tolerance
      });
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TIMESTAMP_EXPIRED');
    });
  });

  describe('createSignatureMiddleware()', () => {
    let mockNext: jest.Mock;
    let mockLogger: { warn: jest.Mock; debug: jest.Mock };

    beforeEach(() => {
      mockNext = jest.fn();
      mockLogger = {
        warn: jest.fn(),
        debug: jest.fn(),
      };
    });

    it('should accept valid signature and call next', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const timestamp = Date.now().toString();
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', timestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject invalid signature with 401', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': 'invalid',
          'x-timestamp': Date.now().toString(),
        },
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.code).toBe('SIGNATURE_INVALID');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should skip validation for health endpoint by default', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const req = createMockRequest({
        method: 'GET',
        path: '/health',
        headers: {},
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should skip validation for csrf-token endpoint by default', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const req = createMockRequest({
        method: 'GET',
        path: '/csrf-token',
        headers: {},
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip validation for custom skip paths', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        skipPaths: ['/public/', '/open'],
        logger: mockLogger,
      });

      // Prefix match
      const req1 = createMockRequest({
        method: 'POST',
        path: '/public/data',
        headers: {},
      });
      const res1 = createMockResponse();
      middleware(req1 as Request, res1 as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Exact match
      mockNext.mockClear();
      const req2 = createMockRequest({
        method: 'POST',
        path: '/open',
        headers: {},
      });
      const res2 = createMockResponse();
      middleware(req2 as Request, res2 as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should skip validation for safe methods when configured', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        skipSafeMethods: true,
        logger: mockLogger,
      });

      const methods = ['GET', 'HEAD', 'OPTIONS'];
      for (const method of methods) {
        mockNext.mockClear();
        const req = createMockRequest({
          method,
          path: '/api/users',
          headers: {},
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      }
    });

    it('should NOT skip safe methods by default', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        skipPaths: [], // Clear default skip paths
        logger: mockLogger,
      });

      const req = createMockRequest({
        method: 'GET',
        path: '/api/users',
        headers: {},
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should validate POST, PUT, DELETE, PATCH when not skipping safe methods', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        skipPaths: [],
        logger: mockLogger,
      });

      const methods = ['POST', 'PUT', 'DELETE', 'PATCH'];
      for (const method of methods) {
        mockNext.mockClear();
        const req = createMockRequest({
          method,
          path: '/api/users',
          headers: {
            'x-signature': 'invalid',
            'x-timestamp': Date.now().toString(),
          },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(401);
      }
    });

    it('should log warning on invalid signature attempt', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const req = createMockRequest({
        method: 'POST',
        path: '/api/sensitive',
        headers: {
          'x-signature': 'tampered-signature',
          'x-timestamp': Date.now().toString(),
          'user-agent': 'TestAgent/1.0',
        },
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Signature validation failed',
        expect.objectContaining({
          error: 'Invalid signature',
          code: 'SIGNATURE_INVALID',
          path: '/api/sensitive',
          method: 'POST',
        })
      );
    });

    it('should log debug message on successful validation', () => {
      const middleware = createSignatureMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const timestamp = Date.now().toString();
      const signature = computeSignature(TEST_SECRET, 'POST', '/api/users', timestamp, EMPTY_BODY_HASH);

      const req = createMockRequest({
        method: 'POST',
        path: '/api/users',
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Signature validation passed',
        expect.objectContaining({
          path: '/api/users',
          method: 'POST',
        })
      );
    });
  });

  describe('getSigningSecret()', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return environment variable when set', () => {
      process.env.REQUEST_SIGNING_SECRET = 'env-secret';
      expect(getSigningSecret()).toBe('env-secret');
    });

    it('should return default dev secret when not in production', () => {
      delete process.env.REQUEST_SIGNING_SECRET;
      process.env.NODE_ENV = 'development';
      const secret = getSigningSecret();
      expect(secret).toContain('DO-NOT-USE-IN-PRODUCTION');
    });

    it('should throw error in production without secret', () => {
      delete process.env.REQUEST_SIGNING_SECRET;
      process.env.NODE_ENV = 'production';
      expect(() => getSigningSecret()).toThrow('REQUEST_SIGNING_SECRET must be set in production');
    });
  });

  describe('Integration: Frontend-Backend signature verification', () => {
    // This simulates the frontend signing a request and backend verifying it
    it('should verify signature created with same algorithm', () => {
      const method = 'POST';
      const path = '/api/profiles';
      const body = { bio: 'Hello world', age: 25 };
      const timestamp = Date.now().toString();

      // Simulate frontend signing
      const bodyStr = JSON.stringify(body);
      const bodyHash = computeHash(bodyStr);
      const signature = computeSignature(TEST_SECRET, method, path, timestamp, bodyHash);

      // Simulate backend verification
      const req = createMockRequest({
        method,
        path,
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
        body,
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it('should detect replay attack with reused timestamp', () => {
      const method = 'POST';
      const path = '/api/transfer';
      const timestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago (expired)
      const bodyHash = EMPTY_BODY_HASH;
      const signature = computeSignature(TEST_SECRET, method, path, timestamp, bodyHash);

      const req = createMockRequest({
        method,
        path,
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('TIMESTAMP_EXPIRED');
    });

    it('should detect man-in-the-middle body modification', () => {
      const method = 'POST';
      const path = '/api/transfer';
      const originalBody = { amount: 100, recipient: 'user123' };
      const timestamp = Date.now().toString();

      // Legitimate signature for original body
      const bodyHash = computeHash(JSON.stringify(originalBody));
      const signature = computeSignature(TEST_SECRET, method, path, timestamp, bodyHash);

      // Attacker modifies the body
      const tamperedBody = { amount: 10000, recipient: 'attacker' };

      const req = createMockRequest({
        method,
        path,
        headers: {
          'x-signature': signature,
          'x-timestamp': timestamp,
        },
        body: tamperedBody,
      });

      const result = verifySignature(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('SIGNATURE_INVALID');
    });
  });
});
