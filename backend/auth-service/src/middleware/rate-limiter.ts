import { Request } from 'express';
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import * as Sentry from '@sentry/node';
import logger from '../utils/logger';

// Performance optimization: Implement Redis-based rate limiting for production
let rateLimitStore: any;

// Initialize Redis client for rate limiting
if (process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
  try {
    const redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000) // Exponential backoff
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis rate limiting client error', { error: err });
    });

    redisClient.on('connect', () => {
      logger.info('Redis rate limiting client connected');
    });

    // Use Redis store for production
    rateLimitStore = new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args),
      prefix: 'rl:'
    });

    logger.info('Using Redis store for rate limiting (production)');
  } catch (err) {
    logger.error('Failed to initialize Redis rate limiting', { error: err });
    logger.warn('Falling back to memory store for rate limiting');
    rateLimitStore = undefined;
  }
} else {
  logger.info('Using memory store for rate limiting (development/single-instance)');
  rateLimitStore = undefined;
}

/**
 * Generates a rate limit key based on user authentication status.
 * - Authenticated requests: Uses user:{userId} to track per-user limits
 * - Unauthenticated requests: Falls back to ip:{ip} for IP-based limits
 *
 * Security: This prevents authenticated attackers from bypassing rate limits
 * by using multiple IPs or VPNs.
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

// General API rate limiter (100 requests per 15 minutes per IP)
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: rateLimitStore, // Use Redis store if available
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limiter: 'general'
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later'
    });
  }
});

/**
 * Authentication rate limiter with brute force detection alerting (MON-03)
 * 10 requests per 15 minutes per IP - sends alerts to Sentry when triggered.
 *
 * When rate limit is exceeded:
 * 1. Logs the event with warning level (IP, path, userAgent)
 * 2. Sends alert to Sentry tagged as potential brute force attempt
 * 3. Returns standard 429 response
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore, // Use Redis store if available
  handler: (req, res) => {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const userAgent = req.headers['user-agent'] || 'unknown';

    // Log rate limit hit for investigation
    logger.warn('Auth rate limit exceeded - potential brute force attempt', {
      ip,
      path: req.path,
      method: req.method,
      userAgent,
      limiter: 'auth'
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

    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later'
    });
  }
});

// Token verification rate limiter (100 requests per 15 minutes per IP)
export const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many verification requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore, // Use Redis store if available
  handler: (req, res) => {
    logger.warn('Verify rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limiter: 'verify'
    });
    res.status(429).json({
      success: false,
      error: 'Too many verification requests, please try again later'
    });
  }
});

// Strict rate limiter for sensitive operations (5 requests per 15 minutes per IP)
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many requests for this sensitive operation, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore, // Use Redis store if available
  handler: (req, res) => {
    logger.warn('Strict rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limiter: 'strict'
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests for this sensitive operation, please try again later'
    });
  }
});

/**
 * Per-user rate limiter - 100 requests per 15 minutes per user
 * Uses user ID when authenticated, falls back to IP for unauthenticated requests.
 * Security: This prevents authenticated attackers from bypassing rate limits via VPN/multiple IPs.
 */
export const userRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore,
  keyGenerator: createUserKeyGenerator('user-general'),
  handler: (req, res) => {
    logger.warn('User rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.userId,
      path: req.path,
      limiter: 'user'
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests, please try again after 15 minutes'
    });
  }
});

/**
 * Sensitive action rate limiter - 5 requests per hour
 * For high-risk operations like password changes, email updates, account deletion.
 * Uses per-user tracking to prevent abuse.
 */
export const sensitiveActionLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  message: 'Too many sensitive action attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore,
  keyGenerator: createUserKeyGenerator('user-sensitive'),
  handler: (req, res) => {
    logger.warn('Sensitive action rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.userId,
      path: req.path,
      limiter: 'sensitive'
    });
    res.status(429).json({
      success: false,
      error: 'Too many sensitive action attempts, please try again later'
    });
  }
});
