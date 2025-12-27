/**
 * Error Response Utilities for VLVT Microservices
 *
 * This module provides functions to send standardized error responses that:
 * - Return only the error code and generic message to clients
 * - Log detailed error information internally
 * - Include correlation IDs for support/debugging
 */

import { randomBytes } from 'crypto';
import { ErrorCodeDefinition, isAlertableError } from './error-codes';

/**
 * Minimal Response interface that's compatible with any Express version
 * This avoids type conflicts between different versions of @types/express
 */
export interface MinimalResponse {
  status(code: number): this;
  json(body: unknown): this;
  setHeader(name: string, value: string | number | readonly string[]): this;
}

/**
 * Logger interface for error logging
 * Compatible with Winston, console, and other loggers
 */
export interface ErrorLogger {
  error: (message: string, meta?: Record<string, unknown>) => void;
  warn: (message: string, meta?: Record<string, unknown>) => void;
  info?: (message: string, meta?: Record<string, unknown>) => void;
}

/**
 * Options for sending error responses
 */
export interface SendErrorOptions {
  /** Logger instance (defaults to console) */
  logger?: ErrorLogger;
  /** Additional context to include in logs (not sent to client) */
  logContext?: Record<string, unknown>;
  /** User ID for log correlation */
  userId?: string;
  /** Request path for logging */
  path?: string;
  /** HTTP method for logging */
  method?: string;
  /** Include error details in response (development only) */
  includeDetails?: boolean;
  /** Retry-After header value in seconds (for rate limit errors) */
  retryAfter?: number;
  /** Additional headers to set */
  headers?: Record<string, string>;
}

/**
 * Structure of the error response sent to clients
 */
export interface ErrorResponse {
  success: false;
  code: string;
  message: string;
  correlationId: string;
  timestamp: string;
  /** Only included in development mode if includeDetails is true */
  details?: unknown;
  /** Only included for rate limit errors */
  retryAfter?: number;
}

/**
 * Generate a unique correlation ID for error tracking
 * Format: prefix-timestamp-random (e.g., "err-1704067200-a1b2c3d4")
 */
export function generateCorrelationId(): string {
  const timestamp = Math.floor(Date.now() / 1000);
  const random = randomBytes(4).toString('hex');
  return `err-${timestamp}-${random}`;
}

/**
 * Default logger that uses console
 */
const defaultLogger: ErrorLogger = {
  error: (message, meta) => console.error(message, meta),
  warn: (message, meta) => console.warn(message, meta),
  info: (message, meta) => console.info(message, meta),
};

/**
 * Send a standardized error response
 *
 * This is the primary function for sending error responses. It:
 * 1. Generates a correlation ID for tracking
 * 2. Logs the detailed error internally
 * 3. Returns only the code and generic message to the client
 *
 * @example
 * ```typescript
 * import { ErrorCodes, sendErrorResponse } from '@vlvt/shared';
 *
 * // Simple usage
 * sendErrorResponse(res, ErrorCodes.AUTH_INVALID_CREDENTIALS);
 *
 * // With original error and context
 * sendErrorResponse(res, ErrorCodes.AUTH_INVALID_CREDENTIALS, originalError, {
 *   logger: winstonLogger,
 *   userId: req.user?.userId,
 *   path: req.path,
 *   logContext: { attemptedEmail: email }
 * });
 * ```
 */
