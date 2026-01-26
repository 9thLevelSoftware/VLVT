/**
 * Shared Rate Limiting Middleware
 * Centralizes rate limiting configuration for all VLVT microservices
 *
 * Security: Implements per-user rate limiting to prevent authenticated attackers
 * from bypassing IP-based rate limits using multiple IPs or VPNs.
 *
 * Monitoring (MON-03): Auth rate limiter includes Sentry alerting for brute force detection.
 */

import { Request, Response } from 'express';
import rateLimit, { RateLimitRequestHandler, Options } from 'express-rate-limit';
import * as Sentry from '@sentry/node';

/**
 * Simple logger for rate limiter events (services can override with Winston)
 * Outputs structured JSON for log aggregation systems.
 */
const rateLimitLogger = {
  warn: (message: string, meta?: Record<string, unknown>) => {
    console.warn(JSON.stringify({ level: 'warn', message, ...meta, timestamp: new Date().toISOString() }));
  },
};

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
 * Create a rate limiter with custom options
 */
export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimitRequestHandler => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests per window default
    message = 'Too many requests, please try again later.',
    skip,
    keyGenerator,
    keyPrefix,
  } = options;

  // Use provided keyGenerator or create one with prefix if specified
  const finalKeyGenerator = keyGenerator ||
    (keyPrefix ? createUserKeyGenerator(keyPrefix) : undefined);

  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    keyGenerator: finalKeyGenerator,
  });
};

/**
 * Create a rate limiter that uses per-user tracking when authenticated
 */
export const createUserRateLimiter = (options: RateLimiterOptions = {}): RateLimitRequestHandler => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later.',
    skip,
    keyPrefix = 'user-rl',
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    keyGenerator: createUserKeyGenerator(keyPrefix),
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
