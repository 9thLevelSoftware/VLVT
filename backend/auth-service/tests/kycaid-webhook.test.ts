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
}));

// Mock kycaid-service to control signature verification
jest.mock('../src/services/kycaid-service', () => ({
  createVerification: jest.fn(),
  getVerificationStatus: jest.fn(),
  verifyCallbackSignature: jest.fn().mockReturnValue(true), // Allow signature to pass
  parseCallbackData: jest.fn().mockReturnValue(null), // Will be overridden per test
  extractVerifiedUserData: jest.fn().mockReturnValue({}),
}));

import app from '../src/index';
import * as kycaidService from '../src/services/kycaid-service';

describe('POST /auth/kycaid/webhook', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default mock behavior
    (kycaidService.verifyCallbackSignature as jest.Mock).mockReturnValue(true);
    // Set encryption key for all tests (encryption key validation tests are in kycaid-encryption.test.ts)
    process.env.KYCAID_ENCRYPTION_KEY = 'test-encryption-key-32chars!!';
  });

  describe('Input validation', () => {
    it('should reject requests without required fields', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({}));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Missing required field');
    });

    it('should reject requests with invalid type field', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 123, // Invalid: should be string
          applicant_id: 'test-applicant-id',
          verification_id: 'test-verification-id'
        }));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('type');
    });

    it('should reject requests with null applicant_id', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: null
        }));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('applicant_id');
    });

    it('should reject requests with missing applicant_id', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED'
        }));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('applicant_id');
    });

    it('should reject requests with invalid applicant_id type', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: { id: 'nested' } // Invalid: should be string
        }));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('applicant_id');
    });

    it('should reject requests with missing verification_id', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: 'test-applicant-id'
        }));

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('verification_id');
    });
  });

  describe('Signature validation', () => {
    it('should reject requests without signature header', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: 'test-applicant-id',
          verification_id: 'test-verification-id'
        }));

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid signature');
    });

    it('should reject requests with invalid signature', async () => {
      (kycaidService.verifyCallbackSignature as jest.Mock).mockReturnValue(false);

      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'invalid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: 'test-applicant-id',
          verification_id: 'test-verification-id'
        }));

      expect(response.status).toBe(401);
      expect(response.body.error).toContain('Invalid signature');
    });
  });
});
