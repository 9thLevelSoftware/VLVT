/**
 * @vlvt/shared - Shared utilities and middleware for VLVT microservices
 *
 * This package centralizes common functionality to eliminate code duplication
 * and ensure consistent behavior across all backend services.
 */

// Types
export * from './types/express';
export * from './types/api';

// Middleware
export {
  authMiddleware,
  authenticateJWT,
  createAuthMiddleware,
  type AuthMiddlewareOptions,
  type JWTPayload,
} from './middleware/auth';

export {
  createRateLimiter,
  createUserRateLimiter,
  createUserKeyGenerator,
  userKeyGenerator,
  generalLimiter,
  strictLimiter,
  authLimiter,
  profileCreationLimiter,
  discoveryLimiter,
  messageLimiter,
  uploadLimiter,
  userRateLimiter,
  sensitiveActionLimiter,
  type RateLimiterOptions,
} from './middleware/rate-limiter';

export {
  errorHandler,
  createErrorHandler,
  notFoundHandler,
  asyncHandler,
  ApiError,
  type ErrorHandlerOptions,
} from './middleware/error-handler';

export {
  generateCsrfToken,
  createCsrfMiddleware,
  createCsrfTokenHandler,
  csrfMiddleware,
  csrfTokenHandler,
  type CsrfMiddlewareOptions,
} from './middleware/csrf';

// Utilities
export {
  createLogger,
  defaultLogger,
  type LoggerOptions,
} from './utils/logger';

export {
  validateEnv,
  validators,
  serviceEnvConfigs,
  type EnvConfig,
  type ValidationResult,
} from './utils/env-validator';

export {
  sendSuccess,
  sendSuccessMessage,
  sendError,
  sendPaginated,
  errors,
} from './utils/response';

export {
  AuditLogger,
  createAuditLogger,
  AuditAction,
  AuditResourceType,
  type AuditLogEntry,
  type AuditLogRecord,
  type AuditLogQueryOptions,
  type AuditLoggerOptions,
} from './utils/audit-logger';

// Services
export {
  initializeFirebase,
  isFirebaseReady,
  setFCMLogger,
  sendPushNotification,
  sendMessageNotification,
  sendMatchNotification,
  sendTypingNotification,
  registerFCMToken,
  unregisterFCMToken,
  deactivateAllUserTokens,
} from './services/fcm-service';
