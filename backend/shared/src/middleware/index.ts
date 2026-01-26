/**
 * Middleware Index
 * Re-exports all middleware for clean imports
 *
 * @example
 * ```typescript
 * import { createAfterHoursAuthMiddleware, createAuthMiddleware } from '@vlvt/shared/middleware';
 * ```
 */

// Authentication
export { createAuthMiddleware, authMiddleware, authenticateJWT } from './auth';
export type { AuthMiddlewareOptions, JWTPayload } from './auth';

// After Hours authorization (premium + verified + consent)
export { createAfterHoursAuthMiddleware } from './after-hours-auth';
export type { AfterHoursAuthOptions } from './after-hours-auth';

// Error handling
export { errorHandler, createErrorHandler, ApiError, notFoundHandler, asyncHandler } from './error-handler';
export type { ErrorHandlerOptions } from './error-handler';

// Rate limiting
export {
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
  createUserKeyGenerator,
  userKeyGenerator
} from './rate-limiter';
export type { RateLimiterOptions } from './rate-limiter';

// CSRF protection
export { createCsrfMiddleware, csrfMiddleware, generateCsrfToken, createCsrfTokenHandler, csrfTokenHandler } from './csrf';

// API versioning
export { createVersionMiddleware, extractVersion, isVersionSupported, API_VERSIONS, CURRENT_API_VERSION } from './api-version';
export type { VersionMiddlewareOptions, ApiVersion } from './api-version';

// Socket rate limiting
export { createSocketRateLimiter, createSocketRateLimiterMiddleware, socketRateLimiter, DEFAULT_RATE_LIMITS } from './socket-rate-limiter';
export type { SocketRateLimiterConfig, EventRateLimitConfig, SocketRateLimiter } from './socket-rate-limiter';

// Request signing
export { createSignatureMiddleware, verifySignature, signRequest, signatureMiddleware, signatureMutationMiddleware, computeHash, computeSignature, getSigningSecret } from './request-signing';
export type { SignatureMiddlewareOptions, SignatureVerificationResult } from './request-signing';

// Correlation ID (MON-05)
export { correlationMiddleware } from './correlation-id';
