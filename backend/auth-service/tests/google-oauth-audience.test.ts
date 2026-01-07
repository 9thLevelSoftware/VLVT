import request from 'supertest';

// Mock dependencies before importing the app
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
}));

import app from '../src/index';

describe('Google OAuth Audience Validation', () => {
  const originalEnv = process.env.GOOGLE_CLIENT_ID;

  afterEach(() => {
    // Restore original environment variable
    if (originalEnv !== undefined) {
      process.env.GOOGLE_CLIENT_ID = originalEnv;
    } else {
      delete process.env.GOOGLE_CLIENT_ID;
    }
  });

  describe('when GOOGLE_CLIENT_ID is not set', () => {
    beforeEach(() => {
      delete process.env.GOOGLE_CLIENT_ID;
    });

    it('should reject Google sign-in with 503 when GOOGLE_CLIENT_ID is not configured', async () => {
      const response = await request(app)
        .post('/auth/google')
        .send({ idToken: 'fake-token' });

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('not configured');
    });
  });

  describe('when GOOGLE_CLIENT_ID is set', () => {
    beforeEach(() => {
      process.env.GOOGLE_CLIENT_ID = 'test-client-id';

      // Mock Google OAuth verification
      const { OAuth2Client } = require('google-auth-library');
      OAuth2Client.prototype.verifyIdToken = jest.fn().mockResolvedValue({
        getPayload: () => ({
          sub: '123456789',
          email: 'test@example.com',
        }),
      });
    });

    it('should proceed with token verification when GOOGLE_CLIENT_ID is configured', async () => {
      const response = await request(app)
        .post('/auth/google')
        .send({ idToken: 'valid-token' });

      // Should not return 503 (not configured)
      // May fail on DB lookup, but should pass the configuration check
      expect(response.status).not.toBe(503);
    });

    it('should still validate that idToken is provided', async () => {
      const response = await request(app)
        .post('/auth/google')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('idToken is required');
    });
  });
});
