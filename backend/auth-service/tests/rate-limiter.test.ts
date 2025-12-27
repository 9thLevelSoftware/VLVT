/**
 * Rate Limiter Tests
 *
 * Tests for per-user rate limiting functionality, verifying that:
 * - Rate limiting tracks by user ID when authenticated
 * - Different users have separate rate limits
 * - Unauthenticated requests fall back to IP-based limiting
 */

import { Request } from 'express';
import { createUserKeyGenerator, userKeyGenerator } from '../src/middleware/rate-limiter';

describe('Rate Limiter Key Generation', () => {
  describe('createUserKeyGenerator', () => {
    it('should return a function', () => {
      const generator = createUserKeyGenerator();
      expect(typeof generator).toBe('function');
    });

    it('should use user ID when user is authenticated', () => {
      const generator = createUserKeyGenerator('test');
      const mockRequest = {
        user: {
          userId: 'user_123',
          provider: 'google',
          email: 'test@example.com'
        },
        ip: '192.168.1.1',
        socket: { remoteAddress: '192.168.1.1' }
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('test:user:user_123');
    });

    it('should fall back to IP when user is not authenticated', () => {
      const generator = createUserKeyGenerator('test');
      const mockRequest = {
        user: undefined,
        ip: '192.168.1.100',
        socket: { remoteAddress: '192.168.1.100' }
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('test:ip:192.168.1.100');
    });

    it('should use socket.remoteAddress when req.ip is undefined', () => {
      const generator = createUserKeyGenerator('test');
      const mockRequest = {
        user: undefined,
        ip: undefined,
        socket: { remoteAddress: '10.0.0.1' }
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('test:ip:10.0.0.1');
    });

    it('should use "unknown" when no IP information is available', () => {
      const generator = createUserKeyGenerator('test');
      const mockRequest = {
        user: undefined,
        ip: undefined,
        socket: { remoteAddress: undefined }
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('test:ip:unknown');
    });

    it('should use default prefix "rl" when no prefix is provided', () => {
      const generator = createUserKeyGenerator();
      const mockRequest = {
        user: {
          userId: 'user_456',
          provider: 'apple',
          email: 'test2@example.com'
        },
        ip: '192.168.1.1'
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('rl:user:user_456');
    });

    it('should use custom prefix when provided', () => {
      const generator = createUserKeyGenerator('custom-prefix');
      const mockRequest = {
        user: {
          userId: 'user_789',
          provider: 'google',
          email: 'test3@example.com'
        },
        ip: '192.168.1.1'
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('custom-prefix:user:user_789');
    });
  });

  describe('userKeyGenerator (default export)', () => {
    it('should be a function', () => {
      expect(typeof userKeyGenerator).toBe('function');
    });

    it('should use default "rl" prefix for authenticated users', () => {
      const mockRequest = {
        user: {
          userId: 'default_user',
          provider: 'google',
          email: 'default@example.com'
        },
        ip: '192.168.1.1'
      } as unknown as Request;

      const key = userKeyGenerator(mockRequest);
      expect(key).toBe('rl:user:default_user');
    });

    it('should use default "rl" prefix for IP-based limiting', () => {
      const mockRequest = {
        user: undefined,
        ip: '10.10.10.10'
      } as unknown as Request;

      const key = userKeyGenerator(mockRequest);
      expect(key).toBe('rl:ip:10.10.10.10');
    });
  });

  describe('Per-user rate limiting behavior', () => {
    it('should generate different keys for different authenticated users', () => {
      const generator = createUserKeyGenerator('api');

      const user1Request = {
        user: { userId: 'user_A', provider: 'google', email: 'a@example.com' },
        ip: '192.168.1.1'
      } as unknown as Request;

      const user2Request = {
        user: { userId: 'user_B', provider: 'google', email: 'b@example.com' },
        ip: '192.168.1.1' // Same IP, different user
      } as unknown as Request;

      const key1 = generator(user1Request);
      const key2 = generator(user2Request);

      expect(key1).toBe('api:user:user_A');
      expect(key2).toBe('api:user:user_B');
      expect(key1).not.toBe(key2);
    });

    it('should generate same key for same user from different IPs', () => {
      const generator = createUserKeyGenerator('api');

      const request1 = {
        user: { userId: 'same_user', provider: 'google', email: 'same@example.com' },
        ip: '192.168.1.1'
      } as unknown as Request;

      const request2 = {
        user: { userId: 'same_user', provider: 'google', email: 'same@example.com' },
        ip: '10.0.0.1' // Different IP, same user
      } as unknown as Request;

      const key1 = generator(request1);
      const key2 = generator(request2);

      expect(key1).toBe('api:user:same_user');
      expect(key2).toBe('api:user:same_user');
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different IPs when unauthenticated', () => {
      const generator = createUserKeyGenerator('api');

      const request1 = {
        user: undefined,
        ip: '192.168.1.1'
      } as unknown as Request;

      const request2 = {
        user: undefined,
        ip: '10.0.0.1'
      } as unknown as Request;

      const key1 = generator(request1);
      const key2 = generator(request2);

      expect(key1).toBe('api:ip:192.168.1.1');
      expect(key2).toBe('api:ip:10.0.0.1');
      expect(key1).not.toBe(key2);
    });

    it('should handle user object with null userId', () => {
      const generator = createUserKeyGenerator('api');

      const mockRequest = {
        user: { userId: null, provider: 'google', email: 'test@example.com' },
        ip: '192.168.1.1'
      } as unknown as Request;

      const key = generator(mockRequest);
      // When userId is null/falsy, should fall back to IP
      expect(key).toBe('api:ip:192.168.1.1');
    });

    it('should handle user object with empty userId', () => {
      const generator = createUserKeyGenerator('api');

      const mockRequest = {
        user: { userId: '', provider: 'google', email: 'test@example.com' },
        ip: '192.168.1.1'
      } as unknown as Request;

      const key = generator(mockRequest);
      // When userId is empty string (falsy), should fall back to IP
      expect(key).toBe('api:ip:192.168.1.1');
    });
  });

  describe('Edge cases', () => {
    it('should handle IPv6 addresses', () => {
      const generator = createUserKeyGenerator('api');

      const mockRequest = {
        user: undefined,
        ip: '::1'
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('api:ip:::1');
    });

    it('should handle IPv6 mapped IPv4 addresses', () => {
      const generator = createUserKeyGenerator('api');

      const mockRequest = {
        user: undefined,
        ip: '::ffff:192.168.1.1'
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('api:ip:::ffff:192.168.1.1');
    });

    it('should handle special characters in user IDs', () => {
      const generator = createUserKeyGenerator('api');

      const mockRequest = {
        user: {
          userId: 'user+test@domain.com',
          provider: 'google',
          email: 'test@example.com'
        },
        ip: '192.168.1.1'
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('api:user:user+test@domain.com');
    });

    it('should handle null socket', () => {
      const generator = createUserKeyGenerator('api');

      const mockRequest = {
        user: undefined,
        ip: undefined,
        socket: null
      } as unknown as Request;

      const key = generator(mockRequest);
      expect(key).toBe('api:ip:unknown');
    });
  });
});

describe('Rate Limiter Exports', () => {
  let rateLimiterModule: typeof import('../src/middleware/rate-limiter');

  beforeEach(() => {
    jest.resetModules();
    rateLimiterModule = require('../src/middleware/rate-limiter');
  });

  it('should export generalLimiter', () => {
    expect(rateLimiterModule.generalLimiter).toBeDefined();
    expect(typeof rateLimiterModule.generalLimiter).toBe('function');
  });

  it('should export authLimiter', () => {
    expect(rateLimiterModule.authLimiter).toBeDefined();
    expect(typeof rateLimiterModule.authLimiter).toBe('function');
  });

  it('should export verifyLimiter', () => {
    expect(rateLimiterModule.verifyLimiter).toBeDefined();
    expect(typeof rateLimiterModule.verifyLimiter).toBe('function');
  });

  it('should export strictLimiter', () => {
    expect(rateLimiterModule.strictLimiter).toBeDefined();
    expect(typeof rateLimiterModule.strictLimiter).toBe('function');
  });

  it('should export userRateLimiter', () => {
    expect(rateLimiterModule.userRateLimiter).toBeDefined();
    expect(typeof rateLimiterModule.userRateLimiter).toBe('function');
  });

  it('should export sensitiveActionLimiter', () => {
    expect(rateLimiterModule.sensitiveActionLimiter).toBeDefined();
    expect(typeof rateLimiterModule.sensitiveActionLimiter).toBe('function');
  });

  it('should export createUserKeyGenerator', () => {
    expect(rateLimiterModule.createUserKeyGenerator).toBeDefined();
    expect(typeof rateLimiterModule.createUserKeyGenerator).toBe('function');
  });

  it('should export userKeyGenerator', () => {
    expect(rateLimiterModule.userKeyGenerator).toBeDefined();
    expect(typeof rateLimiterModule.userKeyGenerator).toBe('function');
  });
});
