import request from 'supertest';
import app from '../src/index';
import { Pool } from 'pg';
import { validatePassword } from '../src/utils/password';
import { validateAndSanitizeString, validateEmail, validateUserId } from '../src/utils/input-validation';
import { AppError } from '../src/middleware/error-handler';

// Mock the database pool
jest.mock('pg', () => {
  const mockPool = {
    query: jest.fn(),
    connect: jest.fn(),
    on: jest.fn(),
    end: jest.fn()
  };
  return { Pool: jest.fn(() => mockPool) };
});

describe('Security Features Tests', () => {
  let server: any;

  beforeAll(() => {
    server = app;
  });

  afterAll((done) => {
    done();
  });

  describe('Input Validation Security', () => {
    describe('SQL Injection Protection', () => {
      it('should detect and reject SQL injection attempts', () => {
        const maliciousInputs = [
          "user' OR '1'='1",
          "admin'; DROP TABLE users; --",
          "password' UNION SELECT * FROM users --",
          "1' OR 1=1 --",
          "exec xp_cmdshell('dir')",
          "1; SELECT * FROM information_schema.tables"
        ];

        maliciousInputs.forEach(input => {
          expect(() => validateAndSanitizeString(input, 'test')).toThrow();
        });
      });

      it('should sanitize potentially dangerous characters', () => {
        const input = "test--input";
        const result = validateAndSanitizeString(input, 'test');
        expect(result).toBe('testinput');
      });

      it('should allow safe input', () => {
        const safeInput = 'HelloWorld123';
        const result = validateAndSanitizeString(safeInput, 'test');
        expect(result).toBe(safeInput);
      });
    });

    describe('XSS Protection', () => {
      it('should detect and reject XSS attempts', () => {
        const maliciousInputs = [
          '<script>alert("XSS")</script>',
          '<img src="x" onerror="alert(\'XSS\')">',
          'javascript:alert(1)',
          '<div style="background: url(javascript:alert(1))">',
          'onload=alert(1)'
        ];

        maliciousInputs.forEach(input => {
          expect(() => validateAndSanitizeString(input, 'test')).toThrow();
        });
      });
    });

    describe('Email Validation', () => {
      it('should validate proper email format', () => {
        const validEmails = [
          'user@example.com',
          'first.last@sub.domain.co.uk',
          'user+tag@example.org'
        ];

        validEmails.forEach(email => {
          const result = validateEmail(email);
          expect(result).toBe(email.toLowerCase());
        });
      });

      it('should reject invalid email formats', () => {
        const invalidEmails = [
          'plainaddress',
          '@missingusername.com',
          'user@.com',
          'user@localhost',
          'user@127.0.0.1'
        ];

        invalidEmails.forEach(email => {
          expect(() => validateEmail(email)).toThrow();
        });
      });
    });

    describe('User ID Validation', () => {
      it('should validate proper user ID formats', () => {
        const validUserIds = [
          'google_123456789',
          'apple_abc123def456',
          'email_user123456789',
          'instagram_987654321'
        ];

        validUserIds.forEach(userId => {
          const result = validateUserId(userId);
          expect(result).toBe(userId);
        });
      });

      it('should reject invalid user ID formats', () => {
        const invalidUserIds = [
          'invalid_user',
          '123456789',
          'user@example.com',
          'google',
          'apple_'
        ];

        invalidUserIds.forEach(userId => {
          expect(() => validateUserId(userId)).toThrow();
        });
      });
    });
  });

  describe('Enhanced Password Security', () => {
    it('should require minimum length of 12 characters', () => {
      const shortPassword = 'Short1!';
      const result = validatePassword(shortPassword);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be at least 12 characters');
    });

    it('should require maximum length of 64 characters', () => {
      const longPassword = 'a'.repeat(65) + '1A!';
      const result = validatePassword(longPassword);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must be less than 64 characters');
    });

    it('should require uppercase letters', () => {
      const noUppercase = 'lowercase123!';
      const result = validatePassword(noUppercase);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
    });

    it('should require lowercase letters', () => {
      const noLowercase = 'UPPERCASE123!';
      const result = validatePassword(noLowercase);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one lowercase letter');
    });

    it('should require numbers', () => {
      const noNumbers = 'NoNumbersHere!';
      const result = validatePassword(noNumbers);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one number');
    });

    it('should require special characters', () => {
      const noSpecial = 'NoSpecialChars123';
      const result = validatePassword(noSpecial);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Password must contain at least one special character');
    });

    it('should reject common passwords', () => {
      const commonPasswords = [
        'password',
        '123456',
        'qwerty',
        'letmein',
        'welcome'
      ];

      commonPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password is too common and easily guessable');
      });
    });

    it('should reject email-like passwords', () => {
      const emailLikePasswords = [
        'user@example.com',
        'test@domain.org',
        'admin@localhost'
      ];

      emailLikePasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password cannot contain email-like patterns');
      });
    });

    it('should reject passwords with repeated characters', () => {
      const repeatedCharPasswords = [
        'aaaa12345678!',
        '1111AAAAaaaa!',
        'abc123!!!!!!'
      ];

      repeatedCharPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password cannot contain repeated characters');
      });
    });

    it('should reject passwords with keyboard sequences', () => {
      const keyboardPasswords = [
        'qwerty123456!',
        'asdfgh123456!',
        'zxcvbn123456!'
      ];

      keyboardPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors).toContain('Password cannot contain common keyboard sequences');
      });
    });

    it('should accept strong passwords', () => {
      const strongPasswords = [
        'SecurePassword123!',
        'Another$trongP@ss2024',
        'ComplexP@ssw0rd!2024'
      ];

      strongPasswords.forEach(password => {
        const result = validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors.length).toBe(0);
      });
    });
  });

  describe('Error Handling Tests', () => {
    it('should create AppError with proper properties', () => {
      const error = new AppError('Test error', 400, 'TEST_ERROR', true, { detail: 'test' });

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.errorCode).toBe('TEST_ERROR');
      expect(error.isOperational).toBe(true);
      expect(error.details).toEqual({ detail: 'test' });
    });

    it('should handle AppError instances in global error handler', async () => {
      const response = await request(server)
        .get('/nonexistent-route')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Resource not found');
      expect(response.body.code).toBe('NOT_FOUND');
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Rate Limiting Tests', () => {
    it('should limit authentication attempts', async () => {
      // This test would need to be run in sequence to avoid being rate limited
      const responses = await Promise.all(
        Array(15).fill(0).map(() =>
          request(server)
            .post('/auth/google')
            .send({ idToken: 'invalid_token' })
            .catch(e => e)
        )
      );

      // Check if any requests were rate limited
      const rateLimitedResponses = responses.filter(
        (res: any) => res.status === 429 || (res.response && res.response.status === 429)
      );

      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Security Headers Tests', () => {
    it('should include security headers in responses', async () => {
      const response = await request(server)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBeDefined();
      expect(response.headers['x-xss-protection']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();
    });
  });
});

describe('Integration Tests', () => {
  describe('Authentication Flow', () => {
    it('should reject SQL injection in login attempts', async () => {
      const response = await request(server)
        .post('/auth/email/login')
        .send({
          email: "admin' OR '1'='1",
          password: 'anything'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid input data');
    });

    it('should reject XSS attempts in registration', async () => {
      const response = await request(server)
        .post('/auth/email/register')
        .send({
          email: 'user@example.com',
          password: '<script>alert("XSS")</script>'
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Invalid input data');
    });
  });
});