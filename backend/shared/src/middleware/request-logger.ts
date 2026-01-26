/**
 * Request Logger Middleware
 * Attaches a child logger with correlationId to each request (MON-05)
 *
 * Must be used AFTER correlationMiddleware to access req.correlationId
 */

import { Request, Response, NextFunction } from 'express';
import winston from 'winston';

// Extend Express Request type to include logger
declare global {
  namespace Express {
    interface Request {
      logger?: winston.Logger;
    }
  }
}

/**
 * Creates a child logger with correlationId in defaultMeta
 * Winston child loggers inherit parent config but add custom metadata
 */
export function createRequestLogger(
  parentLogger: winston.Logger,
  correlationId: string
): winston.Logger {
  return parentLogger.child({
    correlationId,
  });
}

/**
 * Middleware factory that creates request logger middleware for a service
 * @param logger - The service's Winston logger instance
 * @returns Express middleware that attaches req.logger with correlationId
 */
export function createRequestLoggerMiddleware(logger: winston.Logger) {
  return function requestLoggerMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    // Use correlationId from correlation middleware (must run after correlationMiddleware)
    const correlationId = req.correlationId || 'unknown';

    // Create child logger with correlationId in metadata
    req.logger = createRequestLogger(logger, correlationId);

    // Log request start
    req.logger.info('Request started', {
      method: req.method,
      path: req.path,
      userAgent: req.get('user-agent'),
    });

    // Log request completion
    const startTime = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      req.logger?.info('Request completed', {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  };
}

export default createRequestLoggerMiddleware;
