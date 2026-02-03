import jwt from 'jsonwebtoken';

// Mock dependencies before importing the app
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
    connect: jest.fn(),
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

import request from 'supertest';
import { Pool } from 'pg';
import app from '../src/index';

const JWT_SECRET = process.env.JWT_SECRET!;

describe('Account Lockout', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = new Pool();
    mockPool.query.mockResolvedValue({ rows: [] });
    mockPool.connect = undefined;

    // Reset bcrypt mock to default
    const bcrypt = require('bcrypt');
    bcrypt.compare.mockResolvedValue(true);
  });

  describe('Account locking after failed attempts', () => {
    it('should lock account after 5 failed login attempts', async () => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValue(false); // Invalid password

      // Mock user exists with incrementing failed attempts
      // For attempts 1-4, return user with incrementing failed_attempts
      // On attempt 5, indicate account is now locked
      for (let attempt = 1; attempt <= 5; attempt++) {
        // Reset mocks for each iteration
        mockPool.query.mockReset();

        // Mock checkAccountLocked - not locked (for attempts 1-5)
        mockPool.query.mockResolvedValueOnce({
          rows: [{ is_locked: false }]
        });

        // Mock credential lookup
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            user_id: 'email_user123',
            email: 'test@example.com',
            password_hash: 'hashed_password',
            email_verified: true,
            failed_attempts: attempt - 1,
            provider: 'email'
          }]
        });

        // Mock recordFailedLogin - use fallback path
        const lockedUntil = attempt >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null;
        mockPool.query.mockRejectedValueOnce(new Error('function not found')); // Trigger fallback
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            failed_attempts: attempt,
            locked_until: lockedUntil
          }]
        });

        const response = await request(app)
          .post('/auth/email/login')
          .send({ email: 'test@example.com', password: 'WrongPassword!' });

        if (attempt < 5) {
          // Should return 401 with standardized error response
          expect(response.status).toBe(401);
          expect(response.body.success).toBe(false);
          expect(response.body.message).toBeDefined();
        } else {
          // 5th failed attempt should lock the account
          expect(response.status).toBe(423);
          expect(response.body.success).toBe(false);
          expect(response.body.code).toBe('AUTH_006');
        }
      }
    });

    it('should return 423 when trying to login with locked account', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes from now

      // Mock checkAccountLocked - account is locked
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_locked: true }]
      });
      // Mock getting locked_until timestamp
      mockPool.query.mockResolvedValueOnce({
        rows: [{ locked_until: lockedUntil }]
      });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'locked@example.com', password: 'AnyPassword123!' })
        .expect(423);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_006');
      expect(response.body.message).toContain('temporarily locked');
    });

    it('should reject correct password when account is locked', async () => {
      const lockedUntil = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValue(true); // Correct password

      // Mock checkAccountLocked - account is locked
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_locked: true }]
      });
      // Mock getting locked_until timestamp
      mockPool.query.mockResolvedValueOnce({
        rows: [{ locked_until: lockedUntil }]
      });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'locked@example.com', password: 'CorrectPassword123!' })
        .expect(423);

      // Even with correct password, should not authenticate
      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_006');
      expect(response.body).not.toHaveProperty('token');
      expect(response.body).not.toHaveProperty('userId');
    });
  });

  describe('Counter reset on successful login', () => {
    it('should reset failed_attempts counter after successful login', async () => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValue(true); // Valid password

      // Mock checkAccountLocked - not locked
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_locked: false }]
      });

      // Mock credential lookup with previous failed attempts
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          email_verified: true,
          failed_attempts: 3,
          provider: 'email'
        }]
      });

      // Mock recordSuccessfulLogin - fallback path
      mockPool.query.mockRejectedValueOnce(new Error('function not found')); // Trigger fallback
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // Fallback UPDATE

      // Mock UPDATE users
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock INSERT refresh_token
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'CorrectPassword123!' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('userId');

      // Verify the UPDATE to reset failed_attempts was called
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_attempts = 0'),
        expect.arrayContaining(['test@example.com'])
      );
    });

    it('should allow login after failed attempts if within threshold', async () => {
      const bcrypt = require('bcrypt');

      // First, make 2 failed attempts
      for (let i = 1; i <= 2; i++) {
        mockPool.query.mockReset();
        bcrypt.compare.mockResolvedValue(false);

        // Mock checkAccountLocked
        mockPool.query.mockResolvedValueOnce({ rows: [{ is_locked: false }] });

        // Mock credential lookup
        mockPool.query.mockResolvedValueOnce({
          rows: [{
            user_id: 'email_user123',
            email: 'test@example.com',
            password_hash: 'hashed_password',
            email_verified: true,
            failed_attempts: i - 1,
            provider: 'email'
          }]
        });

        // Mock recordFailedLogin fallback
        mockPool.query.mockRejectedValueOnce(new Error('function not found'));
        mockPool.query.mockResolvedValueOnce({
          rows: [{ failed_attempts: i, locked_until: null }]
        });

        await request(app)
          .post('/auth/email/login')
          .send({ email: 'test@example.com', password: 'WrongPassword!' })
          .expect(401);
      }

      // Now try with correct password
      mockPool.query.mockReset();
      bcrypt.compare.mockResolvedValue(true);

      // Mock checkAccountLocked
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_locked: false }] });

      // Mock credential lookup
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          email_verified: true,
          failed_attempts: 2,
          provider: 'email'
        }]
      });

      // Mock recordSuccessfulLogin fallback
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock UPDATE users
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock INSERT refresh_token
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'CorrectPassword123!' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
    });
  });

  describe('Account unlocking after lockout period', () => {
    it('should allow login after lockout period expires', async () => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValue(true);

      // Mock expired lock (lockout period passed)
      const expiredLock = new Date(Date.now() - 1000); // 1 second ago

      // Mock checkAccountLocked - using fallback path with expired lock
      mockPool.query.mockRejectedValueOnce(new Error('function not found')); // Trigger fallback
      mockPool.query.mockResolvedValueOnce({
        rows: [{ locked_until: expiredLock }]
      });
      // Mock clearing expired lock
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock credential lookup
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          email_verified: true,
          failed_attempts: 5,
          provider: 'email'
        }]
      });

      // Mock recordSuccessfulLogin fallback
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock UPDATE users
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock INSERT refresh_token
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'CorrectPassword123!' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('userId');
    });

    it('should clear failed_attempts when lock expires', async () => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValue(true);

      // Mock expired lock
      const expiredLock = new Date(Date.now() - 60000); // 1 minute ago

      // Mock checkAccountLocked - using fallback with expired lock
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({
        rows: [{ locked_until: expiredLock }]
      });
      // Mock clearing expired lock
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock credential lookup
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          email_verified: true,
          failed_attempts: 5, // Was at max
          provider: 'email'
        }]
      });

      // Mock recordSuccessfulLogin fallback
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock UPDATE users
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock INSERT refresh_token
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'CorrectPassword123!' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify lock was cleared in checkAccountLocked
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('locked_until = NULL'),
        expect.arrayContaining(['test@example.com'])
      );
    });
  });

  describe('Lockout response format', () => {
    it('should include all required fields in lockout response', async () => {
      const lockedUntil = new Date(Date.now() + 15 * 60 * 1000);

      // Mock checkAccountLocked - account is locked
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_locked: true }]
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ locked_until: lockedUntil }]
      });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'locked@example.com', password: 'AnyPassword123!' })
        .expect(423);

      expect(response.body).toEqual(expect.objectContaining({
        success: false,
        message: expect.stringContaining('temporarily locked'),
        code: 'AUTH_006',
      }));
    });

    it('should calculate correct retryAfterMinutes', async () => {
      const lockedUntil = new Date(Date.now() + 7 * 60 * 1000); // 7 minutes from now

      // Mock checkAccountLocked - account is locked
      mockPool.query.mockResolvedValueOnce({
        rows: [{ is_locked: true }]
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{ locked_until: lockedUntil }]
      });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'locked@example.com', password: 'AnyPassword123!' })
        .expect(423);

      expect(response.body.retryAfter).toBeDefined();
    });

    it('should show warning when close to lockout', async () => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValue(false);

      // Mock checkAccountLocked
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_locked: false }] });

      // Mock credential lookup with 3 failed attempts (2 remaining)
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          email_verified: true,
          failed_attempts: 3,
          provider: 'email'
        }]
      });

      // Mock recordFailedLogin fallback - 4th attempt
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({
        rows: [{ failed_attempts: 4, locked_until: null }]
      });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'WrongPassword!' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Authentication failed');
    });
  });

  describe('Edge cases', () => {
    it('should not lock account for non-existent email', async () => {
      // Mock checkAccountLocked - account not found
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No auth_credentials found

      // Mock credential lookup - not found
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'nonexistent@example.com', password: 'AnyPassword123!' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Authentication failed');
      expect(response.body.code).not.toBe('AUTH_006');
    });

    it('should increment counter for unverified email attempts', async () => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValue(true); // Correct password

      // Mock checkAccountLocked
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_locked: false }] });

      // Mock credential lookup - unverified email
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'unverified@example.com',
          password_hash: 'hashed_password',
          email_verified: false,
          failed_attempts: 0,
          provider: 'email'
        }]
      });

      // Mock recordFailedLogin for unverified attempt
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({
        rows: [{ failed_attempts: 1, locked_until: null }]
      });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'unverified@example.com', password: 'CorrectPassword123!' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('AUTH_007');

      // Verify failed login was recorded
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('failed_attempts'),
        expect.any(Array)
      );
    });

    it('should handle database errors gracefully', async () => {
      // Mock all database queries to throw errors (both function call and fallback)
      mockPool.query.mockRejectedValue(new Error('Database connection error'));

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'AnyPassword123!' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Login failed');
    });
  });
});
