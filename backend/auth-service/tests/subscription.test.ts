import request from 'supertest';
import jwt from 'jsonwebtoken';

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

import { Pool } from 'pg';
import app from '../src/index';

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

describe('RevenueCat Subscription Flow Tests', () => {
  let mockPool: any;
  const originalEnv = process.env.REVENUECAT_WEBHOOK_AUTH;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = new Pool();
    mockPool.query.mockResolvedValue({ rows: [] });
    process.env.REVENUECAT_WEBHOOK_AUTH = 'test-webhook-secret';
  });

  afterEach(() => {
    if (originalEnv !== undefined) {
      process.env.REVENUECAT_WEBHOOK_AUTH = originalEnv;
    } else {
      delete process.env.REVENUECAT_WEBHOOK_AUTH;
    }
  });

  describe('RevenueCat Webhook Subscription Events', () => {
    const validAuthHeader = 'test-webhook-secret';

    describe('INITIAL_PURCHASE event', () => {
      it('should process INITIAL_PURCHASE and create subscription record', async () => {
        // Mock INSERT/UPSERT query for subscription creation
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              type: 'INITIAL_PURCHASE',
              id: 'evt_123',
              app_user_id: 'user_premium_001',
              original_app_user_id: 'user_premium_001',
              product_id: 'premium_monthly',
              entitlement_ids: ['premium'],
              purchased_at_ms: Date.now(),
              expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
              store: 'APP_STORE',
              environment: 'PRODUCTION',
              transaction_id: 'txn_abc123',
              original_transaction_id: 'txn_abc123',
              period_type: 'normal',
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Verify database INSERT was called with subscription data
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO user_subscriptions'),
          expect.arrayContaining([
            expect.stringContaining('rc_txn_abc123'), // id
            'user_premium_001', // user_id
            'user_premium_001', // revenuecat_id
            'premium_monthly', // product_id
            'premium', // entitlement_id
            true, // is_active
          ])
        );
      });

      it('should use original_app_user_id as primary identifier', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              type: 'INITIAL_PURCHASE',
              id: 'evt_456',
              app_user_id: 'different_id',
              original_app_user_id: 'original_user_id',
              product_id: 'premium_monthly',
              entitlement_ids: ['premium'],
              purchased_at_ms: Date.now(),
              expiration_at_ms: Date.now() + 30 * 24 * 60 * 60 * 1000,
              transaction_id: 'txn_def456',
            },
          });

        expect(response.status).toBe(200);

        // Should use original_app_user_id, not app_user_id
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO user_subscriptions'),
          expect.arrayContaining(['original_user_id'])
        );
      });
    });

    describe('RENEWAL event', () => {
      it('should process RENEWAL and update subscription expiration', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const newExpiration = Date.now() + 30 * 24 * 60 * 60 * 1000;

        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              type: 'RENEWAL',
              id: 'evt_renewal_789',
              app_user_id: 'user_premium_001',
              original_app_user_id: 'user_premium_001',
              product_id: 'premium_monthly',
              entitlement_ids: ['premium'],
              purchased_at_ms: Date.now(),
              expiration_at_ms: newExpiration,
              transaction_id: 'txn_renewal',
              original_transaction_id: 'txn_abc123',
              period_type: 'normal',
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // RENEWAL uses same INSERT...ON CONFLICT UPDATE pattern
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('INSERT INTO user_subscriptions'),
          expect.arrayContaining([true]) // is_active = true
        );
      });
    });

    describe('CANCELLATION event', () => {
      it('should process CANCELLATION and set will_renew to false', async () => {
        // Mock UPDATE query
        mockPool.query.mockResolvedValueOnce({ rows: [{ user_id: 'user_premium_001' }] });

        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              type: 'CANCELLATION',
              id: 'evt_cancel_001',
              app_user_id: 'user_premium_001',
              original_app_user_id: 'user_premium_001',
              product_id: 'premium_monthly',
              expiration_at_ms: Date.now() + 15 * 24 * 60 * 60 * 1000, // Still active for 15 days
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Verify UPDATE sets will_renew = false
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE user_subscriptions'),
          expect.arrayContaining(['user_premium_001'])
        );
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('will_renew = false'),
          expect.any(Array)
        );
      });
    });

    describe('EXPIRATION event', () => {
      it('should process EXPIRATION and deactivate subscription', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              type: 'EXPIRATION',
              id: 'evt_expire_001',
              app_user_id: 'user_premium_001',
              original_app_user_id: 'user_premium_001',
              product_id: 'premium_monthly',
              expiration_at_ms: Date.now() - 1000, // Already expired
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // Verify UPDATE sets is_active = false
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('UPDATE user_subscriptions'),
          expect.arrayContaining(['user_premium_001'])
        );
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('is_active = false'),
          expect.any(Array)
        );
      });
    });

    describe('BILLING_ISSUE event', () => {
      it('should process BILLING_ISSUE and deactivate subscription', async () => {
        mockPool.query.mockResolvedValueOnce({ rows: [] });

        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              type: 'BILLING_ISSUE',
              id: 'evt_billing_001',
              app_user_id: 'user_premium_001',
              original_app_user_id: 'user_premium_001',
              product_id: 'premium_monthly',
              expiration_at_ms: Date.now(),
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);

        // BILLING_ISSUE should also deactivate
        expect(mockPool.query).toHaveBeenCalledWith(
          expect.stringContaining('is_active = false'),
          expect.any(Array)
        );
      });
    });

    describe('Invalid/Missing events', () => {
      it('should reject events without user ID', async () => {
        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              type: 'INITIAL_PURCHASE',
              id: 'evt_no_user',
              product_id: 'premium_monthly',
              // Missing app_user_id and original_app_user_id
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Missing user ID');
      });

      it('should reject events without type', async () => {
        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              id: 'evt_no_type',
              app_user_id: 'user_001',
              // Missing type
            },
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('Invalid payload');
      });

      it('should handle TEST webhook events', async () => {
        const response = await request(app)
          .post('/auth/revenuecat/webhook')
          .set('Authorization', validAuthHeader)
          .send({
            api_version: '1.0',
            event: {
              type: 'TEST',
              id: 'evt_test',
              app_user_id: 'test_user',
            },
          });

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
        // TEST events should not trigger any DB operations
      });
    });
  });

  describe('Subscription Status Endpoint', () => {
    const generateValidToken = (userId: string) => {
      return jwt.sign(
        { userId, provider: 'google', email: 'test@example.com' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
    };

    it('should return isPremium: true for active subscription', async () => {
      const token = generateValidToken('premium_user_001');
      const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Mock active subscription query
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          is_active: true,
          expires_at: futureDate,
          product_id: 'premium_monthly',
          entitlement_id: 'premium',
        }],
      });

      const response = await request(app)
        .get('/auth/subscription-status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isPremium).toBe(true);
      expect(response.body.subscription).toBeDefined();
      expect(response.body.subscription.productId).toBe('premium_monthly');
      expect(response.body.subscription.entitlementId).toBe('premium');
    });

    it('should return isPremium: false for expired subscription', async () => {
      const token = generateValidToken('expired_user_001');

      // Mock no active subscription (expired ones don't show up in query)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/auth/subscription-status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isPremium).toBe(false);
      expect(response.body.subscription).toBeNull();
    });

    it('should return isPremium: false for user without subscription', async () => {
      const token = generateValidToken('free_user_001');

      // Mock no subscription
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/auth/subscription-status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.isPremium).toBe(false);
      expect(response.body.subscription).toBeNull();
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .get('/auth/subscription-status');

      expect(response.status).toBe(401);
    });

    it('should return 401 with invalid token', async () => {
      const response = await request(app)
        .get('/auth/subscription-status')
        .set('Authorization', 'Bearer invalid_token');

      expect(response.status).toBe(401);
    });
  });

  describe('Premium Feature Gates', () => {
    // These tests verify that premium features properly check subscription status

    const generateValidToken = (userId: string) => {
      return jwt.sign(
        { userId, provider: 'google', email: 'test@example.com' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
    };

    it('should properly query subscription status with active filter', async () => {
      const token = generateValidToken('test_user_001');

      // Call subscription-status endpoint which demonstrates the gate pattern
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await request(app)
        .get('/auth/subscription-status')
        .set('Authorization', `Bearer ${token}`);

      // Verify the query includes active and expiration checks
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('is_active = true'),
        expect.any(Array)
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('expires_at'),
        expect.any(Array)
      );
    });

    it('should only return most recent active subscription', async () => {
      const token = generateValidToken('multi_sub_user');

      // The endpoint orders by expires_at DESC and limits to 1
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          is_active: true,
          expires_at: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000), // Latest expiry
          product_id: 'premium_yearly',
          entitlement_id: 'premium',
        }],
      });

      const response = await request(app)
        .get('/auth/subscription-status')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body.subscription.productId).toBe('premium_yearly');

      // Verify query orders correctly
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY expires_at DESC'),
        expect.any(Array)
      );
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT 1'),
        expect.any(Array)
      );
    });
  });
});
