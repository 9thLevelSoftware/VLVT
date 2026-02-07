/**
 * Shared Rate Limiting Middleware
 * Centralizes rate limiting configuration for all VLVT microservices
 *
 * Security: Implements per-user rate limiting to prevent authenticated attackers
 * from bypassing IP-based rate limits using multiple IPs or VPNs.
 */

import { Request, Response } from 'express';
import rateLimit, { RateLimitRequestHandler, Options } from 'express-rate-limit';

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
 */
export const createRateLimiter = (options: RateLimiterOptions = {}): RateLimitRequestHandler => {
  const {
    windowMs = 15 * 60 * 1000, // 15 minutes default
    max = 100, // 100 requests per window default
    message = 'Too many requests, please try again later.',
    skip,
    keyGenerator,
    keyPrefix,
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

  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    keyGenerator: finalKeyGenerator,
    handler: handler ? (req, res) => handler(req, res) : undefined,
    // Disable validation for custom keyGenerator since we intentionally handle IP fallback
    validate: finalKeyGenerator ? { xForwardedForHeader: false, default: false } : undefined,
  });
};

/**
 * Create a rate limiter that uses per-user tracking when authenticated.
 */
export const createUserRateLimiter = (options: RateLimiterOptions = {}): RateLimitRequestHandler => {
  const {
    windowMs = 15 * 60 * 1000,
    max = 100,
    message = 'Too many requests, please try again later.',
    skip,
    keyPrefix = 'user-rl',
    handler,
  } = options;

  return rateLimit({
    windowMs,
    max,
    message: { success: false, error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip,
    keyGenerator: createUserKeyGenerator(keyPrefix),
    handler: handler ? (req, res) => handler(req, res) : undefined,
    // Disable validation for custom keyGenerator since we intentionally handle IP fallback
    // Our implementation prefers userId for authenticated users, which is more secure
    validate: { xForwardedForHeader: false, default: false },
  });
};

/**
 * Placeholder for Redis initialization (no-op in local shared folder)
 */
export async function initializeRateLimiting(): Promise<void> {
  // No-op - Redis is initialized at the service level
}

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
 * Auth rate limiter - 5 attempts per 15 minutes
 */
export const authLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'Too many authentication attempts, please try again after 15 minutes',
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
