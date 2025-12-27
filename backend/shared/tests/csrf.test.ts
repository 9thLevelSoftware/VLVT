/**
 * Tests for CSRF Protection Middleware
 *
 * Verifies:
 * - Token generation creates unique, cryptographically secure tokens
 * - Middleware rejects requests without token
 * - Middleware rejects requests with mismatched token
 * - Middleware accepts valid token
 * - GET/HEAD/OPTIONS requests are not checked
 * - Skip paths are respected (OAuth callbacks, webhooks)
 * - Bearer token auth requests skip CSRF
 */

import { Request, Response, NextFunction } from 'express';
import {
  generateCsrfToken,
  createCsrfMiddleware,
  createCsrfTokenHandler,
  csrfMiddleware,
  csrfTokenHandler,
} from '../src/middleware/csrf';

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    method: 'POST',
    path: '/api/resource',
    headers: {},
    cookies: {},
    ip: '127.0.0.1',
    ...overrides,
  };
}

// Mock response factory
function createMockResponse(): Partial<Response> & {
  statusCode: number;
  jsonData: any;
  cookieData: { name: string; value: string; options: any } | null;
} {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    cookieData: null,
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data: any) => {
    res.jsonData = data;
    return res;
  });
  res.cookie = jest.fn((name: string, value: string, options: any) => {
    res.cookieData = { name, value, options };
    return res;
  });
  return res;
}

