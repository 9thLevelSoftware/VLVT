/**
 * Tests for Internal Service Authentication Middleware (HMAC-SHA256)
 *
 * Verifies:
 * - Valid signed requests are accepted
 * - Unsigned/invalid requests are rejected
 * - Expired timestamps are rejected (replay attack prevention)
 * - Tampered body is rejected (integrity verification)
 * - Missing headers are rejected
 * - Service name is logged for auditing
 */

import { Request, Response, NextFunction } from 'express';
import {
  createInternalServiceAuthMiddleware,
  verifyInternalServiceRequest,
  signInternalServiceRequest,
  getInternalServiceSecret,
} from '../src/middleware/internal-service-auth';
import { computeHash, computeSignature } from '../src/middleware/request-signing';

// Test secret for consistent testing
const TEST_SECRET = 'test-internal-service-secret-12345';

// Empty body hash constant
const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    method: 'POST',
    path: '/api/internal/cleanup-photos',
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

describe('Internal Service Authentication', () => {
  describe('signInternalServiceRequest()', () => {
    it('should generate all required headers', () => {
      const headers = signInternalServiceRequest(
        'auth-service',
        'POST',
        '/api/internal/cleanup-photos',
        undefined,
        TEST_SECRET
      );

      expect(headers['X-Internal-Signature']).toBeDefined();
      expect(headers['X-Internal-Timestamp']).toBeDefined();
      expect(headers['X-Internal-Service']).toBe('auth-service');
      expect(headers['Content-Type']).toBe('application/json');
    });

    it('should generate valid signature for request with body', () => {
      const body = { userId: 'user123', photoKeys: ['photo1.jpg', 'photo2.jpg'] };
      const headers = signInternalServiceRequest(
        'auth-service',
        'POST',
        '/api/internal/cleanup-photos',
        body,
        TEST_SECRET
      );

      expect(headers['X-Internal-Signature']).toMatch(/^[a-f0-9]{64}$/);
      expect(headers['X-Internal-Timestamp']).toMatch(/^\d+$/);
    });

    it('should generate valid signature for request without body', () => {
      const headers = signInternalServiceRequest(
        'profile-service',
        'GET',
        '/api/internal/status',
        undefined,
        TEST_SECRET
      );

      expect(headers['X-Internal-Signature']).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should handle string body', () => {
      const body = '{"key": "value"}';
      const headers = signInternalServiceRequest(
        'auth-service',
        'POST',
        '/api/internal/endpoint',
        body,
        TEST_SECRET
      );

      expect(headers['X-Internal-Signature']).toBeDefined();
    });
  });

  describe('verifyInternalServiceRequest()', () => {
    it('should accept valid signed request', () => {
      const body = { userId: 'user123', photoKeys: ['photo1.jpg'] };
      const path = '/api/internal/cleanup-photos';
      const headers = signInternalServiceRequest('auth-service', 'POST', path, body, TEST_SECRET);

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
        body,
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('auth-service');
    });

    it('should accept valid signed request without body', () => {
      const path = '/api/internal/status';
      const headers = signInternalServiceRequest('chat-service', 'GET', path, undefined, TEST_SECRET);

      const req = createMockRequest({
        method: 'GET',
        path,
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.serviceName).toBe('chat-service');
    });

    it('should reject missing signature header', () => {
      const req = createMockRequest({
        headers: {
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-service': 'auth-service',
        },
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_SIGNATURE_MISSING');
    });

    it('should reject missing timestamp header', () => {
      const req = createMockRequest({
        headers: {
          'x-internal-signature': 'some-signature',
          'x-internal-service': 'auth-service',
        },
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_TIMESTAMP_MISSING');
    });

    it('should reject invalid timestamp format', () => {
      const req = createMockRequest({
        headers: {
          'x-internal-signature': 'some-signature',
          'x-internal-timestamp': 'not-a-number',
          'x-internal-service': 'auth-service',
        },
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_TIMESTAMP_INVALID');
    });

    it('should reject expired timestamp (replay attack prevention)', () => {
      const oldTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
      const path = '/api/internal/cleanup-photos';
      const bodyHash = EMPTY_BODY_HASH;
      const signature = computeSignature(TEST_SECRET, 'POST', path, oldTimestamp, bodyHash);

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': signature,
          'x-internal-timestamp': oldTimestamp,
          'x-internal-service': 'auth-service',
        },
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_TIMESTAMP_EXPIRED');
    });

    it('should reject future timestamp (clock skew attack prevention)', () => {
      const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes in future
      const path = '/api/internal/cleanup-photos';
      const bodyHash = EMPTY_BODY_HASH;
      const signature = computeSignature(TEST_SECRET, 'POST', path, futureTimestamp, bodyHash);

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': signature,
          'x-internal-timestamp': futureTimestamp,
          'x-internal-service': 'auth-service',
        },
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_TIMESTAMP_EXPIRED');
    });

    it('should accept timestamp within tolerance window', () => {
      const recentTimestamp = (Date.now() - 4 * 60 * 1000).toString(); // 4 minutes ago (within 5 min)
      const path = '/api/internal/cleanup-photos';
      const bodyHash = EMPTY_BODY_HASH;
      const signature = computeSignature(TEST_SECRET, 'POST', path, recentTimestamp, bodyHash);

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': signature,
          'x-internal-timestamp': recentTimestamp,
          'x-internal-service': 'auth-service',
        },
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(true);
    });

    it('should reject invalid signature', () => {
      const req = createMockRequest({
        method: 'POST',
        path: '/api/internal/cleanup-photos',
        headers: {
          'x-internal-signature': 'invalid-signature',
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-service': 'auth-service',
        },
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_SIGNATURE_INVALID');
    });

    it('should reject tampered body', () => {
      const originalBody = { userId: 'user123', photoKeys: ['photo1.jpg'] };
      const path = '/api/internal/cleanup-photos';
      const headers = signInternalServiceRequest('auth-service', 'POST', path, originalBody, TEST_SECRET);

      // Attacker modifies the body
      const tamperedBody = { userId: 'attacker', photoKeys: ['sensitive.jpg'] };

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
        body: tamperedBody,
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_SIGNATURE_INVALID');
    });

    it('should reject signature with wrong secret', () => {
      const body = { userId: 'user123' };
      const path = '/api/internal/cleanup-photos';
      const headers = signInternalServiceRequest('auth-service', 'POST', path, body, 'wrong-secret');

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
        body,
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_SIGNATURE_INVALID');
    });

    it('should reject signature with wrong path', () => {
      const body = { userId: 'user123' };
      const signedPath = '/api/internal/other-endpoint';
      const actualPath = '/api/internal/cleanup-photos';
      const headers = signInternalServiceRequest('auth-service', 'POST', signedPath, body, TEST_SECRET);

      const req = createMockRequest({
        method: 'POST',
        path: actualPath, // Different path
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
        body,
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_SIGNATURE_INVALID');
    });

    it('should reject signature with wrong method', () => {
      const body = { userId: 'user123' };
      const path = '/api/internal/cleanup-photos';
      const headers = signInternalServiceRequest('auth-service', 'PUT', path, body, TEST_SECRET);

      const req = createMockRequest({
        method: 'POST', // Different method
        path,
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
        body,
      });

      const result = verifyInternalServiceRequest(req as Request, TEST_SECRET);
      expect(result.valid).toBe(false);
      expect(result.code).toBe('INTERNAL_SIGNATURE_INVALID');
    });
  });

  describe('createInternalServiceAuthMiddleware()', () => {
    let mockNext: jest.Mock;
    let mockLogger: { warn: jest.Mock; debug: jest.Mock };

    beforeEach(() => {
      mockNext = jest.fn();
      mockLogger = {
        warn: jest.fn(),
        debug: jest.fn(),
      };
    });

    it('should accept valid signed request and call next', () => {
      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const body = { userId: 'user123', photoKeys: ['photo1.jpg'] };
      const path = '/api/internal/cleanup-photos';
      const headers = signInternalServiceRequest('auth-service', 'POST', path, body, TEST_SECRET);

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
        body,
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject unsigned request with 403', () => {
      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      // Old-style request with just X-Internal-Service header (no HMAC)
      const req = createMockRequest({
        method: 'POST',
        path: '/api/internal/cleanup-photos',
        headers: {
          'x-internal-service': 'auth-service', // No signature!
        },
        body: { userId: 'user123' },
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.code).toBe('INTERNAL_SIGNATURE_MISSING');
    });

    it('should reject invalid signature with 403', () => {
      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const req = createMockRequest({
        method: 'POST',
        path: '/api/internal/cleanup-photos',
        headers: {
          'x-internal-signature': 'forged-signature',
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-service': 'auth-service',
        },
        body: { userId: 'user123' },
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.code).toBe('INTERNAL_SIGNATURE_INVALID');
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('should log warning with service name on failure', () => {
      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const req = createMockRequest({
        method: 'POST',
        path: '/api/internal/cleanup-photos',
        headers: {
          'x-internal-signature': 'invalid',
          'x-internal-timestamp': Date.now().toString(),
          'x-internal-service': 'malicious-service',
        },
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Internal service authentication failed',
        expect.objectContaining({
          serviceName: 'malicious-service',
          path: '/api/internal/cleanup-photos',
          method: 'POST',
        })
      );
    });

    it('should log debug message on successful authentication', () => {
      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const body = { userId: 'user123' };
      const path = '/api/internal/cleanup-photos';
      const headers = signInternalServiceRequest('auth-service', 'POST', path, body, TEST_SECRET);

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
        body,
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Internal service authentication passed',
        expect.objectContaining({
          serviceName: 'auth-service',
          path: '/api/internal/cleanup-photos',
        })
      );
    });

    it('should reject expired timestamps', () => {
      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        logger: mockLogger,
      });

      const body = { userId: 'user123' };
      const path = '/api/internal/cleanup-photos';
      const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString(); // 10 minutes ago
      const bodyHash = computeHash(JSON.stringify(body));
      const signature = computeSignature(TEST_SECRET, 'POST', path, oldTimestamp, bodyHash);

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': signature,
          'x-internal-timestamp': oldTimestamp,
          'x-internal-service': 'auth-service',
        },
        body,
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.code).toBe('INTERNAL_TIMESTAMP_EXPIRED');
    });

    it('should use custom timestamp tolerance', () => {
      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        timestampToleranceMs: 60 * 1000, // 1 minute
        logger: mockLogger,
      });

      const body = { userId: 'user123' };
      const path = '/api/internal/cleanup-photos';
      // 2 minutes ago - normally valid but not with 1 minute tolerance
      const oldTimestamp = (Date.now() - 2 * 60 * 1000).toString();
      const bodyHash = computeHash(JSON.stringify(body));
      const signature = computeSignature(TEST_SECRET, 'POST', path, oldTimestamp, bodyHash);

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': signature,
          'x-internal-timestamp': oldTimestamp,
          'x-internal-service': 'auth-service',
        },
        body,
      });
      const res = createMockResponse();

      middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.jsonData.code).toBe('INTERNAL_TIMESTAMP_EXPIRED');
    });
  });

  describe('getInternalServiceSecret()', () => {
    const originalEnv = process.env;

    beforeEach(() => {
      jest.resetModules();
      process.env = { ...originalEnv };
    });

    afterAll(() => {
      process.env = originalEnv;
    });

    it('should return INTERNAL_SERVICE_SECRET when set', () => {
      process.env.INTERNAL_SERVICE_SECRET = 'internal-secret';
      process.env.REQUEST_SIGNING_SECRET = 'request-secret';

      // Need to re-import to pick up new env
      jest.isolateModules(() => {
        const { getInternalServiceSecret: getSecret } = require('../src/middleware/internal-service-auth');
        expect(getSecret()).toBe('internal-secret');
      });
    });

    it('should fall back to REQUEST_SIGNING_SECRET when INTERNAL_SERVICE_SECRET not set', () => {
      delete process.env.INTERNAL_SERVICE_SECRET;
      process.env.REQUEST_SIGNING_SECRET = 'request-secret';

      jest.isolateModules(() => {
        const { getInternalServiceSecret: getSecret } = require('../src/middleware/internal-service-auth');
        expect(getSecret()).toBe('request-secret');
      });
    });
  });

  describe('End-to-end: auth-service to profile-service call', () => {
    it('should successfully authenticate a properly signed internal request', () => {
      // Simulate auth-service signing a request
      const body = { userId: 'user-to-delete', photoKeys: ['photo1.jpg', 'photo2.jpg'] };
      const path = '/api/internal/cleanup-photos';

      const headers = signInternalServiceRequest('auth-service', 'POST', path, body, TEST_SECRET);

      // Simulate profile-service receiving and verifying the request
      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        logger: { warn: jest.fn(), debug: jest.fn() },
      });

      const req = createMockRequest({
        method: 'POST',
        path,
        headers: {
          'x-internal-signature': headers['X-Internal-Signature'],
          'x-internal-timestamp': headers['X-Internal-Timestamp'],
          'x-internal-service': headers['X-Internal-Service'],
        },
        body,
      });
      const res = createMockResponse();
      const next = jest.fn();

      middleware(req as Request, res as Response, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should reject requests with spoofed X-Internal-Service header (no valid signature)', () => {
      // Attacker tries to spoof the old-style header
      const req = createMockRequest({
        method: 'POST',
        path: '/api/internal/cleanup-photos',
        headers: {
          'x-internal-service': 'auth-service', // Spoofed header
          // No signature or timestamp
        },
        body: { userId: 'victim-user', photoKeys: ['sensitive.jpg'] },
      });
      const res = createMockResponse();
      const next = jest.fn();

      const middleware = createInternalServiceAuthMiddleware({
        secret: TEST_SECRET,
        logger: { warn: jest.fn(), debug: jest.fn() },
      });

      middleware(req as Request, res as Response, next);

      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });
  });
});
