/**
 * Internal Service Authentication Middleware (HMAC-SHA256)
 *
 * Provides secure service-to-service authentication using HMAC signatures.
 * Replaces the vulnerable X-Internal-Service header check with cryptographic verification.
 *
 * Security features:
 *   - HMAC-SHA256 signature verification
 *   - Timestamp validation to prevent replay attacks (5-minute window)
 *   - Service identifier header for logging/auditing
 *   - Constant-time signature comparison to prevent timing attacks
 *
 * Required headers:
 *   X-Internal-Signature: HMAC-SHA256 signature (hex-encoded)
 *   X-Internal-Timestamp: Unix timestamp in milliseconds
 *   X-Internal-Service: Service identifier (for logging, not security)
 *
 * Environment variable:
 *   INTERNAL_SERVICE_SECRET: Shared secret for HMAC signing (required in production)
 */

import { Request, Response, NextFunction } from 'express';
import {
  computeSignature,
  computeHash,
  getSigningSecret,
} from './request-signing';
import crypto from 'crypto';

// Default timestamp tolerance (5 minutes in milliseconds)
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

// Empty body SHA256 hash
const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Header names
const SIGNATURE_HEADER = 'x-internal-signature';
const TIMESTAMP_HEADER = 'x-internal-timestamp';
const SERVICE_HEADER = 'x-internal-service';

export interface InternalServiceAuthOptions {
  /** Secret for HMAC signing (default: from INTERNAL_SERVICE_SECRET or REQUEST_SIGNING_SECRET env) */
  secret?: string;
  /** Timestamp tolerance in milliseconds (default: 5 minutes) */
  timestampToleranceMs?: number;
  /** Logger for security events */
  logger?: {
    warn: (message: string, meta?: object) => void;
    debug: (message: string, meta?: object) => void;
  };
}

export interface InternalAuthResult {
  valid: boolean;
  error?: string;
  code?: string;
  serviceName?: string;
}

/**
 * Get the internal service secret from environment
 * Falls back to REQUEST_SIGNING_SECRET if INTERNAL_SERVICE_SECRET is not set
 */
export function getInternalServiceSecret(): string {
  // First check for dedicated internal service secret
  const internalSecret = process.env.INTERNAL_SERVICE_SECRET;
  if (internalSecret) {
    return internalSecret;
  }

  // Fall back to request signing secret
  return getSigningSecret();
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
 * Verify an internal service request
 */
export function verifyInternalServiceRequest(
  req: Request,
  secret: string,
  options: Pick<InternalServiceAuthOptions, 'timestampToleranceMs'> = {}
): InternalAuthResult {
  const { timestampToleranceMs = DEFAULT_TIMESTAMP_TOLERANCE_MS } = options;

  // Get service name from header (for logging, not security)
  const serviceName = req.headers[SERVICE_HEADER] as string | undefined;

  // Get signature from header
  const signature = req.headers[SIGNATURE_HEADER] as string | undefined;
  if (!signature) {
    return {
      valid: false,
      error: 'Missing internal signature header',
      code: 'INTERNAL_SIGNATURE_MISSING',
      serviceName,
    };
  }

  // Get timestamp from header
  const timestampStr = req.headers[TIMESTAMP_HEADER] as string | undefined;
  if (!timestampStr) {
    return {
      valid: false,
      error: 'Missing internal timestamp header',
      code: 'INTERNAL_TIMESTAMP_MISSING',
      serviceName,
    };
  }

  // Validate timestamp format
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return {
      valid: false,
      error: 'Invalid timestamp format',
      code: 'INTERNAL_TIMESTAMP_INVALID',
      serviceName,
    };
  }

  // Check timestamp is within tolerance window (prevents replay attacks)
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  if (diff > timestampToleranceMs) {
    return {
      valid: false,
      error: 'Timestamp expired',
      code: 'INTERNAL_TIMESTAMP_EXPIRED',
      serviceName,
    };
  }

  // Compute body hash
  let bodyHash = EMPTY_BODY_HASH;
  if (req.body) {
    let bodyStr: string;
    if (typeof req.body === 'string') {
      bodyStr = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      bodyStr = req.body.toString();
    } else {
      bodyStr = JSON.stringify(req.body);
    }
    if (bodyStr && bodyStr.length > 0) {
      bodyHash = computeHash(bodyStr);
    }
  }

  // Compute expected signature
  const expectedSignature = computeSignature(
    secret,
    req.method,
    req.path,
    timestampStr,
    bodyHash
  );

  // Compare signatures using constant-time comparison
  if (!secureCompare(signature, expectedSignature)) {
    return {
      valid: false,
      error: 'Invalid signature',
      code: 'INTERNAL_SIGNATURE_INVALID',
      serviceName,
    };
  }

  return {
    valid: true,
    serviceName,
  };
}

/**
 * Create middleware for internal service authentication
 */
export function createInternalServiceAuthMiddleware(options: InternalServiceAuthOptions = {}) {
  const {
    secret = getInternalServiceSecret(),
    timestampToleranceMs = DEFAULT_TIMESTAMP_TOLERANCE_MS,
    logger = console,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const result = verifyInternalServiceRequest(req, secret, { timestampToleranceMs });

    if (!result.valid) {
      logger.warn('Internal service authentication failed', {
        error: result.error,
        code: result.code,
        serviceName: result.serviceName,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(403).json({
        success: false,
        error: 'Internal endpoint authentication failed',
        code: result.code,
      });
      return;
    }

    logger.debug?.('Internal service authentication passed', {
      serviceName: result.serviceName,
      path: req.path,
      method: req.method,
    });

    next();
  };
}

/**
 * Generate headers for signing an internal service request
 * Use this when making calls to internal service endpoints
 */
export function signInternalServiceRequest(
  serviceName: string,
  method: string,
  path: string,
  body?: string | object,
  secret?: string
): Record<string, string> {
  const signingSecret = secret || getInternalServiceSecret();
  const timestamp = Date.now().toString();

  // Compute body hash
  let bodyHash = EMPTY_BODY_HASH;
  if (body) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyStr.length > 0) {
      bodyHash = computeHash(bodyStr);
    }
  }

  // Compute signature
  const signature = computeSignature(
    signingSecret,
    method,
    path,
    timestamp,
    bodyHash
  );

  return {
    'X-Internal-Signature': signature,
    'X-Internal-Timestamp': timestamp,
    'X-Internal-Service': serviceName,
    'Content-Type': 'application/json',
  };
}

/**
 * Default internal service auth middleware
 * Lazy-initialized to avoid throwing at module load time
 */
let _internalServiceAuthMiddleware: ReturnType<typeof createInternalServiceAuthMiddleware> | null = null;
export const internalServiceAuthMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!_internalServiceAuthMiddleware) {
    _internalServiceAuthMiddleware = createInternalServiceAuthMiddleware();
  }
  _internalServiceAuthMiddleware(req, res, next);
};
