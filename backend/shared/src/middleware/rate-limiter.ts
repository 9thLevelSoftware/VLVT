/**
 * Shared Rate Limiting Middleware
 * Centralizes rate limiting configuration for all VLVT microservices
 *
 * Security: Implements per-user rate limiting to prevent authenticated attackers
 * from bypassing IP-based rate limits using multiple IPs or VPNs.
 *
 * Redis Support: When REDIS_URL is set and NODE_ENV=production, uses Redis for
 * distributed rate limiting across multiple service instances. Falls back to
 * in-memory store if Redis is unavailable.
 *
 * Monitoring (MON-03): Auth rate limiter includes Sentry alerting for brute force detection.
 */

import { Request, Response } from 'express';
import rateLimit, { RateLimitRequestHandler, Options, Store } from 'express-rate-limit';
import * as Sentry from '@sentry/node';

/**
 * Simple logger for rate limiter events (services can override with Winston)
 * Outputs structured JSON for log aggregation systems.
 */
const rateLimitLogger = {
  info: (message: string, meta?: Record<string, unknown>) => {
    console.info(JSON.stringify({ level: 'info', message, ...meta, timestamp: new Date().toISOString() }));
  },
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: 'warn', message, ...meta, timestamp: new Date().toISOString() }));
  },
  error: (message: string, meta?: Record<string, unknown>) => {
    console.error(JSON.stringify({ level: 'error', message, ...meta, timestamp: new Date().toISOString() }));
  },
};

/**
 * Redis client for rate limiting (shared connection).
 * Each limiter creates its own RedisStore with a unique prefix.
 */
let redisClient: any = null;
let redisClientPromise: Promise<any> | null = null;
let redisInitialized = false;

/**
 * Initialize Redis client for distributed rate limiting.
 * Only initializes once, returns cached client on subsequent calls.
 * Gracefully falls back to memory store if Redis is unavailable.
 */
async function initializeRedisClient(): Promise<any> {
  // Return cached result if already initialized
  if (redisInitialized) {
    return redisClient;
  }

  // Only use Redis in production with REDIS_URL set
  if (process.env.NODE_ENV !== 'production' || !process.env.REDIS_URL) {
    rateLimitLogger.info('Using memory store for rate limiting', {
      reason: !process.env.REDIS_URL ? 'REDIS_URL not set' : 'not in production',
    });
    redisInitialized = true;
    redisClient = null;
    return null;
  }

  try {
    // Dynamically import Redis dependencies to avoid requiring them in dev
    const { createClient } = await import('redis');

    const client = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 100, 5000),
      },
    });

    client.on('error', (err: Error) => {
      rateLimitLogger.error('Redis rate limiting client error', { error: err.message });
    });

    client.on('connect', () => {
      rateLimitLogger.info('Redis rate limiting client connected');
    });

    // Connect to Redis
    await client.connect();

    rateLimitLogger.info('Redis client ready for rate limiting (production)');
    redisInitialized = true;
    redisClient = client;
    return client;
  } catch (err) {
    rateLimitLogger.error('Failed to initialize Redis for rate limiting', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    rateLimitLogger.warn('Falling back to memory store for rate limiting');
    redisInitialized = true;
    redisClient = null;
    return null;
  }
}

/**
 * Get or initialize Redis client.
 * Uses a promise to ensure only one initialization happens.
 */
export function getRedisClient(): Promise<any> {
  if (!redisClientPromise) {
    redisClientPromise = initializeRedisClient();
  }
  return redisClientPromise;
}

/**
 * Get the current Redis client synchronously (after initialization).
 * Returns null if not initialized or if using memory store.
 */
export function getRedisClientSync(): any {
  return redisClient;
}

/**
 * Create a new Redis store with a unique prefix.
 * Each rate limiter MUST have its own store instance.
 * Returns undefined if Redis is not available.
 */
export async function createRedisStore(prefix: string): Promise<Store | undefined> {
  const client = await getRedisClient();
  if (!client) return undefined;

  const { default: RedisStore } = await import('rate-limit-redis');
  return new RedisStore({
    sendCommand: (...args: string[]) => client.sendCommand(args),
    prefix: `vlvt:rl:${prefix}:`,
  });
}

/**
 * Create a new Redis store synchronously (after client initialization).
 * Each rate limiter MUST have its own store instance.
 * Returns undefined if Redis is not available.
 */
