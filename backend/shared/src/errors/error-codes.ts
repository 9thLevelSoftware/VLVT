/**
 * Enhanced Error Code System for VLVT Microservices
 *
 * This module provides a standardized error code system that prevents information
 * leakage by using generic public messages while maintaining detailed internal
 * messages for logging and debugging.
 *
 * Security considerations:
 * - Public messages are intentionally vague to prevent account enumeration attacks
 * - Internal messages contain details for debugging (logged, never sent to clients)
 * - Correlation IDs link client responses to server logs for support
 */

/**
 * Error code definition with separate public and internal messages
 */
export interface ErrorCodeDefinition {
  /** The error code identifier (e.g., AUTH_001) */
  code: string;
  /** HTTP status code to return */
  httpStatus: number;
  /** Generic message safe to send to clients */
  publicMessage: string;
  /** Detailed message for internal logging (never sent to clients) */
  internalMessage: string;
  /** Whether this error should trigger alerting/monitoring */
  isAlertable?: boolean;
}

/**
 * Error code category prefixes
 */
export const ErrorCategory = {
  AUTH: 'AUTH',
  PROFILE: 'PROFILE',
  CHAT: 'CHAT',
  RATE: 'RATE',
  VAL: 'VAL',
  SYS: 'SYS',
} as const;

export type ErrorCategoryType = typeof ErrorCategory[keyof typeof ErrorCategory];

/**
 * Authentication error codes (AUTH_xxx)
 *
 * These errors are designed to prevent account enumeration and credential
 * guessing attacks by using generic public messages.
 */
