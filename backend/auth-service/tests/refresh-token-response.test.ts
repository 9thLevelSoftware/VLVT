import jwt from 'jsonwebtoken';
import crypto from 'crypto';

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
    logAuthEvent: jest.fn().mockResolvedValue(undefined),
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

import request from 'supertest';
import { Pool } from 'pg';
import app from '../src/index';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('Refresh Token Response', () => {
  let mockPool: any;
  const mockUserId = 'test-user-123';
  const mockRefreshToken = 'valid-refresh-token-abc123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = new Pool();
    // Reset mock implementation to return empty by default
    mockPool.query.mockReset();
    mockPool.query.mockResolvedValue({ rows: [] });
  });

  describe('POST /auth/refresh - refreshToken in response', () => {
    it('should include refreshToken in response when refresh succeeds (with rotation)', async () => {
      // Mock finding the refresh token in database
      // Note: Now includes token_family and rotated_at for rotation support
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 1,
            user_id: mockUserId,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days from now
            revoked_at: null,
            token_family: 'test-family-uuid',
            rotated_at: null, // Not yet rotated
            device_info: null,
            ip_address: null,
            provider: 'google',
            email: 'test@example.com'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN transaction
        .mockResolvedValueOnce({ rows: [] }) // UPDATE old token (mark rotated)
        .mockResolvedValueOnce({ rows: [] }) // INSERT new token
        .mockResolvedValueOnce({ rows: [] }) // COMMIT transaction
        .mockResolvedValueOnce({ rows: [] }); // Mock audit log insert

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: mockRefreshToken });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      // With token rotation, a NEW token is returned (different from input)
      expect(response.body.refreshToken).not.toBe(mockRefreshToken);
      // New token should be a valid hex string (128 chars for 64-byte token)
      expect(response.body.refreshToken).toMatch(/^[a-f0-9]{128}$/);
    });

    it('should return a NEW rotated refreshToken (not the same as input)', async () => {
      const customRefreshToken = 'my-custom-refresh-token-xyz';

      // Mock finding the refresh token - chain all mocks
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: 2,
            user_id: mockUserId,
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            revoked_at: null,
            token_family: 'another-family-uuid',
            rotated_at: null,
            device_info: null,
            ip_address: null,
            provider: 'apple',
            email: 'user@example.com'
          }]
        })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [] }) // UPDATE
        .mockResolvedValueOnce({ rows: [] }) // INSERT
        .mockResolvedValueOnce({ rows: [] }) // COMMIT
        .mockResolvedValueOnce({ rows: [] }); // Audit log

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: customRefreshToken });

      expect(response.status).toBe(200);
      // With rotation, the returned token should be DIFFERENT
      expect(response.body.refreshToken).not.toBe(customRefreshToken);
    });

    it('should return error when refresh token is missing', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Refresh token is required');
    });
  });

  describe('POST /auth/refresh - error cases', () => {
    it('should return error when refresh token is invalid (not found)', async () => {
      // Mock not finding the token (first query)
      // Also mock the reuse check (second query) to return nothing
      mockPool.query
        .mockResolvedValueOnce({ rows: [] })  // Token not found
        .mockResolvedValueOnce({ rows: [] }); // Reuse check - no superseded_by match

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: 'invalid-token' });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid refresh token');
    });

    it('should return error when refresh token has been revoked', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: mockUserId,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revoked_at: new Date(), // Token is revoked
          token_family: 'test-family',
          rotated_at: null,
          provider: 'google',
          email: 'test@example.com'
        }]
      });

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: mockRefreshToken });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Refresh token has been revoked');
    });

    it('should return error when refresh token has expired', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: mockUserId,
          expires_at: new Date(Date.now() - 1000), // Already expired
          revoked_at: null,
          token_family: 'test-family',
          rotated_at: null,
          provider: 'google',
          email: 'test@example.com'
        }]
      });

      const response = await request(app)
        .post('/auth/refresh')
        .send({ refreshToken: mockRefreshToken });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Refresh token has expired');
    });
  });
});