export function createRedisStoreSync(prefix: string): Store | undefined {
  const client = getRedisClientSync();
  if (!client) return undefined;

  // Dynamic import not available synchronously, so we need to use require
  // This is only called in production where redis is installed
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const RedisStore = require('rate-limit-redis').default;
    return new RedisStore({
      sendCommand: (...args: string[]) => client.sendCommand(args),
      prefix: `vlvt:rl:${prefix}:`,
    });
  } catch {
    return undefined;
  }
}

// Backwards compatibility - deprecated, use createRedisStoreSync instead
export function getRedisStore(): Promise<Store | undefined> {
  return createRedisStore('legacy');
}

// Backwards compatibility - deprecated
export function getRedisStoreSync(): Store | undefined {
  return createRedisStoreSync('legacy');
}

export interface RateLimiterOptions {
  /** Window duration in milliseconds */
  windowMs?: number;
  /** Max requests per window */
  max?: number;
  /** Error message when limit exceeded */
  message?: string;
  /** Skip rate limiting for certain requests */
  skip?: Options['skip'];
  /** Custom key generator */
  keyGenerator?: Options['keyGenerator'];
  /** Prefix for rate limit keys (helps distinguish different limiters) */
  keyPrefix?: string;
  /** Custom store (for Redis). If not provided, uses in-memory store */
  store?: Store;
  /** Enable per-user rate limiting (uses userId when authenticated, IP when not) */
  perUser?: boolean;
  /** Custom handler for rate limit exceeded events */
  handler?: (req: Request, res: Response) => void;
}

/**
 * Generates a rate limit key based on user authentication status.
 * - Authenticated requests: Uses user:{userId} to track per-user limits
 * - Unauthenticated requests: Falls back to ip:{ip} for IP-based limits
 *
 * This prevents authenticated attackers from bypassing rate limits by
 * using multiple IPs or VPNs.
 *
 * @param prefix - Optional prefix to namespace different rate limiters
 */
export const createUserKeyGenerator = (prefix: string = 'rl') => {
  return (req: Request): string => {
    // Check if user is authenticated (req.user is set by auth middleware)
    if (req.user?.userId) {
      return `${prefix}:user:${req.user.userId}`;
    }
    // Fall back to IP-based limiting for unauthenticated requests
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    return `${prefix}:ip:${ip}`;
  };
};

/**
 * Default key generator using user ID when authenticated, IP otherwise
 */
export const userKeyGenerator = createUserKeyGenerator();

/**
 * Create a rate limiter with custom options.
 * Automatically uses Redis store if available (production with REDIS_URL).
 */