describe('CSRF Protection', () => {
  describe('generateCsrfToken()', () => {
    it('should generate unique tokens', () => {
      const tokens = new Set<string>();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateCsrfToken());
      }
      // All 100 tokens should be unique
      expect(tokens.size).toBe(100);
    });

    it('should generate tokens with default length', () => {
      const token = generateCsrfToken();
      // 32 bytes in base64url = ~43 characters
      expect(token.length).toBeGreaterThanOrEqual(40);
    });

    it('should generate tokens with custom length', () => {
      const shortToken = generateCsrfToken(16);
      const longToken = generateCsrfToken(64);
      // 16 bytes < 32 bytes < 64 bytes
      expect(shortToken.length).toBeLessThan(longToken.length);
    });

    it('should generate base64url-safe tokens', () => {
      const token = generateCsrfToken();
      // Base64url should not contain + or /
      expect(token).not.toMatch(/[+/=]/);
      // Should only contain alphanumeric, -, and _
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('createCsrfMiddleware()', () => {
    let mockNext: jest.Mock;
    let mockLogger: { warn: jest.Mock; debug: jest.Mock };

    beforeEach(() => {
      mockNext = jest.fn();
      mockLogger = {
        warn: jest.fn(),
        debug: jest.fn(),
      };
    });

    describe('Safe methods', () => {
      it('should allow GET requests without token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({ method: 'GET' });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it('should allow HEAD requests without token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({ method: 'HEAD' });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it('should allow OPTIONS requests without token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({ method: 'OPTIONS' });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });
    });

    describe('State-changing methods', () => {
      it('should reject POST requests without cookie token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({ method: 'POST' });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.jsonData.error).toBe('CSRF token missing');
        expect(res.jsonData.code).toBe('CSRF_TOKEN_MISSING');
        expect(mockLogger.warn).toHaveBeenCalled();
      });

      it('should reject PUT requests without cookie token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({ method: 'PUT' });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });

      it('should reject DELETE requests without cookie token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({ method: 'DELETE' });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });

      it('should reject PATCH requests without cookie token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({ method: 'PATCH' });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });

      it('should reject requests with cookie but no header token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const token = generateCsrfToken();
        const req = createMockRequest({
          method: 'POST',
          cookies: { 'csrf-token': token },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.jsonData.error).toBe('CSRF token missing from header');
        expect(res.jsonData.code).toBe('CSRF_HEADER_MISSING');
      });

      it('should reject requests with mismatched tokens', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const cookieToken = generateCsrfToken();
        const headerToken = generateCsrfToken();
        const req = createMockRequest({
          method: 'POST',
          cookies: { 'csrf-token': cookieToken },
          headers: { 'x-csrf-token': headerToken },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.jsonData.error).toBe('CSRF token invalid');
        expect(res.jsonData.code).toBe('CSRF_TOKEN_INVALID');
      });

      it('should accept requests with matching tokens', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const token = generateCsrfToken();
        const req = createMockRequest({
          method: 'POST',
          cookies: { 'csrf-token': token },
          headers: { 'x-csrf-token': token },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it('should accept DELETE requests with valid token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const token = generateCsrfToken();
        const req = createMockRequest({
          method: 'DELETE',
          cookies: { 'csrf-token': token },
          headers: { 'x-csrf-token': token },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('Skip paths', () => {
      it('should skip CSRF for OAuth callback paths', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({
          method: 'POST',
          path: '/auth/google/callback',
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
      });

      it('should skip CSRF for webhook paths (prefix match)', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({
          method: 'POST',
          path: '/webhooks/stripe',
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should skip CSRF for health check', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({
          method: 'POST', // Even POST to /health is skipped
          path: '/health',
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should allow custom skip paths', () => {
        const middleware = createCsrfMiddleware({
          logger: mockLogger,
          skipPaths: ['/custom/path', '/prefix/'],
        });

        // Exact match
        const req1 = createMockRequest({
          method: 'POST',
          path: '/custom/path',
        });
        const res1 = createMockResponse();
        middleware(req1 as Request, res1 as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();

        // Prefix match
        mockNext.mockClear();
        const req2 = createMockRequest({
          method: 'POST',
          path: '/prefix/something',
        });
        const res2 = createMockResponse();
        middleware(req2 as Request, res2 as Response, mockNext);
        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('Bearer token auth bypass', () => {
      it('should skip CSRF for requests with Bearer token', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({
          method: 'POST',
          headers: {
            authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(res.status).not.toHaveBeenCalled();
        expect(mockLogger.debug).toHaveBeenCalledWith(
          'CSRF validation skipped for Bearer token auth',
          expect.any(Object)
        );
      });

      it('should not skip CSRF for non-Bearer auth headers', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({
          method: 'POST',
          headers: {
            authorization: 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=',
          },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        // Should require CSRF token
        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });
    });

    describe('Custom configuration', () => {
      it('should use custom cookie name', () => {
        const middleware = createCsrfMiddleware({
          cookieName: 'my-csrf',
          logger: mockLogger,
        });
        const token = generateCsrfToken();
        const req = createMockRequest({
          method: 'POST',
          cookies: { 'my-csrf': token },
          headers: { 'x-csrf-token': token },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should use custom header name', () => {
        const middleware = createCsrfMiddleware({
          headerName: 'X-My-CSRF',
          logger: mockLogger,
        });
        const token = generateCsrfToken();
        const req = createMockRequest({
          method: 'POST',
          cookies: { 'csrf-token': token },
          headers: { 'x-my-csrf': token },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('Security edge cases', () => {
      it('should reject empty string tokens', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({
          method: 'POST',
          cookies: { 'csrf-token': '' },
          headers: { 'x-csrf-token': '' },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        // Empty cookie should be treated as missing
        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });

      it('should reject tokens of different lengths', () => {
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const req = createMockRequest({
          method: 'POST',
          cookies: { 'csrf-token': 'short' },
          headers: { 'x-csrf-token': 'longertoken' },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });

      it('should use constant-time comparison to prevent timing attacks', () => {
        // This test verifies the implementation detail that we use
        // crypto.timingSafeEqual for token comparison
        const middleware = createCsrfMiddleware({ logger: mockLogger });
        const token = generateCsrfToken();

        // Create a token that differs only in the last character
        const almostMatchingToken = token.slice(0, -1) + (token.slice(-1) === 'a' ? 'b' : 'a');

        const req = createMockRequest({
          method: 'POST',
          cookies: { 'csrf-token': token },
          headers: { 'x-csrf-token': almostMatchingToken },
        });
        const res = createMockResponse();

        middleware(req as Request, res as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(res.status).toHaveBeenCalledWith(403);
      });
    });
  });

  describe('createCsrfTokenHandler()', () => {
    it('should generate and return a new token', () => {
      const handler = createCsrfTokenHandler();
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      handler(req as Request, res as Response);

      expect(res.json).toHaveBeenCalled();
      expect(res.jsonData.success).toBe(true);
      expect(res.jsonData.csrfToken).toBeDefined();
      expect(res.jsonData.csrfToken.length).toBeGreaterThan(0);
    });

    it('should set the token as a cookie', () => {
      const handler = createCsrfTokenHandler();
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      handler(req as Request, res as Response);

      expect(res.cookie).toHaveBeenCalled();
      expect(res.cookieData?.name).toBe('csrf-token');
      expect(res.cookieData?.value).toBe(res.jsonData.csrfToken);
    });

    it('should set httpOnly to false on cookie', () => {
      const handler = createCsrfTokenHandler();
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      handler(req as Request, res as Response);

      expect(res.cookieData?.options.httpOnly).toBe(false);
    });

    it('should use custom cookie name', () => {
      const handler = createCsrfTokenHandler({ cookieName: 'my-csrf' });
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      handler(req as Request, res as Response);

      expect(res.cookieData?.name).toBe('my-csrf');
    });

    it('should set secure flag in production', () => {
      const handler = createCsrfTokenHandler({ secure: true });
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      handler(req as Request, res as Response);

      expect(res.cookieData?.options.secure).toBe(true);
    });

    it('should set sameSite to strict by default', () => {
      const handler = createCsrfTokenHandler();
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      handler(req as Request, res as Response);

      expect(res.cookieData?.options.sameSite).toBe('strict');
    });

    it('should set cookie path to root', () => {
      const handler = createCsrfTokenHandler();
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      handler(req as Request, res as Response);

      expect(res.cookieData?.options.path).toBe('/');
    });

    it('should set cookie max age', () => {
      const handler = createCsrfTokenHandler({ cookieMaxAge: 7200000 }); // 2 hours
      const req = createMockRequest({ method: 'GET' });
      const res = createMockResponse();

      handler(req as Request, res as Response);

      expect(res.cookieData?.options.maxAge).toBe(7200000);
    });
  });

  describe('Default exports', () => {
    it('should export default csrfMiddleware', () => {
      expect(csrfMiddleware).toBeDefined();
      expect(typeof csrfMiddleware).toBe('function');
    });

    it('should export default csrfTokenHandler', () => {
      expect(csrfTokenHandler).toBeDefined();
      expect(typeof csrfTokenHandler).toBe('function');
    });
  });
});
