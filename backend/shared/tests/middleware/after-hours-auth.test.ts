/**
 * Tests for After Hours Authorization Middleware
 *
 * Verifies fail-closed behavior for all three authorization checks:
 * 1. Premium subscription status
 * 2. ID verification status
 * 3. GDPR consent for location sharing
 *
 * SECURITY CRITICAL: Tests ensure middleware fails closed on errors
 * and never allows unauthorized access.
 */

import { Request, Response, NextFunction } from 'express';
import { createAfterHoursAuthMiddleware, AfterHoursAuthOptions } from '../../src/middleware/after-hours-auth';

// Mock pool factory
function createMockPool(queryImplementation?: jest.Mock) {
  return {
    query: queryImplementation || jest.fn(),
  };
}

// Mock request factory
function createMockRequest(overrides: Partial<Request> = {}): Partial<Request> {
  return {
    path: '/api/after-hours/session',
    method: 'POST',
    headers: {},
    user: { userId: 'test-user-123', provider: 'google', email: 'test@example.com' },
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

// Mock logger
function createMockLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
  };
}

describe('After Hours Auth Middleware', () => {
  let mockNext: jest.Mock;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    mockNext = jest.fn();
    mockLogger = createMockLogger();
  });

  describe('Authentication check (Check 0)', () => {
    it('should return 401 AUTH_REQUIRED when user is not authenticated', async () => {
      const mockPool = createMockPool();
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest({ user: undefined });
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData).toEqual({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      // Pool should not be queried if user is not authenticated
      expect(mockPool.query).not.toHaveBeenCalled();
    });

    it('should return 401 AUTH_REQUIRED when userId is missing', async () => {
      const mockPool = createMockPool();
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest({ user: { provider: 'google' } as any });
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.jsonData.code).toBe('AUTH_REQUIRED');
    });
  });

  describe('Premium subscription check (Check 1)', () => {
    it('should return 403 PREMIUM_REQUIRED when no subscription exists', async () => {
      const mockQuery = jest.fn().mockResolvedValueOnce({ rows: [] }); // No subscription
      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData).toEqual({
        success: false,
        error: 'Premium subscription required for After Hours Mode',
        code: 'PREMIUM_REQUIRED',
        upgrade: true,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'After Hours access denied: no active subscription',
        { userId: 'test-user-123' }
      );
    });

    it('should deny access for expired subscription (checked by SQL query)', async () => {
      // The SQL query itself filters out expired subscriptions,
      // so an empty result means no valid subscription
      const mockQuery = jest.fn().mockResolvedValueOnce({ rows: [] });
      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.code).toBe('PREMIUM_REQUIRED');
    });
  });

  describe('ID Verification check (Check 2)', () => {
    it('should return 403 VERIFICATION_REQUIRED when not verified', async () => {
      const mockQuery = jest.fn()
        // Check 1: Premium - active subscription
        .mockResolvedValueOnce({ rows: [{ is_active: true, expires_at: null }] })
        // Check 2: Verification - not verified
        .mockResolvedValueOnce({ rows: [{ id_verified: false }] });

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData).toEqual({
        success: false,
        error: 'ID verification required for After Hours Mode',
        code: 'VERIFICATION_REQUIRED',
        requiresVerification: true,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'After Hours access denied: not verified',
        { userId: 'test-user-123' }
      );
    });

    it('should return 403 VERIFICATION_REQUIRED when id_verified is null', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // Premium OK
        .mockResolvedValueOnce({ rows: [{ id_verified: null }] }); // Not verified (null)

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.code).toBe('VERIFICATION_REQUIRED');
    });

    it('should return 403 VERIFICATION_REQUIRED when user not found', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // Premium OK
        .mockResolvedValueOnce({ rows: [] }); // User not found

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.code).toBe('VERIFICATION_REQUIRED');
    });
  });

  describe('GDPR Consent check (Check 3)', () => {
    it('should return 403 CONSENT_REQUIRED when no consent', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // Premium OK
        .mockResolvedValueOnce({ rows: [{ id_verified: true }] }) // Verified OK
        .mockResolvedValueOnce({ rows: [{ after_hours_consent: false }] }); // No consent

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData).toEqual({
        success: false,
        error: 'Location sharing consent required for After Hours Mode',
        code: 'CONSENT_REQUIRED',
        requiresConsent: true,
      });
      expect(mockLogger.info).toHaveBeenCalledWith(
        'After Hours access denied: no location consent',
        { userId: 'test-user-123' }
      );
    });

    it('should return 403 CONSENT_REQUIRED when consent is null', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // Premium OK
        .mockResolvedValueOnce({ rows: [{ id_verified: true }] }) // Verified OK
        .mockResolvedValueOnce({ rows: [{ after_hours_consent: null }] }); // Consent null

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.jsonData.code).toBe('CONSENT_REQUIRED');
    });
  });

  describe('Successful authorization (all checks pass)', () => {
    it('should call next() when premium, verified, and consented', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true, expires_at: null }] }) // Premium OK
        .mockResolvedValueOnce({ rows: [{ id_verified: true }] }) // Verified OK
        .mockResolvedValueOnce({ rows: [{ after_hours_consent: true }] }); // Consent OK

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });

    it('should verify all three queries are called with correct user ID', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id_verified: true }] })
        .mockResolvedValueOnce({ rows: [{ after_hours_consent: true }] });

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockQuery).toHaveBeenCalledTimes(3);

      // Check subscription query
      expect(mockQuery.mock.calls[0][1]).toEqual(['test-user-123']);

      // Check verification query
      expect(mockQuery.mock.calls[1][1]).toEqual(['test-user-123']);

      // Check consent query
      expect(mockQuery.mock.calls[2][1]).toEqual(['test-user-123']);
    });
  });

  describe('Fail-closed error handling (SECURITY CRITICAL)', () => {
    it('should return 500 AUTH_ERROR and NOT call next() on database error', async () => {
      const dbError = new Error('Connection refused');
      const mockQuery = jest.fn().mockRejectedValueOnce(dbError);

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      // SECURITY: next() must NOT be called on error
      expect(mockNext).not.toHaveBeenCalled();

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.jsonData).toEqual({
        success: false,
        error: 'Unable to verify After Hours access',
        code: 'AUTH_ERROR',
      });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'After Hours auth middleware error',
        { error: dbError, userId: 'test-user-123' }
      );
    });

    it('should fail closed on error during verification check', async () => {
      const dbError = new Error('Query timeout');
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // Premium OK
        .mockRejectedValueOnce(dbError); // Error on verification

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.jsonData.code).toBe('AUTH_ERROR');
    });

    it('should fail closed on error during consent check', async () => {
      const dbError = new Error('Network error');
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // Premium OK
        .mockResolvedValueOnce({ rows: [{ id_verified: true }] }) // Verified OK
        .mockRejectedValueOnce(dbError); // Error on consent

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.jsonData.code).toBe('AUTH_ERROR');
    });
  });

  describe('Default logger', () => {
    it('should use console as default logger when not provided', async () => {
      const mockQuery = jest.fn().mockResolvedValueOnce({ rows: [] });
      const mockPool = createMockPool(mockQuery);

      // Spy on console.info
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation();

      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        // No logger provided - should use console
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      expect(consoleSpy).toHaveBeenCalledWith(
        'After Hours access denied: no active subscription',
        { userId: 'test-user-123' }
      );

      consoleSpy.mockRestore();
    });
  });

  describe('SQL query structure', () => {
    it('should use correct subscription query with expiry check', async () => {
      const mockQuery = jest.fn().mockResolvedValueOnce({ rows: [] });
      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      const subscriptionQuery = mockQuery.mock.calls[0][0];

      // Verify key parts of the subscription query
      expect(subscriptionQuery).toContain('user_subscriptions');
      expect(subscriptionQuery).toContain('is_active = true');
      expect(subscriptionQuery).toContain('expires_at IS NULL OR expires_at > NOW()');
      expect(subscriptionQuery).toContain('ORDER BY expires_at DESC NULLS FIRST');
      expect(subscriptionQuery).toContain('LIMIT 1');
    });

    it('should query id_verified from users table', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id_verified: false }] });

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      const verificationQuery = mockQuery.mock.calls[1][0];
      expect(verificationQuery).toContain('id_verified');
      expect(verificationQuery).toContain('users');
    });

    it('should query after_hours_consent from users table', async () => {
      const mockQuery = jest.fn()
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({ rows: [{ id_verified: true }] })
        .mockResolvedValueOnce({ rows: [{ after_hours_consent: false }] });

      const mockPool = createMockPool(mockQuery);
      const middleware = createAfterHoursAuthMiddleware({
        pool: mockPool as any,
        logger: mockLogger,
      });

      const req = createMockRequest();
      const res = createMockResponse();

      await middleware(req as Request, res as Response, mockNext);

      const consentQuery = mockQuery.mock.calls[2][0];
      expect(consentQuery).toContain('after_hours_consent');
      expect(consentQuery).toContain('users');
    });
  });
});
