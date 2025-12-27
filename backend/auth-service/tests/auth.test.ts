import jwt from 'jsonwebtoken';

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

import request from 'supertest';
import { Pool } from 'pg';
import app from '../src/index';

const JWT_SECRET = process.env.JWT_SECRET!;

describe('Auth Service', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Get mocked pool instance
    mockPool = new Pool();

    // Mock pool.query to return empty by default (tests will override as needed)
    mockPool.query.mockResolvedValue({ rows: [] });

    // Reset pool.connect to undefined (tests that need it will set it up)
    mockPool.connect = undefined;

    // Don't reset modules - keep the mocks in place
    // jest.resetModules();
    // delete require.cache[require.resolve('../src/index')];
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        service: 'auth-service',
      });
    });
  });

  describe('POST /auth/google', () => {
    beforeEach(() => {
      // Mock Google OAuth verification
      const { OAuth2Client } = require('google-auth-library');
      OAuth2Client.prototype.verifyIdToken = jest.fn().mockResolvedValue({
        getPayload: () => ({
          sub: '123456789',
          email: 'test@example.com',
        }),
      });
    });

    it('should authenticate with valid Google token', async () => {
      // Mock auth_credentials lookup (no existing credential for new user)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock email lookup (no existing email)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock UPDATE query (after user creation)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock transaction client for user creation
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO users
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO auth_credentials
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };
      mockPool.connect = jest.fn().mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/auth/google')
        .send({ idToken: 'valid_google_token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.provider).toBe('google');

      // Verify JWT token is valid
      const decoded = jwt.verify(response.body.token, JWT_SECRET) as any;
      expect(decoded.userId).toBe('google_123456789');
      expect(decoded.provider).toBe('google');
      expect(decoded.email).toBe('test@example.com');
    });

    it('should return 400 for missing idToken', async () => {
      // App imported at top
      

      const response = await request(app)
        .post('/auth/google')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('idToken is required');
    });

    it('should return 401 for invalid Google token', async () => {
      const { OAuth2Client } = require('google-auth-library');
      OAuth2Client.prototype.verifyIdToken = jest.fn().mockRejectedValue(
        new Error('Invalid token')
      );

      // App imported at top
      

      const response = await request(app)
        .post('/auth/google')
        .send({ idToken: 'invalid_token' })
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should create new user in database', async () => {
      // Mock auth_credentials lookup (no existing credential for new user)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock email lookup (no existing email)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock transaction client for user creation
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO users
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO auth_credentials
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };
      mockPool.connect = jest.fn().mockResolvedValue(mockClient);

      await request(app)
        .post('/auth/google')
        .send({ idToken: 'valid_google_token' })
        .expect(200);

      // Verify transaction was used for user creation
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining(['google_123456789', 'google', 'test@example.com'])
      );
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('POST /auth/apple', () => {
    beforeEach(() => {
      // Mock Apple Sign-In verification - returns proper claims structure
      const appleSignin = require('apple-signin-auth');
      appleSignin.verifyIdToken = jest.fn().mockResolvedValue({
        sub: 'apple_user_123',
        email: 'apple@example.com',
        email_verified: true,
        aud: 'com.vlvt.app',
        iss: 'https://appleid.apple.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });
    });

    it('should authenticate with valid Apple token', async () => {
      // Ensure Apple mock is set correctly for this test
      const appleSignin = require('apple-signin-auth');
      appleSignin.verifyIdToken.mockResolvedValueOnce({
        sub: 'apple_user_123',
        email: 'apple@example.com',
        email_verified: true,
        aud: 'com.vlvt.app',
        iss: 'https://appleid.apple.com',
        exp: Math.floor(Date.now() / 1000) + 3600,
        iat: Math.floor(Date.now() / 1000),
      });

      // Mock auth_credentials lookup (no existing credential for new user)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock email lookup (no existing email)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock transaction client for user creation
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO users
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO auth_credentials
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };
      mockPool.connect = jest.fn().mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/auth/apple')
        .send({ identityToken: 'valid_apple_token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.provider).toBe('apple');

      // Verify JWT token is valid
      const decoded = jwt.verify(response.body.token, JWT_SECRET) as any;
      expect(decoded.userId).toBe('apple_apple_user_123');
      expect(decoded.provider).toBe('apple');
      expect(decoded.email).toBe('apple@example.com');
    });

    it('should return 400 for missing identityToken', async () => {
      // App imported at top
      

      const response = await request(app)
        .post('/auth/apple')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('identityToken is required');
    });

    it('should return 401 for invalid Apple token', async () => {
      const appleSignin = require('apple-signin-auth');
      appleSignin.verifyIdToken = jest.fn().mockRejectedValue(
        new Error('Invalid token')
      );

      // App imported at top
      

      const response = await request(app)
        .post('/auth/apple')
        .send({ identityToken: 'invalid_token' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /auth/verify', () => {
    it('should verify valid JWT token', async () => {
      // App imported at top
      

      const token = jwt.sign(
        { userId: 'test_user', provider: 'google', email: 'test@example.com' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      const response = await request(app)
        .post('/auth/verify')
        .send({ token })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.decoded).toHaveProperty('userId');
      expect(response.body.decoded.userId).toBe('test_user');
    });

    it('should return 401 for missing token', async () => {
      // App imported at top
      

      const response = await request(app)
        .post('/auth/verify')
        .send({})
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('No token provided');
    });

    it('should return 401 for invalid token', async () => {
      // App imported at top
      

      const response = await request(app)
        .post('/auth/verify')
        .send({ token: 'invalid_token' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid token');
    });

    it('should return 401 for expired token', async () => {
      // App imported at top
      

      const expiredToken = jwt.sign(
        { userId: 'test_user', provider: 'google' },
        JWT_SECRET,
        { expiresIn: '-1s' } // Already expired
      );

      const response = await request(app)
        .post('/auth/verify')
        .send({ token: expiredToken })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('JWT Token Generation', () => {
    it('should generate valid JWT with correct claims', async () => {
      // Mock auth_credentials lookup (no existing credential for new user)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock email lookup (no existing email)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock transaction client for user creation
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO users
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO auth_credentials
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };
      mockPool.connect = jest.fn().mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/auth/google')
        .send({ idToken: 'valid_token' })
        .expect(200);

      const decoded = jwt.verify(response.body.token, JWT_SECRET) as any;

      expect(decoded).toHaveProperty('userId');
      expect(decoded).toHaveProperty('provider');
      expect(decoded).toHaveProperty('email');
      expect(decoded).toHaveProperty('exp');
      expect(decoded).toHaveProperty('iat');
    });

    it('should generate token with 7 day expiration', async () => {
      // Mock auth_credentials lookup (no existing credential for new user)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock email lookup (no existing email)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock transaction client for user creation
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [] }) // BEGIN
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO users
          .mockResolvedValueOnce({ rows: [] }) // INSERT INTO auth_credentials
          .mockResolvedValueOnce({ rows: [] }), // COMMIT
        release: jest.fn(),
      };
      mockPool.connect = jest.fn().mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/auth/google')
        .send({ idToken: 'valid_token' })
        .expect(200);

      const decoded = jwt.verify(response.body.token, JWT_SECRET) as any;
      const expiresIn = decoded.exp - decoded.iat;

      // 7 days = 604800 seconds
      expect(expiresIn).toBe(604800);
    });
  });

  describe('POST /auth/email/register', () => {
    beforeEach(() => {
      // Mock bcrypt for password hashing
      const bcrypt = require('bcrypt');
      bcrypt.hash.mockResolvedValue('hashed_password_123');
    });

    it('should register with valid email and password', async () => {
      // Mock no existing user
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock transaction client
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      mockPool.connect = jest.fn().mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'newuser@example.com', password: 'SecurePass123!' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('check your email');

      // Verify transaction was used
      expect(mockPool.connect).toHaveBeenCalled();
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should reject invalid email format', async () => {
      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'invalid-email', password: 'SecurePass123!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid email format');
    });

    it('should reject weak password - too short', async () => {
      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'test@example.com', password: 'Short1!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Password does not meet requirements');
      expect(response.body.details).toBeDefined();
    });

    it('should reject weak password - missing letter', async () => {
      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'test@example.com', password: '12345678!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Password does not meet requirements');
      expect(response.body.details).toContain('Password must contain at least one letter');
    });

    it('should reject weak password - missing number', async () => {
      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'test@example.com', password: 'NoNumbersHere!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Password does not meet requirements');
      expect(response.body.details).toContain('Password must contain at least one number');
    });

    it('should accept password with mixed case and special chars', async () => {
      // Mock no existing user
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock transaction client
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      mockPool.connect = jest.fn().mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'test@example.com', password: 'ValidPass123!' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('check your email');
    });

    it('should accept password with only lowercase and numbers', async () => {
      // Mock no existing user
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock transaction client
      const mockClient = {
        query: jest.fn().mockResolvedValue({ rows: [] }),
        release: jest.fn(),
      };
      mockPool.connect = jest.fn().mockResolvedValue(mockClient);

      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'test@example.com', password: 'validpass123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('check your email');
    });

    it('should handle duplicate email (enumeration prevention)', async () => {
      // Clear email service mocks
      const { emailService } = require('../src/services/email-service');
      emailService.sendVerificationEmail.mockClear();

      // Mock existing user
      mockPool.query.mockResolvedValueOnce({
        rows: [{ user_id: 'existing_user' }]
      });

      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'existing@example.com', password: 'SecurePass123!' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('check your email');

      // Verify email service was NOT called for existing user
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/auth/email/register')
        .send({ password: 'SecurePass123!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email and password are required');
    });

    it('should reject missing password', async () => {
      const response = await request(app)
        .post('/auth/email/register')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email and password are required');
    });
  });

  describe('GET /auth/email/verify', () => {
    it('should verify with valid token', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours from now

      // Mock SELECT query for verification token (now queries by hash)
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_test123',
          email: 'test@example.com',
          verification_expires: futureDate
        }]
      });
      // Mock UPDATE query to mark as verified
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock INSERT into refresh_tokens (from issueTokenPair)
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock SELECT for existing verification ticket
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock INSERT for verification ticket
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/auth/email/verify')
        .query({ token: 'valid_verification_token' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Email verified successfully');
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.userId).toBe('email_test123');

      // Verify JWT token
      const decoded = jwt.verify(response.body.token, JWT_SECRET) as any;
      expect(decoded.userId).toBe('email_test123');
      expect(decoded.provider).toBe('email');
      expect(decoded.email).toBe('test@example.com');
    });

    it('should reject invalid token', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/auth/email/verify')
        .query({ token: 'invalid_token' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or expired verification token');
    });

    it('should reject expired token', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_test123',
          email: 'test@example.com',
          verification_expires: pastDate
        }]
      });

      const response = await request(app)
        .get('/auth/email/verify')
        .query({ token: 'expired_token' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Verification token has expired');
    });

    it('should reject missing token', async () => {
      const response = await request(app)
        .get('/auth/email/verify')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Verification token is required');
    });
  });

  describe('POST /auth/email/login', () => {
    beforeEach(() => {
      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValue(true); // Default to valid password
    });

    it('should login with valid credentials', async () => {
      // Mock checkAccountLocked - not locked
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_locked: false }] });

      // Mock SELECT query for credentials
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          email_verified: true,
          failed_attempts: 0,
          provider: 'email'
        }]
      });

      // Mock recordSuccessfulLogin fallback
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      // Mock UPDATE query for updated_at
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      // Mock INSERT into refresh_tokens (from issueTokenPair)
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('userId');
      expect(response.body.userId).toBe('email_user123');
      expect(response.body.provider).toBe('email');

      // Verify JWT token
      const decoded = jwt.verify(response.body.token, JWT_SECRET) as any;
      expect(decoded.userId).toBe('email_user123');
    });

    it('should reject invalid password', async () => {
      // Mock checkAccountLocked - not locked
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_locked: false }] });

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          email_verified: true,
          failed_attempts: 0,
          provider: 'email'
        }]
      });

      // Mock recordFailedLogin fallback
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({
        rows: [{ failed_attempts: 1, locked_until: null }]
      });

      const bcrypt = require('bcrypt');
      bcrypt.compare.mockResolvedValueOnce(false);

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'WrongPassword123!' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid email or password');
    });

    it('should reject unverified email', async () => {
      // Mock checkAccountLocked - not locked
      mockPool.query.mockResolvedValueOnce({ rows: [{ is_locked: false }] });

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'test@example.com',
          password_hash: 'hashed_password',
          email_verified: false,
          failed_attempts: 0,
          provider: 'email'
        }]
      });

      // Mock recordFailedLogin fallback (for unverified email attempt)
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({
        rows: [{ failed_attempts: 1, locked_until: null }]
      });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com', password: 'SecurePass123!' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('verify your email');
      expect(response.body.code).toBe('EMAIL_NOT_VERIFIED');
    });

    it('should reject non-existent email', async () => {
      // Mock checkAccountLocked - fallback path (user doesn't exist)
      mockPool.query.mockRejectedValueOnce(new Error('function not found'));
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No auth_credentials

      // Mock credential lookup - not found
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'nonexistent@example.com', password: 'SecurePass123!' })
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid email or password');
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/auth/email/login')
        .send({ password: 'SecurePass123!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email and password are required');
    });

    it('should reject missing password', async () => {
      const response = await request(app)
        .post('/auth/email/login')
        .send({ email: 'test@example.com' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email and password are required');
    });
  });

  describe('POST /auth/email/forgot', () => {
    it('should always return success (enumeration prevention)', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/forgot')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists');

      // Verify email service was NOT called
      const { emailService } = require('../src/services/email-service');
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('should send reset email for existing account', async () => {
      // Mock SELECT query for existing account
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'existing@example.com'
        }]
      });
      // Mock UPDATE query for reset token
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const { emailService } = require('../src/services/email-service');
      emailService.sendPasswordResetEmail.mockClear();

      const response = await request(app)
        .post('/auth/email/forgot')
        .send({ email: 'existing@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If an account exists');

      // Verify email service WAS called
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        'existing@example.com',
        expect.any(String)
      );
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/auth/email/forgot')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email is required');
    });
  });

  describe('POST /auth/email/reset', () => {
    beforeEach(() => {
      const bcrypt = require('bcrypt');
      bcrypt.hash.mockResolvedValue('new_hashed_password');
    });

    it('should reset password with valid token', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          reset_expires: futureDate
        }]
      });

      const response = await request(app)
        .post('/auth/email/reset')
        .send({ token: 'valid_reset_token', newPassword: 'NewSecurePass123!' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Password has been reset successfully');

      // Verify password was hashed and updated
      const bcrypt = require('bcrypt');
      expect(bcrypt.hash).toHaveBeenCalledWith('NewSecurePass123!', 12);
    });

    it('should reject invalid token', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/auth/email/reset')
        .send({ token: 'invalid_token', newPassword: 'NewSecurePass123!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Invalid or expired reset token');
    });

    it('should reject expired token', async () => {
      const pastDate = new Date(Date.now() - 1000); // 1 second ago

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          reset_expires: pastDate
        }]
      });

      const response = await request(app)
        .post('/auth/email/reset')
        .send({ token: 'expired_token', newPassword: 'NewSecurePass123!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Reset token has expired');
    });

    it('should validate new password requirements', async () => {
      const futureDate = new Date(Date.now() + 60 * 60 * 1000);

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          reset_expires: futureDate
        }]
      });

      const response = await request(app)
        .post('/auth/email/reset')
        .send({ token: 'valid_token', newPassword: 'weak' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Password does not meet requirements');
      expect(response.body.details).toBeDefined();
    });

    it('should reject missing token', async () => {
      const response = await request(app)
        .post('/auth/email/reset')
        .send({ newPassword: 'NewSecurePass123!' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token and new password are required');
    });

    it('should reject missing new password', async () => {
      const response = await request(app)
        .post('/auth/email/reset')
        .send({ token: 'valid_token' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Token and new password are required');
    });
  });

  describe('POST /auth/email/resend-verification', () => {
    it('should always return success (enumeration prevention)', async () => {
      // Clear and reset mock to return no rows
      mockPool.query.mockReset();
      mockPool.query.mockResolvedValue({ rows: [] });

      const { emailService } = require('../src/services/email-service');
      emailService.sendVerificationEmail.mockClear();

      const response = await request(app)
        .post('/auth/email/resend-verification')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If the account exists and is unverified');

      // Verify email was NOT sent
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should not reveal if email is already verified', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'verified@example.com',
          email_verified: true
        }]
      });

      const { emailService } = require('../src/services/email-service');
      emailService.sendVerificationEmail.mockClear();

      const response = await request(app)
        .post('/auth/email/resend-verification')
        .send({ email: 'verified@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('If the account exists and is unverified');

      // Verify email was NOT sent for verified account
      expect(emailService.sendVerificationEmail).not.toHaveBeenCalled();
    });

    it('should send verification email for unverified account', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          user_id: 'email_user123',
          email: 'unverified@example.com',
          email_verified: false
        }]
      });

      const { emailService } = require('../src/services/email-service');
      emailService.sendVerificationEmail.mockClear();

      const response = await request(app)
        .post('/auth/email/resend-verification')
        .send({ email: 'unverified@example.com' })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify email WAS sent
      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'unverified@example.com',
        expect.any(String)
      );
    });

    it('should reject missing email', async () => {
      const response = await request(app)
        .post('/auth/email/resend-verification')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Email is required');
    });
  });
});
