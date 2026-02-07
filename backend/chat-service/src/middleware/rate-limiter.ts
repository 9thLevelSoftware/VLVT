/**
 * Chat Service Rate Limiter
 * Re-exports shared rate limiters + service-specific limiters
 *
 * Security: Uses per-user rate limiting for authenticated endpoints to prevent
 * authenticated attackers from bypassing IP-based limits via VPN/multiple IPs.
 */

import { createRateLimiter, createUserRateLimiter } from '../shared';

// Re-export shared limiters
export {
  createRateLimiter,
  createUserRateLimiter,
  generalLimiter,
  strictLimiter,
  authLimiter,
  messageLimiter,
  userRateLimiter,
  sensitiveActionLimiter,
  reportLimiter as sharedReportLimiter,
  initializeRateLimiting,
  type RateLimiterOptions,
} from '../shared';

// Chat-service specific limiters
export const verifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many verification requests, please try again later',
});

/**
 * Match creation rate limiter - 15 matches per 15 minutes per user
 * Uses per-user tracking for authenticated users.
 */
export const matchLimiter = createUserRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many match attempts, please try again later',
  keyPrefix: 'user-match',
});

/**
 * Report submission rate limiter - 5 reports per day per user
 * Uses per-user tracking to prevent report abuse.
 * (Re-exports from shared with stricter limits for chat-service)
 */
export const reportLimiter = createUserRateLimiter({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5,
  message: 'Too many reports submitted, please try again tomorrow',
  keyPrefix: 'user-report',
});

/**
 * Message sending rate limiter - 30 messages per minute per user
 * Uses per-user tracking to prevent message spam.
 */
export const userMessageLimiter = createUserRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30,
  message: 'Too many messages, please slow down',
  keyPrefix: 'user-message',
});

/**
 * Block action rate limiter - 10 blocks per hour per user
 * Prevents block abuse while allowing legitimate use.
 */
export const blockLimiter = createUserRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many block actions, please try again later',
  keyPrefix: 'user-block',
});
