/**
 * Request Signing Middleware (HMAC-SHA256)
 *
 * Provides integrity verification for API requests by signing them with HMAC-SHA256.
 * This ensures requests haven't been tampered with in transit.
 *
 * Signature format:
 *   signature = HMAC-SHA256(secret, method + path + timestamp + bodyHash)
 *   bodyHash = SHA256(requestBody) or empty body hash for no body
 *
 * Required headers:
 *   X-Signature: The HMAC-SHA256 signature (hex-encoded)
 *   X-Timestamp: Unix timestamp in milliseconds
 *
 * Security features:
 *   - Constant-time signature comparison to prevent timing attacks
 *   - Timestamp validation to prevent replay attacks (5-minute window)
 *   - Logs invalid signature attempts for security monitoring
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

// Empty body SHA256 hash (for GET requests or empty POST body)
// This is the SHA256 hash of an empty string
const EMPTY_BODY_HASH = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

// Default timestamp tolerance (5 minutes in milliseconds)
const DEFAULT_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

// Default development secret (MUST be overridden in production)
const DEFAULT_DEV_SECRET = 'vlvt-dev-signing-secret-DO-NOT-USE-IN-PRODUCTION';

export interface SignatureMiddlewareOptions {
  /** Secret key for HMAC-SHA256 signing (default: from env or dev secret) */
  secret?: string;
  /** Timestamp tolerance in milliseconds (default: 5 minutes) */
  timestampToleranceMs?: number;
  /** Header name for signature (default: 'X-Signature') */
  signatureHeader?: string;
  /** Header name for timestamp (default: 'X-Timestamp') */
  timestampHeader?: string;
  /** Paths to skip signature validation */
  skipPaths?: string[];
  /** Whether to skip signature validation for safe methods (GET, HEAD, OPTIONS) */
  skipSafeMethods?: boolean;
  /** Custom logger function */
  logger?: {
    warn: (message: string, meta?: object) => void;
    debug: (message: string, meta?: object) => void;
  };
}

export interface SignatureVerificationResult {
  valid: boolean;
  error?: string;
  code?: string;
}

/**
 * Compute SHA256 hash of a string or buffer
 */
export function computeHash(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compute HMAC-SHA256 signature
 */
export function computeSignature(
  secret: string,
  method: string,
  path: string,
  timestamp: string,
  bodyHash: string
): string {
  const payload = `${method.toUpperCase()}${path}${timestamp}${bodyHash}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
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
 * Verify a request signature
 */
export function verifySignature(
  req: Request,
  secret: string,
  options: Pick<SignatureMiddlewareOptions, 'timestampToleranceMs' | 'signatureHeader' | 'timestampHeader'> = {}
): SignatureVerificationResult {
  const {
    timestampToleranceMs = DEFAULT_TIMESTAMP_TOLERANCE_MS,
    signatureHeader = 'X-Signature',
    timestampHeader = 'X-Timestamp',
  } = options;

  // Get signature from header
  const signature = req.headers[signatureHeader.toLowerCase()] as string | undefined;
  if (!signature) {
    return {
      valid: false,
      error: 'Missing signature header',
      code: 'SIGNATURE_MISSING',
    };
  }

  // Get timestamp from header
  const timestampStr = req.headers[timestampHeader.toLowerCase()] as string | undefined;
  if (!timestampStr) {
    return {
      valid: false,
      error: 'Missing timestamp header',
      code: 'TIMESTAMP_MISSING',
    };
  }

  // Validate timestamp format
  const timestamp = parseInt(timestampStr, 10);
  if (isNaN(timestamp)) {
    return {
      valid: false,
      error: 'Invalid timestamp format',
      code: 'TIMESTAMP_INVALID',
    };
  }

  // Check timestamp is within tolerance window
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  if (diff > timestampToleranceMs) {
    return {
      valid: false,
      error: 'Timestamp expired',
      code: 'TIMESTAMP_EXPIRED',
    };
  }

  // Compute body hash
  let bodyHash = EMPTY_BODY_HASH;
  if (req.body) {
    // Handle different body types
    let bodyStr: string;
    if (typeof req.body === 'string') {
      bodyStr = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      bodyStr = req.body.toString();
    } else {
      // JSON body - stringify it (should match what was sent)
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
      code: 'SIGNATURE_INVALID',
    };
  }

  return { valid: true };
}

/**
 * Get the signing secret from environment or use default for development
 */
export function getSigningSecret(): string {
  const secret = process.env.REQUEST_SIGNING_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('REQUEST_SIGNING_SECRET must be set in production');
    }
    return DEFAULT_DEV_SECRET;
  }
  return secret;
}

/**
 * Create request signing middleware with configurable options
 */
export function createSignatureMiddleware(options: SignatureMiddlewareOptions = {}) {
  const {
    secret = getSigningSecret(),
    timestampToleranceMs = DEFAULT_TIMESTAMP_TOLERANCE_MS,
    signatureHeader = 'X-Signature',
    timestampHeader = 'X-Timestamp',
    skipPaths = ['/health', '/csrf-token'],
    skipSafeMethods = false,
    logger = console,
  } = options;

  // Safe HTTP methods
  const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

  return (req: Request, res: Response, next: NextFunction): void => {
    // Skip signature validation for safe methods if configured
    if (skipSafeMethods && SAFE_METHODS.includes(req.method)) {
      logger.debug?.('Signature validation skipped for safe method', {
        method: req.method,
        path: req.path,
      });
      return next();
    }

    // Skip signature validation for specified paths
    const shouldSkip = skipPaths.some(path => {
      if (path.endsWith('/')) {
        return req.path.startsWith(path);
      }
      return req.path === path;
    });

    if (shouldSkip) {
      logger.debug?.('Signature validation skipped for path', { path: req.path });
      return next();
    }

    // Verify signature
    const result = verifySignature(req, secret, {
      timestampToleranceMs,
      signatureHeader,
      timestampHeader,
    });

    if (!result.valid) {
      logger.warn('Signature validation failed', {
        error: result.error,
        code: result.code,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(401).json({
        success: false,
        error: result.error,
        code: result.code,
      });
      return;
    }

    logger.debug?.('Signature validation passed', {
      path: req.path,
      method: req.method,
    });
    next();
  };
}

/**
 * Helper function to sign a request (for testing or internal use)
 */
export function signRequest(
  secret: string,
  method: string,
  path: string,
  body?: string | object
): { signature: string; timestamp: string; bodyHash: string } {
  const timestamp = Date.now().toString();
  let bodyHash = EMPTY_BODY_HASH;

  if (body) {
    const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
    if (bodyStr.length > 0) {
      bodyHash = computeHash(bodyStr);
    }
  }

  const signature = computeSignature(secret, method, path, timestamp, bodyHash);

  return {
    signature,
    timestamp,
    bodyHash,
  };
}

/**
 * Default signature middleware with standard configuration
 */
export const signatureMiddleware = createSignatureMiddleware();

/**
 * Signature middleware that skips safe methods (GET, HEAD, OPTIONS)
 * Useful for APIs where only mutation operations need signature verification
 */
export const signatureMutationMiddleware = createSignatureMiddleware({
  skipSafeMethods: true,
});
