/**
 * Rate Limiter Tests for Shared Package
 *
 * Tests for per-user rate limiting functionality, verifying that:
 * - Rate limiting tracks by user ID when authenticated
 * - Different users have separate rate limits
 * - Unauthenticated requests fall back to IP-based limiting
 * - All rate limiters are properly exported
 */

import { Request } from 'express';
import {
  createUserKeyGenerator,
  userKeyGenerator,
  createRateLimiter,
  createUserRateLimiter,
  generalLimiter,
  strictLimiter,
  authLimiter,
  profileCreationLimiter,
  discoveryLimiter,
  messageLimiter,
  uploadLimiter,
  userRateLimiter,
  sensitiveActionLimiter,
  profileUpdateLimiter,
  reportLimiter,
  passwordResetLimiter,
  loginLimiter,
  initializeRateLimiting,
  getRedisStore,
  getRedisStoreSync,
} from '../src/middleware/rate-limiter';

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
  });
});

describe('Rate Limiter Factory Functions', () => {
  describe('createRateLimiter', () => {
    it('should create a rate limiter function', () => {
      const limiter = createRateLimiter({ max: 10, windowMs: 1000 });
      expect(typeof limiter).toBe('function');
    });

    it('should create a rate limiter with custom options', () => {
      const limiter = createRateLimiter({
        max: 5,
        windowMs: 60000,
        message: 'Custom message',
      });
      expect(typeof limiter).toBe('function');
    });

    it('should support per-user option', () => {
      const limiter = createRateLimiter({
        max: 10,
        perUser: true,
      });
      expect(typeof limiter).toBe('function');
    });
  });

  describe('createUserRateLimiter', () => {
    it('should create a user-based rate limiter function', () => {
      const limiter = createUserRateLimiter({ max: 10, windowMs: 1000 });
      expect(typeof limiter).toBe('function');
    });

    it('should create a user-based rate limiter with custom prefix', () => {
      const limiter = createUserRateLimiter({
        max: 5,
        keyPrefix: 'custom-prefix',
      });
      expect(typeof limiter).toBe('function');
    });
  });
});

describe('Pre-built Rate Limiters', () => {
  it('should export generalLimiter', () => {
    expect(generalLimiter).toBeDefined();
    expect(typeof generalLimiter).toBe('function');
  });

  it('should export strictLimiter', () => {
    expect(strictLimiter).toBeDefined();
    expect(typeof strictLimiter).toBe('function');
  });

  it('should export authLimiter', () => {
    expect(authLimiter).toBeDefined();
    expect(typeof authLimiter).toBe('function');
  });

  it('should export profileCreationLimiter', () => {
    expect(profileCreationLimiter).toBeDefined();
    expect(typeof profileCreationLimiter).toBe('function');
  });

  it('should export discoveryLimiter', () => {
    expect(discoveryLimiter).toBeDefined();
    expect(typeof discoveryLimiter).toBe('function');
  });

  it('should export messageLimiter', () => {
    expect(messageLimiter).toBeDefined();
    expect(typeof messageLimiter).toBe('function');
  });

  it('should export uploadLimiter', () => {
    expect(uploadLimiter).toBeDefined();
    expect(typeof uploadLimiter).toBe('function');
  });

  it('should export userRateLimiter', () => {
    expect(userRateLimiter).toBeDefined();
    expect(typeof userRateLimiter).toBe('function');
  });

  it('should export sensitiveActionLimiter', () => {
    expect(sensitiveActionLimiter).toBeDefined();
    expect(typeof sensitiveActionLimiter).toBe('function');
  });

  it('should export profileUpdateLimiter', () => {
    expect(profileUpdateLimiter).toBeDefined();
    expect(typeof profileUpdateLimiter).toBe('function');
  });

  it('should export reportLimiter', () => {
    expect(reportLimiter).toBeDefined();
    expect(typeof reportLimiter).toBe('function');
  });

  it('should export passwordResetLimiter', () => {
    expect(passwordResetLimiter).toBeDefined();
    expect(typeof passwordResetLimiter).toBe('function');
  });

  it('should export loginLimiter', () => {
    expect(loginLimiter).toBeDefined();
    expect(typeof loginLimiter).toBe('function');
  });
});

describe('Redis Store Functions', () => {
  it('should export initializeRateLimiting', () => {
    expect(initializeRateLimiting).toBeDefined();
    expect(typeof initializeRateLimiting).toBe('function');
  });

  it('should export getRedisStore', () => {
    expect(getRedisStore).toBeDefined();
    expect(typeof getRedisStore).toBe('function');
  });

  it('should export getRedisStoreSync', () => {
    expect(getRedisStoreSync).toBeDefined();
    expect(typeof getRedisStoreSync).toBe('function');
  });

  it('should return undefined from getRedisStoreSync in test environment', () => {
    // In test environment without REDIS_URL, should return undefined
    const store = getRedisStoreSync();
    expect(store).toBeUndefined();
  });

  it('should return promise from getRedisStore', async () => {
    const storePromise = getRedisStore();
    expect(storePromise).toBeInstanceOf(Promise);
    const store = await storePromise;
    // In test environment without REDIS_URL, should resolve to undefined
    expect(store).toBeUndefined();
  });

  it('should initialize rate limiting without error', async () => {
    await expect(initializeRateLimiting()).resolves.not.toThrow();
  });
});

describe('Rate Limiter Security Properties', () => {
  it('should track authenticated users regardless of IP (VPN bypass prevention)', () => {
    const generator = createUserKeyGenerator('security-test');

    // Same user from multiple IPs (simulating VPN usage)
    const ips = ['192.168.1.1', '10.0.0.1', '172.16.0.1', '::1'];
    const keys = ips.map(ip => {
      const mockRequest = {
        user: { userId: 'attacker_user', provider: 'google', email: 'attacker@example.com' },
        ip,
      } as unknown as Request;
      return generator(mockRequest);
    });

    // All keys should be the same (tracking by user, not IP)
    const uniqueKeys = [...new Set(keys)];
    expect(uniqueKeys).toHaveLength(1);
    expect(uniqueKeys[0]).toBe('security-test:user:attacker_user');
  });

  it('should separate rate limits between different users', () => {
    const generator = createUserKeyGenerator('isolation-test');

    // Multiple users from same IP
    const users = ['user1', 'user2', 'user3'];
    const keys = users.map(userId => {
      const mockRequest = {
        user: { userId, provider: 'google', email: `${userId}@example.com` },
        ip: '192.168.1.1', // Same IP for all
      } as unknown as Request;
      return generator(mockRequest);
    });

    // All keys should be different
    const uniqueKeys = [...new Set(keys)];
    expect(uniqueKeys).toHaveLength(3);
  });

  it('should fall back to IP-based limiting for unauthenticated requests', () => {
    const generator = createUserKeyGenerator('fallback-test');

    const mockRequest = {
      user: undefined,
      ip: '192.168.1.100',
    } as unknown as Request;

    const key = generator(mockRequest);
    expect(key).toBe('fallback-test:ip:192.168.1.100');
  });
});
