/**
 * Correlation ID Middleware
 * Generates or propagates correlation IDs across the request lifecycle
 * for log tracing and debugging (MON-05)
 */

import { Request, Response, NextFunction } from 'express';
import { generateCorrelationId } from '../errors/error-response';

// Extend Express Request type to include correlationId
declare global {
  namespace Express {
    interface Request {
      correlationId?: string;
    }
  }
}

/**
 * Middleware that ensures every request has a correlation ID.
 * - Uses incoming X-Correlation-ID header if present (for service-to-service calls)
 * - Generates new ID if not present
 * - Attaches to request object for use in handlers
 * - Sets X-Correlation-ID response header for client tracing
 */
export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Use incoming correlation ID if present, otherwise generate new one
  const correlationId = (req.headers['x-correlation-id'] as string) || generateCorrelationId();

  // Attach to request for use in handlers
  req.correlationId = correlationId;

  // Set response header for client-side tracing
  res.setHeader('X-Correlation-ID', correlationId);

  next();
}
