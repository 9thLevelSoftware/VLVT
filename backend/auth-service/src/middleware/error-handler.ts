import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Custom error classes for standardized error handling
 */
export class AppError extends Error {
  public statusCode: number;
  public isOperational: boolean;
  public errorCode: string;
  public details?: any;

  constructor(message: string, statusCode: number, errorCode: string, isOperational = true, details?: any) {
    super(message);

    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.isOperational = isOperational;
    this.details = details;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Standardized error response format
 */
interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  details?: any;
  timestamp: string;
}

/**
 * Global error handling middleware
 * Handles all unhandled errors and converts them to consistent response format
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Set default error properties
  let statusCode = 500;
  let errorCode = 'INTERNAL_SERVER_ERROR';
  let message = 'Internal server error';
  let details: any = {};
  let isOperational = false;

  // Handle AppError instances
  if (err instanceof AppError) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;
    details = err.details || {};
    isOperational = err.isOperational;
  }
  // Handle JWT errors
  else if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    errorCode = 'INVALID_TOKEN';
    message = 'Invalid or malformed authentication token';
    isOperational = true;
  }
  else if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    errorCode = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
    isOperational = true;
  }
  // Handle validation errors (from express-validator or similar)
  else if (err.name === 'ValidationError' || (err as any).errors) {
    statusCode = 400;
    errorCode = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = (err as any).errors || (err as any).details || {};
    isOperational = true;
  }
  // Handle database errors
  else if (err.name === 'QueryResultError' || err.name === 'DatabaseError') {
    statusCode = 500;
    errorCode = 'DATABASE_ERROR';
    message = 'Database operation failed';
    isOperational = false;
  }
  // Handle rate limiting
  else if (err.message.includes('rate limit')) {
    statusCode = 429;
    errorCode = 'RATE_LIMIT_EXCEEDED';
    message = 'Too many requests, please try again later';
    isOperational = true;
  }

  // Log the error with appropriate level based on operational status
  const logLevel = isOperational ? 'warn' : 'error';
  logger[logLevel]('Unhandled error occurred', {
    error: err.message,
    stack: err.stack,
    statusCode,
    errorCode,
    path: req.path,
    method: req.method,
    userId: req.user?.userId,
    isOperational,
    details: isOperational ? details : 'Error details omitted for security'
  });

  // Send consistent error response
  const errorResponse: ErrorResponse = {
    success: false,
    error: message,
    code: errorCode,
    timestamp: new Date().toISOString()
  };

  // Only include details in development or for operational errors
  if (process.env.NODE_ENV === 'development' || isOperational) {
    errorResponse.details = details;
  }

  res.status(statusCode).json(errorResponse);
}

/**
 * Async error handler wrapper
 * Prevents unhandled promise rejections in async route handlers
 */
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({
    success: false,
    error: 'Resource not found',
    code: 'NOT_FOUND',
    timestamp: new Date().toISOString()
  });
}

/**
 * Standardized error responses for common scenarios
 */
export const ErrorResponses = {
  // Authentication errors
  UNAUTHENTICATED: {
    statusCode: 401,
    errorCode: 'UNAUTHENTICATED',
    message: 'Authentication required'
  },
  FORBIDDEN: {
    statusCode: 403,
    errorCode: 'FORBIDDEN',
    message: 'Access denied'
  },
  INVALID_CREDENTIALS: {
    statusCode: 401,
    errorCode: 'INVALID_CREDENTIALS',
    message: 'Invalid credentials'
  },
  // Validation errors
  INVALID_INPUT: {
    statusCode: 400,
    errorCode: 'INVALID_INPUT',
    message: 'Invalid input data'
  },
  // Resource errors
  NOT_FOUND: {
    statusCode: 404,
    errorCode: 'NOT_FOUND',
    message: 'Resource not found'
  },
  CONFLICT: {
    statusCode: 409,
    errorCode: 'CONFLICT',
    message: 'Resource conflict'
  },
  // Rate limiting
  RATE_LIMITED: {
    statusCode: 429,
    errorCode: 'RATE_LIMITED',
    message: 'Too many requests'
  }
};

/**
 * Create standardized error response
 */
export function createErrorResponse(
  res: Response,
  errorConfig: { statusCode: number; errorCode: string; message: string },
  details?: any
) {
  const response: ErrorResponse = {
    success: false,
    error: errorConfig.message,
    code: errorConfig.errorCode,
    timestamp: new Date().toISOString()
  };

  if (details) {
    response.details = details;
  }

  return res.status(errorConfig.statusCode).json(response);
}