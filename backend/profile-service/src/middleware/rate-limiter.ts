/**
 * Profile Service Rate Limiter
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
  profileCreationLimiter,
  discoveryLimiter,
  uploadLimiter,
  userRateLimiter,
  sensitiveActionLimiter,
  profileUpdateLimiter,
  initializeRateLimiting,
  type RateLimiterOptions,
} from '../shared';

// Profile-service specific limiters
export const verifyLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many verification requests, please try again later',
});

/**
 * Photo upload rate limiter - 10 uploads per hour per user
 * Uses per-user tracking for authenticated users.
 */
export const photoUploadLimiter = createUserRateLimiter({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  message: 'Too many photo uploads, please try again later',
  keyPrefix: 'user-photo-upload',
});

/**
 * Swipe rate limiter - 100 swipes per 15 minutes per user
 * Prevents automated swiping while allowing normal usage.
 */
export const swipeLimiter = createUserRateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many swipe actions, please slow down',
  keyPrefix: 'user-swipe',
});
