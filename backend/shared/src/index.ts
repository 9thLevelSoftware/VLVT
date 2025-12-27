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

export {
  computeHash,
  computeSignature,
  verifySignature,
  createSignatureMiddleware,
  signRequest,
  getSigningSecret,
  signatureMiddleware,
  signatureMutationMiddleware,
  type SignatureMiddlewareOptions,
  type SignatureVerificationResult,
} from './middleware/request-signing';

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

// API Versioning
export {
  API_VERSIONS,
  CURRENT_API_VERSION,
  DEFAULT_API_VERSION,
  DEPRECATED_VERSIONS,
  MINIMUM_SUPPORTED_VERSION,
  extractVersion,
  isVersionSupported,
  createVersionMiddleware,
  createVersionedRouter,
  getVersionedPath,
  mountVersionedRoutes,
  addVersionToHealth,
  addVersionHeaders,
  type ApiVersion,
  type VersionMiddlewareOptions,
  type VersionExtractionResult,
  type VersionedRouterOptions,
} from './middleware/api-version';

// Socket.IO Rate Limiting
export {
  createSocketRateLimiter,
  createSocketRateLimiterMiddleware,
  socketRateLimiter,
  DEFAULT_RATE_LIMITS,
  type SocketRateLimiter,
  type SocketRateLimiterConfig,
  type EventRateLimitConfig,
  type RateLimitCheckResult,
  type SocketWithRateLimit,
  type RateLimitableSocket,
} from './middleware/socket-rate-limiter';

// Enhanced Error Codes
export {
  // Error code definitions
  ErrorCodes,
  AuthErrorCodes,
  ProfileErrorCodes,
  ChatErrorCodes,
  RateErrorCodes,
  ValidationErrorCodes,
  SystemErrorCodes,
  ErrorCategory,
  // Utility functions
  getErrorByCode,
  getErrorCategory,
  isAlertableError,
  // Error response utilities
  sendErrorResponse,
  createErrorResponseSender,
  generateCorrelationId,
  CodedError,
  createCodedError,
  isCodedError,
  extractErrorDetails,
  // Types
  type ErrorCodeDefinition,
  type ErrorCategoryType,
  type ErrorLogger,
  type SendErrorOptions,
  type ErrorResponse,
  type ErrorMiddlewareOptions,
  type MinimalResponse,
} from './errors';
