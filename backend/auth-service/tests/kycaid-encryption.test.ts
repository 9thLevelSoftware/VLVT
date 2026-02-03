import request from 'supertest';

// Mock dependencies before importing the app
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
    connect: jest.fn().mockResolvedValue({
      query: jest.fn(),
      release: jest.fn(),
    }),
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
  verifyCallbackSignature: jest.fn().mockReturnValue(true),
  parseCallbackData: jest.fn().mockReturnValue({
    verification_id: 'test-verification-id',
    applicant_id: 'test-applicant-id',
    status: 'completed',
    verification_status: 'approved',
    verified: true,
  }),
  extractVerifiedUserData: jest.fn().mockReturnValue({
    firstName: 'John',
    lastName: 'Doe',
    dateOfBirth: '1990-01-01',
    documentNumber: 'ABC123',
    documentExpiry: '2030-01-01',
    documentType: 'passport',
    documentCountry: 'US',
    documentVerified: true,
    faceMatchVerified: true,
    livenessVerified: true,
    amlCleared: true,
  }),
}));

import app from '../src/index';
import { Pool } from 'pg';

const mockPool = new Pool() as jest.Mocked<Pool>;

describe('KYCAID PII Encryption', () => {
  const originalEnv = process.env.KYCAID_ENCRYPTION_KEY;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset pool mock for each test
    (mockPool.query as jest.Mock).mockReset();
  });

  afterAll(() => {
    // Restore original env
    if (originalEnv) {
      process.env.KYCAID_ENCRYPTION_KEY = originalEnv;
    } else {
      delete process.env.KYCAID_ENCRYPTION_KEY;
    }
  });

  describe('when KYCAID_ENCRYPTION_KEY is not set', () => {
    beforeEach(() => {
      delete process.env.KYCAID_ENCRYPTION_KEY;
    });

    it('should reject KYCAID webhook with 503', async () => {
      // Note: App is already imported and configured, so we test behavior
      // The implementation should check for encryption key early in the handler

      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: 'test-applicant-id',
          verification_id: 'test-verification-id'
        }));

      expect(response.status).toBe(503);
      expect(response.body.error).toContain('encryption');
    });

    it('should not process PII data when encryption key is missing', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: 'test-applicant-id',
          verification_id: 'test-verification-id'
        }));

      expect(response.status).toBe(503);
      expect(response.body.success).toBe(false);
    });
  });

  describe('when KYCAID_ENCRYPTION_KEY is set', () => {
    beforeEach(() => {
      process.env.KYCAID_ENCRYPTION_KEY = 'test-encryption-key-32chars!!';
      // Mock DB queries for successful webhook processing
      (mockPool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [{ id: 'verification-1', user_id: 'user-1' }]
        });
    });

    it('should process webhook normally (not return 503)', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: 'test-applicant-id',
          verification_id: 'test-verification-id'
        }));

      // May fail on DB operations, but should NOT be 503 (encryption config error)
      expect(response.status).not.toBe(503);
    });

    it('should not return encryption configuration error', async () => {
      const response = await request(app)
        .post('/auth/kycaid/webhook')
        .set('Content-Type', 'application/json')
        .set('x-kycaid-signature', 'valid-signature')
        .send(JSON.stringify({
          type: 'VERIFICATION_COMPLETED',
          applicant_id: 'test-applicant-id',
          verification_id: 'test-verification-id'
        }));

      // Should not have encryption-related error
      if (response.body.error) {
        expect(response.body.error).not.toContain('encryption');
      }
    });
  });
});
