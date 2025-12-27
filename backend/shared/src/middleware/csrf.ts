/**
 * CSRF Protection Middleware
 *
 * Implements double-submit cookie pattern for CSRF protection.
 * - Generates cryptographically secure tokens
 * - Sets token as HttpOnly=false cookie (so frontend can read it)
 * - Validates token in X-CSRF-Token header matches cookie value
 * - Skips validation for safe methods (GET, HEAD, OPTIONS)
 * - Skips validation for OAuth callbacks and webhook endpoints
 *
 * Note: For mobile apps using Bearer token auth, CSRF is less critical
 * since they don't use cookies for authentication. However, this provides
 * defense-in-depth and protects web-based admin interfaces.
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export interface CsrfMiddlewareOptions {
  /** Cookie name for CSRF token (default: 'csrf-token') */
  cookieName?: string;
  /** Header name for CSRF token (default: 'X-CSRF-Token') */
  headerName?: string;
  /** Token length in bytes (default: 32) */
  tokenLength?: number;
  /** Cookie max age in milliseconds (default: 1 hour) */
  cookieMaxAge?: number;
  /** Paths to skip CSRF validation (e.g., OAuth callbacks, webhooks) */
  skipPaths?: string[];
  /** Whether to use secure cookies (default: true in production) */
  secure?: boolean;
  /** SameSite cookie attribute (default: 'strict') */
  sameSite?: 'strict' | 'lax' | 'none';
  /** Custom logger function */
  logger?: {
    warn: (message: string, meta?: object) => void;
    debug: (message: string, meta?: object) => void;
  };
}

// Safe HTTP methods that don't require CSRF protection
const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

// Default paths to skip (OAuth callbacks and webhooks have their own protection)
const DEFAULT_SKIP_PATHS = [
  '/auth/google/callback',
  '/auth/apple/callback',
  '/webhooks/',
  '/health',
];

/**
 * Generate a cryptographically secure CSRF token
 * @param length - Token length in bytes (default: 32)
 * @returns Base64url-encoded token string
 */
export function generateCsrfToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('base64url');
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  if (a.length !== b.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

/**
 * Create CSRF protection middleware with configurable options
 */
export function createCsrfMiddleware(options: CsrfMiddlewareOptions = {}) {
  const {
    cookieName = 'csrf-token',
    headerName = 'X-CSRF-Token',
    tokenLength = 32,
    cookieMaxAge = 60 * 60 * 1000, // 1 hour
    skipPaths = DEFAULT_SKIP_PATHS,
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'strict',
    logger = console,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip CSRF validation for safe methods
    if (SAFE_METHODS.includes(req.method)) {
      return next();
    }

    // Skip CSRF validation for specified paths
    const shouldSkip = skipPaths.some(path => {
      if (path.endsWith('/')) {
        // Path prefix matching (e.g., '/webhooks/')
        return req.path.startsWith(path);
      }
      // Exact path matching
      return req.path === path;
    });

    if (shouldSkip) {
      logger.debug?.('CSRF validation skipped for path', { path: req.path });
      return next();
    }

    // Skip CSRF for requests with Bearer token auth (mobile apps)
    // These are already protected by the token-based auth mechanism
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      logger.debug?.('CSRF validation skipped for Bearer token auth', { path: req.path });
      return next();
    }

    // Get token from cookie
    const cookieToken = req.cookies?.[cookieName];
    if (!cookieToken) {
      logger.warn('CSRF validation failed: missing cookie token', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      res.status(403).json({
        success: false,
        error: 'CSRF token missing',
        code: 'CSRF_TOKEN_MISSING',
      });
      return;
    }

    // Get token from header
    const headerToken = req.headers[headerName.toLowerCase()] as string;
    if (!headerToken) {
      logger.warn('CSRF validation failed: missing header token', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      res.status(403).json({
        success: false,
        error: 'CSRF token missing from header',
        code: 'CSRF_HEADER_MISSING',
      });
      return;
    }

    // Validate tokens match using constant-time comparison
    if (!secureCompare(cookieToken, headerToken)) {
      logger.warn('CSRF validation failed: token mismatch', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });
      res.status(403).json({
        success: false,
        error: 'CSRF token invalid',
        code: 'CSRF_TOKEN_INVALID',
      });
      return;
    }

    logger.debug?.('CSRF validation passed', { path: req.path, method: req.method });
    next();
  };
}

/**
 * Create a route handler for the /csrf-token endpoint
 * Returns the CSRF token and sets it as a cookie
 */
export function createCsrfTokenHandler(options: CsrfMiddlewareOptions = {}) {
  const {
    cookieName = 'csrf-token',
    tokenLength = 32,
    cookieMaxAge = 60 * 60 * 1000, // 1 hour
    secure = process.env.NODE_ENV === 'production',
    sameSite = 'strict',
  } = options;

  return (req: Request, res: Response): void => {
    // Generate new token
    const token = generateCsrfToken(tokenLength);

    // Set as cookie (HttpOnly=false so frontend JavaScript can read it)
    res.cookie(cookieName, token, {
      httpOnly: false, // Frontend needs to read this
      secure,
      sameSite,
      maxAge: cookieMaxAge,
      path: '/',
    });

    res.json({
      success: true,
      csrfToken: token,
    });
  };
}

/**
 * Default CSRF middleware with standard configuration
 */
export const csrfMiddleware = createCsrfMiddleware();

/**
 * Default CSRF token handler
 */
export const csrfTokenHandler = createCsrfTokenHandler();
