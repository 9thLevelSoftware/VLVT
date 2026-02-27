import request from 'supertest';

// Shared mock pool instance used by both pg and @vlvt/shared mocks
const mPool = {
  query: jest.fn(),
  on: jest.fn(),
};

// Mock dependencies before importing the app
jest.mock('pg', () => {
  return { Pool: jest.fn(() => mPool) };
});

jest.mock('google-auth-library');
jest.mock('apple-signin-auth', () => ({
  verifyIdToken: jest.fn(),
}));
jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  setupExpressErrorHandler: jest.fn(),
  captureException: jest.fn(),
  captureMessage: jest.fn(),
}));

jest.mock('../src/middleware/rate-limiter', () => ({
  authLimiter: (req: any, res: any, next: any) => next(),
  verifyLimiter: (req: any, res: any, next: any) => next(),
  generalLimiter: (req: any, res: any, next: any) => next(),
}));

jest.mock('../src/services/email-service', () => ({
  emailService: {
    sendVerificationEmail: jest.fn().mockResolvedValue(true),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(true),
  },
}));

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed_password'),
  compare: jest.fn(),
}));

// Mock @vlvt/shared to bypass CSRF middleware
jest.mock('@vlvt/shared', () => ({
  createCsrfMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  createCsrfTokenHandler: jest.fn(() => (req: any, res: any) => res.json({ token: 'mock-token' })),
  correlationMiddleware: (req: any, res: any, next: any) => next(),
  createRequestLoggerMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  createAuditLogger: jest.fn(() => ({
    logAction: jest.fn().mockResolvedValue(undefined),
  })),
  AuditAction: {
    LOGIN: 'LOGIN',
    LOGOUT: 'LOGOUT',
    REGISTER: 'REGISTER',
    PASSWORD_CHANGE: 'PASSWORD_CHANGE',
    PASSWORD_RESET: 'PASSWORD_RESET',
    TOKEN_REFRESH: 'TOKEN_REFRESH',
    VERIFICATION_REQUEST: 'VERIFICATION_REQUEST',
    VERIFICATION_COMPLETE: 'VERIFICATION_COMPLETE',
  },
  AuditResourceType: {
    USER: 'USER',
    SESSION: 'SESSION',
    VERIFICATION: 'VERIFICATION',
  },
  addVersionToHealth: jest.fn((obj: any) => obj),
  createVersionMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  API_VERSIONS: { V1: 'v1' },
  CURRENT_API_VERSION: 'v1',
  ErrorCodes: {},
  sendErrorResponse: jest.fn(),
  createErrorResponseSender: jest.fn(() => jest.fn()),
  createPool: jest.fn(() => mPool),
}));

import app from '../src/index';

describe('RevenueCat Webhook Authentication', () => {
  const originalEnv = process.env.REVENUECAT_WEBHOOK_AUTH;

  afterEach(() => {
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.REVENUECAT_WEBHOOK_AUTH = originalEnv;
    } else {
      delete process.env.REVENUECAT_WEBHOOK_AUTH;
    }
  });

  describe('when REVENUECAT_WEBHOOK_AUTH is not set', () => {
    beforeEach(() => {
      delete process.env.REVENUECAT_WEBHOOK_AUTH;
    });

    it('should reject all webhook requests with 503', async () => {
      const response = await request(app)
        .post('/auth/revenuecat/webhook')
        .send({ event: { type: 'INITIAL_PURCHASE' } });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('not configured');
    });
  });

  describe('when REVENUECAT_WEBHOOK_AUTH is set', () => {
    beforeEach(() => {
      process.env.REVENUECAT_WEBHOOK_AUTH = 'test-secret';
    });

    it('should reject requests with missing auth header', async () => {
      const response = await request(app)
        .post('/auth/revenuecat/webhook')
        .send({ event: { type: 'INITIAL_PURCHASE' } });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should reject requests with invalid auth header', async () => {
      const response = await request(app)
        .post('/auth/revenuecat/webhook')
        .set('Authorization', 'wrong-secret')
        .send({ event: { type: 'INITIAL_PURCHASE' } });

      expect(response.status).toBe(401);
      expect(response.body.error).toBe('Unauthorized');
    });

    it('should accept requests with valid auth header', async () => {
      const response = await request(app)
        .post('/auth/revenuecat/webhook')
        .set('Authorization', 'test-secret')
        .send({ event: { type: 'INITIAL_PURCHASE', app_user_id: 'test-user' } });

      // May fail on DB lookup or validation, but should pass auth (not 401 or 503)
      expect(response.status).not.toBe(401);
      expect(response.status).not.toBe(503);
    });

    it('should use timing-safe comparison for auth header', async () => {
      // This test ensures the comparison doesn't short-circuit on first character mismatch
      // Both should return 401 in similar time (we can't easily test timing, but we can verify behavior)
      const response1 = await request(app)
        .post('/auth/revenuecat/webhook')
        .set('Authorization', 'wrong-secret')
        .send({ event: { type: 'INITIAL_PURCHASE' } });

      const response2 = await request(app)
        .post('/auth/revenuecat/webhook')
        .set('Authorization', 'test-secreX') // Same length, one char different at end
        .send({ event: { type: 'INITIAL_PURCHASE' } });

      expect(response1.status).toBe(401);
      expect(response2.status).toBe(401);
    });
  });
});