export const AuthErrorCodes = {
  /**
   * Generic authentication failure - used for invalid credentials
   * Intentionally does not distinguish between invalid email vs invalid password
   */
  AUTH_INVALID_CREDENTIALS: {
    code: 'AUTH_001',
    httpStatus: 401,
    publicMessage: 'Authentication failed',
    internalMessage: 'Invalid credentials provided',
  },

  /**
   * Token is missing from request
   */
  AUTH_TOKEN_MISSING: {
    code: 'AUTH_002',
    httpStatus: 401,
    publicMessage: 'Authentication required',
    internalMessage: 'No authentication token provided in request',
  },

  /**
   * Token is invalid or malformed
   */
  AUTH_TOKEN_INVALID: {
    code: 'AUTH_003',
    httpStatus: 401,
    publicMessage: 'Authentication failed',
    internalMessage: 'Invalid or malformed authentication token',
  },

  /**
   * Token has expired
   */
  AUTH_TOKEN_EXPIRED: {
    code: 'AUTH_004',
    httpStatus: 401,
    publicMessage: 'Session expired',
    internalMessage: 'Authentication token has expired',
  },

  /**
   * Refresh token is invalid or revoked
   */
  AUTH_REFRESH_INVALID: {
    code: 'AUTH_005',
    httpStatus: 401,
    publicMessage: 'Session expired',
    internalMessage: 'Refresh token is invalid or has been revoked',
  },

  /**
   * Account is locked due to failed attempts
   */
  AUTH_ACCOUNT_LOCKED: {
    code: 'AUTH_006',
    httpStatus: 423,
    publicMessage: 'Account temporarily locked',
    internalMessage: 'Account locked due to excessive failed login attempts',
    isAlertable: true,
  },

  /**
   * Email not verified
   */
  AUTH_EMAIL_NOT_VERIFIED: {
    code: 'AUTH_007',
    httpStatus: 403,
    publicMessage: 'Account verification required',
    internalMessage: 'Email address has not been verified',
  },

  /**
   * OAuth/SSO provider error
   */
  AUTH_PROVIDER_ERROR: {
    code: 'AUTH_008',
    httpStatus: 401,
    publicMessage: 'Authentication failed',
    internalMessage: 'OAuth/SSO provider authentication failed',
  },

  /**
   * Insufficient permissions
   */
  AUTH_FORBIDDEN: {
    code: 'AUTH_009',
    httpStatus: 403,
    publicMessage: 'Access denied',
    internalMessage: 'User does not have permission for this action',
  },

  /**
   * CSRF token validation failed
   */
  AUTH_CSRF_INVALID: {
    code: 'AUTH_010',
    httpStatus: 403,
    publicMessage: 'Request validation failed',
    internalMessage: 'CSRF token validation failed',
    isAlertable: true,
  },

  /**
   * Registration failed (generic)
   */
  AUTH_REGISTRATION_FAILED: {
    code: 'AUTH_011',
    httpStatus: 400,
    publicMessage: 'Registration failed',
    internalMessage: 'User registration failed',
  },

  /**
   * Password reset token invalid or expired
   */
  AUTH_RESET_TOKEN_INVALID: {
    code: 'AUTH_012',
    httpStatus: 400,
    publicMessage: 'Invalid or expired link',
    internalMessage: 'Password reset token is invalid or expired',
  },

  /**
   * Verification token invalid or expired
   */
  AUTH_VERIFICATION_FAILED: {
    code: 'AUTH_013',
    httpStatus: 400,
    publicMessage: 'Verification failed',
    internalMessage: 'Email verification token is invalid or expired',
  },

  /**
   * Invite code invalid or already used
   */
  AUTH_INVITE_INVALID: {
    code: 'AUTH_014',
    httpStatus: 400,
    publicMessage: 'Invalid invite code',
    internalMessage: 'Invite code is invalid, expired, or already used',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/**
 * Profile error codes (PROFILE_xxx)
 */
export const ProfileErrorCodes = {
  /**
   * Profile not found - uses generic message to prevent enumeration
   */
  PROFILE_NOT_FOUND: {
    code: 'PROFILE_001',
    httpStatus: 404,
    publicMessage: 'Resource not found',
    internalMessage: 'User profile not found',
  },

  /**
   * Profile creation failed
   */
  PROFILE_CREATE_FAILED: {
    code: 'PROFILE_002',
    httpStatus: 400,
    publicMessage: 'Operation failed',
    internalMessage: 'Failed to create user profile',
  },

  /**
   * Profile update failed
   */
  PROFILE_UPDATE_FAILED: {
    code: 'PROFILE_003',
    httpStatus: 400,
    publicMessage: 'Operation failed',
    internalMessage: 'Failed to update user profile',
  },

  /**
   * Photo upload failed
   */
  PROFILE_PHOTO_FAILED: {
    code: 'PROFILE_004',
    httpStatus: 400,
    publicMessage: 'Upload failed',
    internalMessage: 'Failed to process photo upload',
  },

  /**
   * Discovery preferences invalid
   */
  PROFILE_DISCOVERY_INVALID: {
    code: 'PROFILE_005',
    httpStatus: 400,
    publicMessage: 'Invalid preferences',
    internalMessage: 'Discovery preferences are invalid',
  },

  /**
   * Profile already exists
   */
  PROFILE_ALREADY_EXISTS: {
    code: 'PROFILE_006',
    httpStatus: 409,
    publicMessage: 'Operation failed',
    internalMessage: 'Profile already exists for this user',
  },

  /**
   * Photo limit exceeded
   */
  PROFILE_PHOTO_LIMIT: {
    code: 'PROFILE_007',
    httpStatus: 400,
    publicMessage: 'Limit exceeded',
    internalMessage: 'Maximum number of photos exceeded',
  },

  /**
   * Age verification required
   */
  PROFILE_AGE_VERIFICATION: {
    code: 'PROFILE_008',
    httpStatus: 403,
    publicMessage: 'Verification required',
    internalMessage: 'Age verification is required',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/**
 * Chat/messaging error codes (CHAT_xxx)
 */
export const ChatErrorCodes = {
  /**
   * Match not found
   */
  CHAT_MATCH_NOT_FOUND: {
    code: 'CHAT_001',
    httpStatus: 404,
    publicMessage: 'Resource not found',
    internalMessage: 'Match not found or user not authorized',
  },

  /**
   * Message send failed
   */
  CHAT_SEND_FAILED: {
    code: 'CHAT_002',
    httpStatus: 400,
    publicMessage: 'Message could not be sent',
    internalMessage: 'Failed to send message',
  },

  /**
   * User blocked - don't reveal blocking
   */
  CHAT_USER_BLOCKED: {
    code: 'CHAT_003',
    httpStatus: 403,
    publicMessage: 'Action not allowed',
    internalMessage: 'User has been blocked or has blocked the sender',
  },

  /**
   * Match unmatched
   */
  CHAT_UNMATCHED: {
    code: 'CHAT_004',
    httpStatus: 403,
    publicMessage: 'Action not allowed',
    internalMessage: 'Match has been unmatched',
  },

  /**
   * Message not found
   */
  CHAT_MESSAGE_NOT_FOUND: {
    code: 'CHAT_005',
    httpStatus: 404,
    publicMessage: 'Resource not found',
    internalMessage: 'Message not found',
  },

  /**
   * Already matched
   */
  CHAT_ALREADY_MATCHED: {
    code: 'CHAT_006',
    httpStatus: 409,
    publicMessage: 'Action already completed',
    internalMessage: 'Users are already matched',
  },

  /**
   * Socket connection error
   */
  CHAT_CONNECTION_ERROR: {
    code: 'CHAT_007',
    httpStatus: 500,
    publicMessage: 'Connection error',
    internalMessage: 'WebSocket connection failed',
    isAlertable: true,
  },

  /**
   * Report submission failed
   */
  CHAT_REPORT_FAILED: {
    code: 'CHAT_008',
    httpStatus: 400,
    publicMessage: 'Submission failed',
    internalMessage: 'Failed to submit report',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/**
 * Rate limiting error codes (RATE_xxx)
 */
export const RateErrorCodes = {
  /**
   * General rate limit exceeded
   */
  RATE_LIMIT_EXCEEDED: {
    code: 'RATE_001',
    httpStatus: 429,
    publicMessage: 'Too many requests',
    internalMessage: 'Rate limit exceeded',
  },

  /**
   * Authentication rate limit
   */
  RATE_AUTH_EXCEEDED: {
    code: 'RATE_002',
    httpStatus: 429,
    publicMessage: 'Too many attempts',
    internalMessage: 'Authentication rate limit exceeded',
    isAlertable: true,
  },

  /**
   * API rate limit
   */
  RATE_API_EXCEEDED: {
    code: 'RATE_003',
    httpStatus: 429,
    publicMessage: 'Please slow down',
    internalMessage: 'API rate limit exceeded',
  },

  /**
   * Socket event rate limit
   */
  RATE_SOCKET_EXCEEDED: {
    code: 'RATE_004',
    httpStatus: 429,
    publicMessage: 'Too many requests',
    internalMessage: 'Socket event rate limit exceeded',
  },

  /**
   * Upload rate limit
   */
  RATE_UPLOAD_EXCEEDED: {
    code: 'RATE_005',
    httpStatus: 429,
    publicMessage: 'Upload limit reached',
    internalMessage: 'Upload rate limit exceeded',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/**
 * Validation error codes (VAL_xxx)
 */
export const ValidationErrorCodes = {
  /**
   * Generic validation failure
   */
  VAL_INVALID_INPUT: {
    code: 'VAL_001',
    httpStatus: 400,
    publicMessage: 'Invalid input',
    internalMessage: 'Request validation failed',
  },

  /**
   * Missing required fields
   */
  VAL_MISSING_FIELDS: {
    code: 'VAL_002',
    httpStatus: 400,
    publicMessage: 'Missing required fields',
    internalMessage: 'One or more required fields are missing',
  },

  /**
   * Invalid email format
   */
  VAL_INVALID_EMAIL: {
    code: 'VAL_003',
    httpStatus: 400,
    publicMessage: 'Invalid email format',
    internalMessage: 'Email address format is invalid',
  },

  /**
   * Password does not meet requirements
   */
  VAL_WEAK_PASSWORD: {
    code: 'VAL_004',
    httpStatus: 400,
    publicMessage: 'Password does not meet requirements',
    internalMessage: 'Password failed complexity requirements',
  },

  /**
   * Invalid date/age
   */
  VAL_INVALID_DATE: {
    code: 'VAL_005',
    httpStatus: 400,
    publicMessage: 'Invalid date',
    internalMessage: 'Date value is invalid or out of range',
  },

  /**
   * File too large
   */
  VAL_FILE_TOO_LARGE: {
    code: 'VAL_006',
    httpStatus: 400,
    publicMessage: 'File too large',
    internalMessage: 'Uploaded file exceeds size limit',
  },

  /**
   * Invalid file type
   */
  VAL_INVALID_FILE_TYPE: {
    code: 'VAL_007',
    httpStatus: 400,
    publicMessage: 'Invalid file type',
    internalMessage: 'File type is not allowed',
  },

  /**
   * Content policy violation
   */
  VAL_CONTENT_POLICY: {
    code: 'VAL_008',
    httpStatus: 400,
    publicMessage: 'Content not allowed',
    internalMessage: 'Content violates community guidelines',
    isAlertable: true,
  },

  /**
   * Invalid location/coordinates
   */
  VAL_INVALID_LOCATION: {
    code: 'VAL_009',
    httpStatus: 400,
    publicMessage: 'Invalid location',
    internalMessage: 'Location coordinates are invalid',
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/**
 * System error codes (SYS_xxx)
 */
export const SystemErrorCodes = {
  /**
   * Internal server error
   */
  SYS_INTERNAL_ERROR: {
    code: 'SYS_001',
    httpStatus: 500,
    publicMessage: 'An unexpected error occurred',
    internalMessage: 'Internal server error',
    isAlertable: true,
  },

  /**
   * Database error
   */
  SYS_DATABASE_ERROR: {
    code: 'SYS_002',
    httpStatus: 500,
    publicMessage: 'An unexpected error occurred',
    internalMessage: 'Database operation failed',
    isAlertable: true,
  },

  /**
   * External service error
   */
  SYS_EXTERNAL_SERVICE: {
    code: 'SYS_003',
    httpStatus: 502,
    publicMessage: 'Service temporarily unavailable',
    internalMessage: 'External service call failed',
    isAlertable: true,
  },

  /**
   * Service unavailable
   */
  SYS_SERVICE_UNAVAILABLE: {
    code: 'SYS_004',
    httpStatus: 503,
    publicMessage: 'Service temporarily unavailable',
    internalMessage: 'Service is currently unavailable',
    isAlertable: true,
  },

  /**
   * Configuration error
   */
  SYS_CONFIG_ERROR: {
    code: 'SYS_005',
    httpStatus: 500,
    publicMessage: 'An unexpected error occurred',
    internalMessage: 'Service configuration error',
    isAlertable: true,
  },

  /**
   * Resource not found (generic route not found)
   */
  SYS_NOT_FOUND: {
    code: 'SYS_006',
    httpStatus: 404,
    publicMessage: 'Resource not found',
    internalMessage: 'Requested resource or route not found',
  },

  /**
   * Timeout
   */
  SYS_TIMEOUT: {
    code: 'SYS_007',
    httpStatus: 504,
    publicMessage: 'Request timed out',
    internalMessage: 'Operation timed out',
    isAlertable: true,
  },
} as const satisfies Record<string, ErrorCodeDefinition>;

/**
 * Combined error codes object for convenient access
 */
export const ErrorCodes = {
  ...AuthErrorCodes,
  ...ProfileErrorCodes,
  ...ChatErrorCodes,
  ...RateErrorCodes,
  ...ValidationErrorCodes,
  ...SystemErrorCodes,
} as const;

/**
 * Type for all error code keys
 */
export type ErrorCodeKey = keyof typeof ErrorCodes;

/**
 * Get error code definition by code string (e.g., 'AUTH_001')
 */
export function getErrorByCode(code: string): ErrorCodeDefinition | undefined {
  return Object.values(ErrorCodes).find((def) => def.code === code);
}

/**
 * Check if an error code is alertable
 */
export function isAlertableError(errorDef: ErrorCodeDefinition): boolean {
  return errorDef.isAlertable === true;
}

/**
 * Get category from error code
 */
export function getErrorCategory(code: string): ErrorCategoryType | undefined {
  const prefix = code.split('_')[0];
  if (prefix in ErrorCategory) {
    return prefix as ErrorCategoryType;
  }
  return undefined;
}
