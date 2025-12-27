/**
 * Express type extensions for VLVT microservices
 *
 * Extends the Express Request interface to include custom properties
 * added by our middleware (e.g., API versioning, user authentication).
 */

export interface JWTPayload {
  userId: string;
  provider: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      /**
       * Authenticated user information from JWT middleware
       */
      user?: JWTPayload;

      /**
       * API version extracted from the request path (e.g., 1 for /api/v1/...)
       * Set by the API versioning middleware
       */
      apiVersion?: number;

      /**
       * Rate limit information for the current request
       */
      rateLimit?: {
        limit: number;
        current: number;
        remaining: number;
        resetTime?: Date;
      };
    }
  }
}

export {};