export function sendErrorResponse<T extends MinimalResponse>(
  res: T,
  errorDef: ErrorCodeDefinition,
  originalError?: Error | unknown,
  options: SendErrorOptions = {}
): T {
  const {
    logger = defaultLogger,
    logContext = {},
    userId,
    path,
    method,
    includeDetails = false,
    retryAfter,
    headers = {},
  } = options;

  // Generate correlation ID
  const correlationId = generateCorrelationId();

  // Determine log level based on status code and alertability
  const logLevel: 'error' | 'warn' =
    errorDef.httpStatus >= 500 || isAlertableError(errorDef) ? 'error' : 'warn';

  // Build log metadata
  const logMeta: Record<string, unknown> = {
    correlationId,
    errorCode: errorDef.code,
    httpStatus: errorDef.httpStatus,
    internalMessage: errorDef.internalMessage,
    userId,
    path,
    method,
    isAlertable: isAlertableError(errorDef),
    ...logContext,
  };

  // Add original error details to log (not to response)
  if (originalError) {
    if (originalError instanceof Error) {
      logMeta.originalError = {
        name: originalError.name,
        message: originalError.message,
        stack: originalError.stack,
      };
    } else {
      logMeta.originalError = originalError;
    }
  }

  // Log the error internally with full details
  const logMessage = `${errorDef.code}: ${errorDef.internalMessage} [${correlationId}]`;
  logger[logLevel](logMessage, logMeta);

  // Build client response (minimal information)
  const response: ErrorResponse = {
    success: false,
    code: errorDef.code,
    message: errorDef.publicMessage,
    correlationId,
    timestamp: new Date().toISOString(),
  };

  // Include retry-after for rate limit errors
  if (retryAfter !== undefined) {
    response.retryAfter = retryAfter;
  }

  // Only include details in development mode when explicitly enabled
  if (includeDetails && process.env.NODE_ENV === 'development' && originalError) {
    if (originalError instanceof Error) {
      response.details = {
        name: originalError.name,
        message: originalError.message,
      };
    } else {
      response.details = originalError;
    }
  }

  // Set custom headers
  for (const [key, value] of Object.entries(headers)) {
    res.setHeader(key, value);
  }

  // Set Retry-After header for rate limit errors
  if (retryAfter !== undefined && errorDef.httpStatus === 429) {
    res.setHeader('Retry-After', retryAfter.toString());
  }

  // Set correlation ID header for client-side tracking
  res.setHeader('X-Correlation-ID', correlationId);

  return res.status(errorDef.httpStatus).json(response);
}

/**
 * Create a configured error response sender with preset options
 *
 * Useful for creating service-specific error handlers with pre-configured
 * logger and other options.
 *
 * @example
 * ```typescript
 * const sendError = createErrorResponseSender({
 *   logger: winstonLogger,
 *   includeDetails: process.env.NODE_ENV === 'development',
 * });
 *
 * // Usage in route handlers
 * sendError(res, ErrorCodes.AUTH_INVALID_CREDENTIALS, err, { userId: req.user?.id });
 * ```
 */
export function createErrorResponseSender(defaultOptions: Omit<SendErrorOptions, 'logContext'>) {
  return <T extends MinimalResponse>(
    res: T,
    errorDef: ErrorCodeDefinition,
    originalError?: Error | unknown,
    options: SendErrorOptions = {}
  ): T => {
    return sendErrorResponse(res, errorDef, originalError, {
      ...defaultOptions,
      ...options,
      logContext: { ...options.logContext },
    });
  };
}

/**
 * Express middleware error handler factory
 *
 * Creates an error handling middleware that catches unhandled errors
 * and sends standardized error responses.
 *
 * @example
 * ```typescript
 * import { createErrorMiddleware, ErrorCodes } from '@vlvt/shared';
 *
 * app.use(createErrorMiddleware({
 *   logger: winstonLogger,
 *   defaultError: ErrorCodes.SYS_INTERNAL_ERROR,
 * }));
 * ```
 */
export interface ErrorMiddlewareOptions {
  /** Logger instance */
  logger?: ErrorLogger;
  /** Default error for unhandled exceptions */
  defaultError: ErrorCodeDefinition;
  /** Include error details in development */
  includeDetails?: boolean;
}

/**
 * Error class that carries error code definition
 */
export class CodedError extends Error {
  public readonly errorDef: ErrorCodeDefinition;
  public readonly logContext?: Record<string, unknown>;
  public readonly originalError?: Error;

  constructor(
    errorDef: ErrorCodeDefinition,
    originalError?: Error,
    logContext?: Record<string, unknown>
  ) {
    super(errorDef.internalMessage);
    this.name = 'CodedError';
    this.errorDef = errorDef;
    this.logContext = logContext;
    this.originalError = originalError;

    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

/**
 * Helper to create a CodedError from an error definition
 *
 * @example
 * ```typescript
 * throw createCodedError(ErrorCodes.AUTH_INVALID_CREDENTIALS, originalError, {
 *   attemptedEmail: email,
 * });
 * ```
 */
export function createCodedError(
  errorDef: ErrorCodeDefinition,
  originalError?: Error,
  logContext?: Record<string, unknown>
): CodedError {
  return new CodedError(errorDef, originalError, logContext);
}

/**
 * Type guard to check if an error is a CodedError
 */
export function isCodedError(error: unknown): error is CodedError {
  return error instanceof CodedError;
}

/**
 * Extract error response details for testing or logging
 */
export function extractErrorDetails(
  errorDef: ErrorCodeDefinition
): Pick<ErrorResponse, 'code' | 'message'> & { httpStatus: number } {
  return {
    code: errorDef.code,
    message: errorDef.publicMessage,
    httpStatus: errorDef.httpStatus,
  };
}
