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
 * Redis store singleton for distributed rate limiting.
 * Initialized lazily when first rate limiter is created in production.
 */
let redisStorePromise: Promise<Store | undefined> | null = null;
let redisStoreResolved: Store | undefined = undefined;
let redisInitialized = false;

/**
 * Initialize Redis store for distributed rate limiting.
 * Only initializes once, returns cached result on subsequent calls.
 * Gracefully falls back to memory store if Redis is unavailable.
 */
async function initializeRedisStore(): Promise<Store | undefined> {
  // Return cached result if already initialized
  if (redisInitialized) {
    return redisStoreResolved;
  }

  // Only use Redis in production with REDIS_URL set
  if (process.env.NODE_ENV !== 'production' || !process.env.REDIS_URL) {
    rateLimitLogger.info('Using memory store for rate limiting', {
      reason: !process.env.REDIS_URL ? 'REDIS_URL not set' : 'not in production',
    });
    redisInitialized = true;
    redisStoreResolved = undefined;
    return undefined;
  }

  try {
    // Dynamically import Redis dependencies to avoid requiring them in dev
    const [{ default: RedisStore }, { createClient }] = await Promise.all([
      import('rate-limit-redis'),
      import('redis'),
    ]);

    const redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries: number) => Math.min(retries * 100, 5000),
      },
    });

    redisClient.on('error', (err: Error) => {
      rateLimitLogger.error('Redis rate limiting client error', { error: err.message });
    });

    redisClient.on('connect', () => {
      rateLimitLogger.info('Redis rate limiting client connected');
    });

    // Connect to Redis
    await redisClient.connect();

    // Create Redis store
    const store = new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args),
      prefix: 'vlvt:rl:',
    });

    rateLimitLogger.info('Using Redis store for rate limiting (production)');
    redisInitialized = true;
    redisStoreResolved = store;
    return store;
  } catch (err) {
    rateLimitLogger.error('Failed to initialize Redis rate limiting', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
    rateLimitLogger.warn('Falling back to memory store for rate limiting');
    redisInitialized = true;
    redisStoreResolved = undefined;
    return undefined;
  }
}

/**
 * Get or initialize Redis store.
 * Uses a promise to ensure only one initialization happens.
 */
export function getRedisStore(): Promise<Store | undefined> {
  if (!redisStorePromise) {
    redisStorePromise = initializeRedisStore();
  }
  return redisStorePromise;
}

/**
 * Get the current Redis store synchronously (after initialization).
 * Returns undefined if not initialized or if using memory store.
 */
export function getRedisStoreSync(): Store | undefined {
  return redisStoreResolved;
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

  // Use provided store or the Redis store if available
  const finalStore = store ?? getRedisStoreSync();

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

  const finalStore = store ?? getRedisStoreSync();

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
});

/**
 * Strict rate limiter for sensitive operations - 10 requests per 15 minutes
 */
export const strictLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many attempts, please try again later',
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
});

/**
 * Discovery rate limiter - 60 requests per minute
 */
export const discoveryLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many discovery requests, please slow down',
});

/**
 * Message rate limiter - 30 messages per minute
 */
export const messageLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 30,
  message: 'Too many messages, please slow down',
});

/**
 * Upload rate limiter - 10 uploads per hour
 */
export const uploadLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: 'Too many uploads, please try again later',
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