export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimitRequestHandler => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests per window default
    message = 'Too many requests, please try again later.',
    skip,
    keyGenerator,
    keyPrefix,
    store,
    perUser = false,
    handler,
  } = options;

  // Use provided keyGenerator, or create one with prefix, or use per-user generator
  let finalKeyGenerator = keyGenerator;
  if (!finalKeyGenerator && keyPrefix) {
    finalKeyGenerator = createUserKeyGenerator(keyPrefix);
  } else if (!finalKeyGenerator && perUser) {
    finalKeyGenerator = createUserKeyGenerator('rl');
  }

  // Use provided store or create a new Redis store with unique prefix
  // Each limiter MUST have its own store instance
  const storePrefix = keyPrefix || `limiter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const finalStore = store ?? createRedisStoreSync(storePrefix);

  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    keyGenerator: finalKeyGenerator,
    store: finalStore,
    handler: handler ? (req, res) => handler(req, res) : undefined,
    // Disable validation for custom keyGenerator since we intentionally handle IP fallback
    validate: finalKeyGenerator ? { xForwardedForHeader: false, default: false } : undefined,
  });
};

/**
 * Create a rate limiter that uses per-user tracking when authenticated.
 * Uses Redis store when available for distributed rate limiting.
 */
export const createUserRateLimiter = (options: RateLimiterOptions = {}): RateLimitRequestHandler => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later.',
    skip,
    keyPrefix = 'user-rl',
    store,
    handler,
  } = options;

  // Each limiter MUST have its own store instance with unique prefix
  const finalStore = store ?? createRedisStoreSync(keyPrefix);

  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    keyGenerator: createUserKeyGenerator(keyPrefix),
    store: finalStore,
    handler: handler ? (req, res) => handler(req, res) : undefined,
    // Disable validation for custom keyGenerator since we intentionally handle IP fallback
    validate: { xForwardedForHeader: false, default: false },
  });
};

/**
 * General API rate limiter - 100 requests per 15 minutes
 */
export const generalLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes',
  keyPrefix: 'general',
});

/**
 * Strict rate limiter for sensitive operations - 10 requests per 15 minutes
 */
export const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts, please try again later',
  keyPrefix: 'strict',
});

/**
 * Auth rate limiter with brute force detection alerting (MON-03)
 * 5 attempts per 15 minutes - sends alerts to Sentry when triggered.
 *
 * When rate limit is exceeded:
 * 1. Logs the event with warning level (IP, path, userAgent)
 * 2. Sends alert to Sentry tagged as potential brute force attempt
 * 3. Returns standard 429 response
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: { success: false, error: 'Too many authentication attempts, please try again after 15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
  store: createRedisStoreSync('auth'),
  handler: (req: Request, res: Response, next, options) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Log rate limit hit for investigation
    rateLimitLogger.warn('Auth rate limit exceeded - potential brute force attempt', {
      ip,
      path: req.path,
      method: req.method,
      userAgent,
    });

    // Send to Sentry for alerting (MON-03)
    // Only capture if Sentry is initialized (SENTRY_DSN is set)
    if (process.env.SENTRY_DSN) {
      Sentry.captureMessage('Auth rate limit exceeded - potential brute force', {
        level: 'warning',
        tags: {
          type: 'brute_force_attempt',
          path: req.path,
        },
        extra: {
          ip,
          userAgent,
          method: req.method,
        },
      });
    }

    // Send standard rate limit response
    res.status(options.statusCode).json(options.message);
  },
});

/**
 * Profile creation rate limiter - 3 profiles per hour
 */
export const profileCreationLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: 'Too many profile creation attempts, please try again later',
  keyPrefix: 'profile-creation',
});

/**
 * Discovery rate limiter - 60 requests per minute
 */
export const discoveryLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many discovery requests, please slow down',
  keyPrefix: 'discovery',
});

/**
 * Message rate limiter - 30 messages per minute
 */
export const messageLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many messages, please slow down',
  keyPrefix: 'message',
});

/**
 * Upload rate limiter - 10 uploads per hour
 */
export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many uploads, please try again later',
  keyPrefix: 'upload',
});

/**
 * Per-user rate limiter - 100 requests per 15 minutes per user
 * Uses user ID when authenticated, falls back to IP for unauthenticated requests.
 * This prevents authenticated attackers from bypassing rate limits via VPN/multiple IPs.
 */
export const userRateLimiter = createUserRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again after 15 minutes',
  keyPrefix: 'user-general',
});

/**
 * Sensitive action rate limiter - 5 requests per hour
 * For high-risk operations like password changes, email updates, account deletion.
 * Uses per-user tracking to prevent abuse.
 */
export const sensitiveActionLimiter = createUserRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many sensitive action attempts, please try again later',
  keyPrefix: 'user-sensitive',
});

/**
 * Profile update rate limiter - 20 updates per 15 minutes per user
 * Prevents profile spam/manipulation while allowing reasonable edits.
 * Uses per-user tracking.
 */
export const profileUpdateLimiter = createUserRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: 'Too many profile updates, please try again later',
  keyPrefix: 'user-profile-update',
});

/**
 * Report submission rate limiter - 5 reports per day per user
 * Stricter limits to prevent report abuse.
 * Uses per-user tracking.
 */
export const reportLimiter = createUserRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5,
  message: 'Too many reports submitted, please try again tomorrow',
  keyPrefix: 'user-report',
});

/**
 * Password reset rate limiter - 3 attempts per hour per user/IP
 * Extra strict to prevent account enumeration attacks.
 * Uses per-user tracking when authenticated, IP otherwise.
 */
export const passwordResetLimiter = createUserRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  message: 'Too many password reset attempts, please try again later',
  keyPrefix: 'user-password-reset',
});

/**
 * Login rate limiter - 10 attempts per 15 minutes per IP
 * Protects login endpoint from brute force attacks.
 * Uses IP-based tracking since user isn't authenticated yet.
 */
export const loginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many login attempts, please try again later',
  keyPrefix: 'login',
  perUser: false, // IP-based for login since no auth yet
});

/**
 * Initialize Redis store for rate limiting.
 * Call this during service startup to ensure Redis is ready before
 * accepting requests. If Redis is unavailable, falls back to memory store.
 *
 * @returns Promise that resolves when Redis is initialized (or fallback to memory)
 */
export async function initializeRateLimiting(): Promise<void> {
  await getRedisStore();
}
