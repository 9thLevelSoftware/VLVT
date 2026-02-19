import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

// Initialize Sentry before any other imports
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // 10% of transactions for performance monitoring

    // Service identification for dashboard grouping (MON-05)
    initialScope: {
      tags: {
        service: 'auth-service',
      },
    },

    // Release tracking (use RAILWAY_GIT_COMMIT_SHA in production, or npm version)
    release: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.npm_package_version || 'development',

    // PII scrubbing before events reach Sentry (MON-05)
    beforeSend(event) {
      // Scrub request body (may contain passwords, tokens, messages)
      if (event.request?.data) {
        event.request.data = '[REDACTED]';
      }

      // Scrub query strings (may contain tokens)
      if (event.request?.query_string) {
        event.request.query_string = '[REDACTED]';
      }

      // Scrub cookies (contain session tokens)
      if (event.request?.cookies) {
        event.request.cookies = {};
      }

      // Scrub authorization headers
      if (event.request?.headers) {
        const sensitiveHeaders = ['authorization', 'cookie', 'x-csrf-token'];
        for (const header of sensitiveHeaders) {
          if (event.request.headers[header]) {
            event.request.headers[header] = '[REDACTED]';
          }
        }
      }

      return event;
    },
  });
}

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { Pool } from 'pg';
import { OAuth2Client } from 'google-auth-library';
import appleSignin from 'apple-signin-auth';
import logger from './utils/logger';
import rateLimit from 'express-rate-limit';
import { authLimiter, verifyLimiter, generalLimiter } from './middleware/rate-limiter';
import { authenticateJWT } from './middleware/auth';
import { generateVerificationToken, generateResetToken, generateRefreshToken, hashToken, isTokenExpired, verifyToken, timingSafeEqual } from './utils/crypto';
import { validatePassword, hashPassword, verifyPassword } from './utils/password';
import { emailService } from './services/email-service';
import { validateInputMiddleware, validateEmail, validateUserId, validateArray } from './utils/input-validation';
import { globalErrorHandler, notFoundHandler, asyncHandler, AppError, ErrorResponses } from './middleware/error-handler';
import { initializeSwagger } from './docs/swagger';
import cacheManager from './utils/cache-manager';
import * as kycaidService from './services/kycaid-service';
import axios from 'axios';
import {
  AuditLogger,
  AuditAction,
  AuditResourceType,
  createAuditLogger,
  createCsrfMiddleware,
  createCsrfTokenHandler,
  addVersionToHealth,
  createVersionMiddleware,
  API_VERSIONS,
  CURRENT_API_VERSION,
  // Enhanced error codes
  ErrorCodes,
  sendErrorResponse,
  createErrorResponseSender,
  // Correlation ID middleware (MON-05)
  correlationMiddleware,
  // Request logger middleware (MON-05)
  createRequestLoggerMiddleware,
  // Internal service authentication (HMAC-based)
  signInternalServiceRequest,
} from '@vlvt/shared';

const app = express();
const PORT = process.env.PORT || 3001;

// Trust proxy - required for Railway/production environments behind reverse proxy
// This allows express-rate-limit to correctly identify users via X-Forwarded-For
app.set('trust proxy', 1);

// Log initialization
if (process.env.SENTRY_DSN) {
  logger.info('Sentry error tracking enabled', { environment: process.env.NODE_ENV || 'development' });
} else {
  logger.info('Sentry error tracking disabled (SENTRY_DSN not set)');
}

// In test environment, these are set in tests/setup.ts
if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'test') {
  logger.error('JWT_SECRET environment variable is required');
  process.exit(1);
}
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
  logger.error('DATABASE_URL environment variable is required');
  process.exit(1);
}
// Critical security fix: Remove fallback to prevent secret exposure
if (!process.env.JWT_SECRET) {
  logger.error('JWT_SECRET environment variable is required and was not provided');
  process.exit(1);
}
const JWT_SECRET = process.env.JWT_SECRET;

// Token expiration configuration
// Access tokens are short-lived for security, refresh tokens are long-lived
const ACCESS_TOKEN_EXPIRY = '15m'; // 15 minutes - short-lived for security
const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

// CORS origin from environment variable - require in production
const CORS_ORIGIN = (() => {
  const origin = process.env.CORS_ORIGIN;
  if (!origin && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN environment variable is required in production');
  }
  return origin || 'http://localhost:19006';
})();

// Initialize Google OAuth2 client
const googleClient = new OAuth2Client();

// Initialize PostgreSQL connection pool
//
// SECURITY NOTE: TLS Configuration for Railway PostgreSQL
// =========================================================
// Railway uses self-signed certificates for PostgreSQL connections and does not
// provide a CA bundle for validation. This means:
//
// 1. rejectUnauthorized: false is REQUIRED for Railway connections
// 2. Connections ARE encrypted with TLS (data in transit is protected)
// 3. Certificate validation cannot be performed (no MITM detection)
//
// Mitigations:
// - DATABASE_URL uses sslmode=require (enforces TLS, even without cert validation)
// - Railway internal networking used where possible (private network)
// - Railway handles certificate rotation automatically
//
// When Railway provides a CA bundle, update to:
//   ssl: { rejectUnauthorized: true, ca: fs.readFileSync('railway-ca.crt') }
//
// Reference: https://station.railway.com/questions/postgre-sql-ssl-connection-self-signed-33f0d3b6
// Decision: SEC-01-DOCUMENTED in .planning/phases/01-foundation-safety/SECURITY-DECISIONS.md
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
  idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
  connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '2000', 10),
  // SECURITY WARNING: rejectUnauthorized: false disables certificate validation.
  // This is ONLY acceptable for Railway's internal private network with self-signed certs.
  // In public networks, this would be vulnerable to MITM attacks.
  ssl: process.env.DATABASE_URL?.includes('railway')
    ? { rejectUnauthorized: false }
    : false,
});

// Database connection event handlers
pool.on('connect', (client) => {
  logger.info('New database connection established');
});

pool.on('acquire', (client) => {
  logger.debug('Database client acquired from pool');
});

pool.on('remove', (client) => {
  logger.debug('Database client removed from pool');
});

pool.on('error', (err, client) => {
  logger.error('Unexpected database connection error', {
    error: err.message,
    stack: err.stack
  });
});

// Initialize AuditLogger for comprehensive security event logging
const auditLogger = createAuditLogger({
  pool,
  serviceName: 'auth-service',
});

// Create a configured error response sender for this service
const sendError = createErrorResponseSender({
  logger,
  includeDetails: process.env.NODE_ENV === 'development',
});

/**
 * Helper function to issue access token and refresh token pair
 * Stores refresh token hash in database for revocation support
 */
async function issueTokenPair(
  userId: string,
  provider: string,
  email: string,
  req: Request
): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
  // Generate short-lived access token
  const accessToken = jwt.sign(
    { userId, provider, email },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRY }
  );

  // Generate refresh token
  const { token: refreshToken, tokenHash, expires } = generateRefreshToken();

  // Store refresh token hash in database
  await pool.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_info, ip_address)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      tokenHash,
      expires,
      req.headers['user-agent']?.substring(0, 500) || null,
      req.ip || req.socket.remoteAddress || null
    ]
  );

  logger.info('Token pair issued', { userId, provider });

  return {
    accessToken,
    refreshToken,
    expiresIn: 15 * 60 // 15 minutes in seconds
  };
}

// Security middleware with comprehensive headers
app.use(helmet({
  hidePoweredBy: true,
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'", 'https:'],
    },
  },
  // HSTS (HTTP Strict Transport Security) Configuration
  // Ensures browsers always use HTTPS, even on first visit (with preload)
  //
  // HSTS Preload Submission Checklist:
  // 1. Serve valid HTTPS certificate on all domains
  // 2. Redirect HTTP to HTTPS on the same host
  // 3. Serve HSTS header on base domain with:
  //    - maxAge >= 31536000 (1 year)
  //    - includeSubDomains directive
  //    - preload directive
  // 4. Submit domain to https://hstspreload.org after deployment
  //
  // WARNING: HSTS preload is difficult to undo. Ensure HTTPS is fully
  // functional before submission. Removal can take months.
  hsts: {
    maxAge: 31536000, // 1 year (required minimum for preload)
    includeSubDomains: true, // Required for preload
    preload: true, // Required for preload submission
  },
  frameguard: { action: 'deny' },
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

// CORS configuration (origin validation happens at startup via CORS_ORIGIN IIFE)
app.use(cors({
  origin: CORS_ORIGIN,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-API-Key', 'X-CSRF-Token']
}));
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Correlation ID middleware - generates/propagates IDs for request tracing (MON-05)
app.use(correlationMiddleware);

// Request logger middleware - attaches child logger with correlationId (MON-05)
const requestLoggerMiddleware = createRequestLoggerMiddleware(logger);
app.use(requestLoggerMiddleware);

// CSRF Protection Configuration
// Note: Versioned routes (/api/v1/*) are rewritten to legacy paths before CSRF check
const csrfMiddleware = createCsrfMiddleware({
  skipPaths: [
    '/health',
    '/.well-known/security.txt',
    // OAuth endpoints
    '/auth/google',
    '/auth/google/callback',
    '/auth/apple',
    '/auth/apple/web',
    '/auth/apple/callback',
    // Email auth endpoints (no Bearer token yet when logging in)
    '/auth/email/register',
    '/auth/email/login',
    '/auth/email/verify',
    '/auth/email/forgot',
    '/auth/email/reset',
    '/auth/email/resend-verification',
    // Webhooks
    '/webhooks/',
    '/kycaid/webhook',
    // Versioned equivalents (handled by URL rewrite middleware)
    '/api/v1/auth/google',
    '/api/v1/auth/google/callback',
    '/api/v1/auth/apple',
    '/api/v1/auth/apple/web',
    '/api/v1/auth/apple/callback',
    '/api/v1/auth/email/register',
    '/api/v1/auth/email/login',
    '/api/v1/auth/email/verify',
    '/api/v1/auth/email/forgot',
    '/api/v1/auth/email/reset',
    '/api/v1/auth/email/resend-verification',
  ],
  logger,
});
const csrfTokenHandler = createCsrfTokenHandler();

// Health check endpoint with dependency status (MON-02)
app.get('/health', async (req: Request, res: Response): Promise<void> => {
  const health: {
    status: 'ok' | 'degraded' | 'unhealthy';
    service: string;
    timestamp: string;
    checks: {
      database: { status: string; latencyMs: number };
    };
    [key: string]: unknown;
  } = {
    status: 'ok',
    service: 'auth-service',
    timestamp: new Date().toISOString(),
    checks: {
      database: { status: 'unknown', latencyMs: -1 },
    },
  };

  // Check database connectivity
  try {
    const dbStart = Date.now();
    await pool.query('SELECT 1');
    health.checks.database = {
      status: 'ok',
      latencyMs: Date.now() - dbStart,
    };
  } catch (err) {
    health.checks.database = {
      status: 'error',
      latencyMs: -1,
    };
    health.status = 'degraded';
    // Log but don't expose error details
    logger.error('Health check: database connectivity failed', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }

  // Return appropriate status code
  const httpStatus = health.status === 'ok' ? 200 : 503;
  res.status(httpStatus).json(addVersionToHealth(health));
});

// Security.txt endpoint (RFC 9116)
// Helps security researchers report vulnerabilities responsibly
// See: https://securitytxt.org/
app.get('/.well-known/security.txt', (req: Request, res: Response) => {
  const securityTxt = `# VLVT Security Policy
# See https://securitytxt.org/ for format specification (RFC 9116)

Contact: mailto:security@getvlvt.vip
Expires: 2027-01-25T00:00:00.000Z
Preferred-Languages: en
Canonical: https://api.getvlvt.vip/.well-known/security.txt
Policy: https://vlvtapp.com/.well-known/security-policy

# Security Policy
# We take security seriously. If you discover a vulnerability, please report it
# responsibly using the contact information above.
#
# What to include in your report:
# - Description of the vulnerability
# - Steps to reproduce
# - Potential impact
# - Any suggested fixes (optional)
#
# We commit to:
# - Acknowledging receipt of your report within 48 hours
# - Providing regular updates on our progress
# - Notifying you when the issue is resolved
# - Crediting you (if desired) for responsible disclosure
`;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(securityTxt);
});

// CSRF token endpoint - provides token for double-submit cookie pattern
app.get('/csrf-token', csrfTokenHandler);

// Apply CSRF middleware to state-changing requests
// Note: For mobile apps using Bearer tokens, CSRF is skipped (already protected)
app.use(csrfMiddleware);

// Apply input validation middleware to all routes
// Skip for email verify/reset — tokens are hex strings that get hashed immediately,
// and the aggressive SQL/XSS patterns can false-positive on random hex
app.use((req: Request, res: Response, next: NextFunction) => {
  const skipPaths = [
    '/auth/email/verify',
    '/api/v1/auth/email/verify',
    '/auth/email/reset',
    '/api/v1/auth/email/reset',
  ];
  if (skipPaths.some(p => req.path.startsWith(p))) {
    return next();
  }
  return validateInputMiddleware(req, res, next);
});

// =============================================================================
// API VERSIONING SUPPORT
// All routes are available at both:
// - Versioned: /api/v1/auth/* (recommended for new clients)
// - Legacy: /auth/* (backwards compatible, will eventually be deprecated)
// =============================================================================

// URL rewriting middleware for versioned routes
// Strips /api/v1 prefix and routes to existing handlers
app.use((req, res, next) => {
  const versionMatch = req.path.match(/^\/api\/v(\d+)(\/.*)?$/);

  if (versionMatch) {
    const version = parseInt(versionMatch[1], 10);
    const remainingPath = versionMatch[2] || '/';

    // Validate version is supported
    if (version < 1 || version > CURRENT_API_VERSION) {
      return res.status(400).json({
        success: false,
        error: `API version v${version} is not supported`,
        supportedVersions: Object.values(API_VERSIONS),
        currentVersion: CURRENT_API_VERSION,
      });
    }

    // Set version on request and response
    req.apiVersion = version;
    res.setHeader('X-API-Version', `v${version}`);

    // Rewrite URL to strip version prefix for routing
    // Preserve query string during rewrite
    const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
    req.url = remainingPath + queryString;
  } else {
    // Legacy unversioned route
    req.apiVersion = 1; // Default to v1
    res.setHeader('X-API-Version', 'v1');
    res.setHeader('X-API-Legacy-Route', 'true');
  }

  next();
});

// Sign in with Apple endpoint
app.post('/auth/apple', authLimiter, async (req: Request, res: Response) => {
  try {
    const { identityToken } = req.body;

    if (!identityToken) {
      return res.status(400).json({ success: false, error: 'identityToken is required' });
    }

    // Verify the Apple identity token using apple-signin-auth
    // This properly verifies the token signature against Apple's public keys
    try {
      // Critical security fix: Require Apple CLIENT_ID, don't use fallback
      if (!process.env.APPLE_CLIENT_ID) {
        logger.error('APPLE_CLIENT_ID environment variable is required for Apple Sign-In');
        return res.status(503).json({ success: false, error: 'Apple Sign-In not configured' });
      }

      // Require nonce for replay protection
      const { nonce } = req.body;
      if (!nonce) {
        return res.status(400).json({
          success: false,
          error: 'nonce is required for Apple Sign-In'
        });
      }

      const appleIdTokenClaims = await appleSignin.verifyIdToken(identityToken, {
        // Audience validation with required environment variable
        audience: process.env.APPLE_CLIENT_ID,
        // Always verify nonce for replay protection
        nonce
      });

      if (!appleIdTokenClaims || !appleIdTokenClaims.sub) {
        return res.status(401).json({ success: false, error: 'Invalid identity token claims' });
      }

      const providerId = `apple_${appleIdTokenClaims.sub}`;
      const email = appleIdTokenClaims.email?.toLowerCase() || `user_${appleIdTokenClaims.sub}@apple.example.com`;
      const provider = 'apple';

      // Check if this Apple account is already linked
      const existingCredential = await pool.query(
        `SELECT ac.user_id FROM auth_credentials ac WHERE ac.provider = $1 AND ac.provider_id = $2`,
        [provider, providerId]
      );

      let userId: string;

      if (existingCredential.rows.length > 0) {
        userId = existingCredential.rows[0].user_id;
        await pool.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [userId]);
      } else {
        // Check for existing user with same email (account linking)
        const existingEmail = await pool.query(
          'SELECT user_id FROM auth_credentials WHERE email = $1',
          [email]
        );

        const client = await pool.connect();
        try {
          await client.query('BEGIN');

          if (existingEmail.rows.length > 0) {
            // Link to existing account
            userId = existingEmail.rows[0].user_id;

            await client.query(
              `INSERT INTO auth_credentials (user_id, provider, provider_id, email, email_verified)
               VALUES ($1, $2, $3, $4, true)
               ON CONFLICT (provider, provider_id) DO UPDATE SET updated_at = NOW()`,
              [userId, provider, providerId, email]
            );
          } else {
            // Create new user (maintain backwards compatibility with old ID format)
            userId = providerId;

            await client.query(
              `INSERT INTO users (id, provider, email) VALUES ($1, $2, $3)
               ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), email = $3`,
              [userId, provider, email]
            );

            await client.query(
              `INSERT INTO auth_credentials (user_id, provider, provider_id, email, email_verified)
               VALUES ($1, $2, $3, $4, true)
               ON CONFLICT (provider, provider_id) DO UPDATE SET updated_at = NOW()`,
              [userId, provider, providerId, email]
            );
          }

          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK');
          throw err;
        } finally {
          client.release();
        }
      }

      // Issue short-lived access token + refresh token pair
      const { accessToken, refreshToken, expiresIn } = await issueTokenPair(userId, provider, email, req);

      res.json({
        success: true,
        token: accessToken, // For backwards compatibility
        accessToken,
        refreshToken,
        expiresIn,
        userId,
        provider
      });
    } catch (verifyError) {
      logger.error('Apple token verification failed', { error: verifyError });
      return res.status(401).json({ success: false, error: 'Failed to verify Apple identity token' });
    }
  } catch (error) {
    logger.error('Apple authentication error', { error });
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Apple Sign-In callback - receives Apple's form POST redirect and sends
// the authorization code back to the Flutter app via Android intent URL.
app.post('/auth/apple/callback', (req: Request, res: Response) => {
  const { code, state } = req.body;
  if (!code) {
    return res.status(400).send('Missing authorization code');
  }
  const params = new URLSearchParams({ code });
  if (state) params.set('state', state);
  const intentUrl = `intent://callback?${params.toString()}#Intent;package=app.vlvt;scheme=signinwithapple;end`;
  res.redirect(303, intentUrl);
});

// Apple Sign-In web flow (for Android via web)
// Uses authorization code exchange instead of direct identity token verification.
// Key differences from native flow: requires client secret generation,
// uses Services ID (not App ID) as audience, no nonce validation.
app.post('/auth/apple/web', authLimiter, async (req: Request, res: Response) => {
  try {
    const { code, state } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code is required' });
    }

    // Validate required environment variables for web flow
    if (!process.env.APPLE_SERVICES_ID || !process.env.APPLE_TEAM_ID ||
        !process.env.APPLE_KEY_ID || !process.env.APPLE_PRIVATE_KEY ||
        !process.env.APPLE_REDIRECT_URI) {
      logger.error('Apple web flow environment variables not configured');
      return res.status(503).json({ success: false, error: 'Apple Sign-In web flow not configured' });
    }

    // Generate client secret JWT using apple-signin-auth
    const clientSecret = appleSignin.getClientSecret({
      clientID: process.env.APPLE_SERVICES_ID,
      teamID: process.env.APPLE_TEAM_ID,
      privateKey: process.env.APPLE_PRIVATE_KEY,
      keyIdentifier: process.env.APPLE_KEY_ID,
      expAfter: 15777000, // 6 months in seconds (maximum allowed by Apple)
    });

    // Exchange authorization code for tokens
    const tokenResponse = await appleSignin.getAuthorizationToken(code, {
      clientID: process.env.APPLE_SERVICES_ID,
      clientSecret,
      redirectUri: process.env.APPLE_REDIRECT_URI,
    });

    if (!tokenResponse.id_token) {
      return res.status(401).json({ success: false, error: 'Failed to get identity token from Apple' });
    }

    // Verify the id_token - web flow uses Services ID as audience (not App ID)
    const appleIdTokenClaims = await appleSignin.verifyIdToken(tokenResponse.id_token, {
      audience: process.env.APPLE_SERVICES_ID,
    });

    if (!appleIdTokenClaims || !appleIdTokenClaims.sub) {
      return res.status(401).json({ success: false, error: 'Invalid identity token claims' });
    }

    const providerId = `apple_${appleIdTokenClaims.sub}`;
    const email = appleIdTokenClaims.email?.toLowerCase() || `user_${appleIdTokenClaims.sub}@apple.example.com`;
    const provider = 'apple';

    // Check if this Apple account is already linked (reuse existing logic)
    const existingCredential = await pool.query(
      `SELECT ac.user_id FROM auth_credentials ac WHERE ac.provider = $1 AND ac.provider_id = $2`,
      [provider, providerId]
    );

    let userId: string;

    if (existingCredential.rows.length > 0) {
      userId = existingCredential.rows[0].user_id;
      await pool.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [userId]);
    } else {
      // Check for existing user with same email (account linking)
      const existingEmail = await pool.query(
        'SELECT user_id FROM auth_credentials WHERE email = $1',
        [email]
      );

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        if (existingEmail.rows.length > 0) {
          // Link to existing account
          userId = existingEmail.rows[0].user_id;

          await client.query(
            `INSERT INTO auth_credentials (user_id, provider, provider_id, email, email_verified)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (provider, provider_id) DO UPDATE SET updated_at = NOW()`,
            [userId, provider, providerId, email]
          );
        } else {
          // Create new user (maintain backwards compatibility with old ID format)
          userId = providerId;

          await client.query(
            `INSERT INTO users (id, provider, email) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), email = $3`,
            [userId, provider, email]
          );

          await client.query(
            `INSERT INTO auth_credentials (user_id, provider, provider_id, email, email_verified)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (provider, provider_id) DO UPDATE SET updated_at = NOW()`,
            [userId, provider, providerId, email]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Issue short-lived access token + refresh token pair (same as native flow)
    const { accessToken, refreshToken, expiresIn } = await issueTokenPair(userId, provider, email, req);

    logger.info('Apple web sign-in successful', { userId, email });
    res.json({
      success: true,
      token: accessToken, // For backwards compatibility
      accessToken,
      refreshToken,
      expiresIn,
      userId,
      provider,
    });
  } catch (error) {
    logger.error('Apple web sign-in error', { error });
    res.status(401).json({ success: false, error: 'Apple authentication failed' });
  }
});

// Sign in with Google endpoint
app.post('/auth/google', authLimiter, async (req: Request, res: Response) => {
  try {
    const { idToken } = req.body;

    if (!idToken) {
      return res.status(400).json({ success: false, error: 'idToken is required' });
    }

    // Fail-closed: Reject if GOOGLE_CLIENT_ID is not configured
    if (!process.env.GOOGLE_CLIENT_ID) {
      logger.error('GOOGLE_CLIENT_ID not configured - rejecting Google Sign-In');
      return res.status(503).json({
        success: false,
        error: 'Google Sign-In not configured'
      });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    if (!payload || !payload.sub) {
      return res.status(401).json({ success: false, error: 'Invalid token payload' });
    }

    const providerId = `google_${payload.sub}`;
    const email = payload.email?.toLowerCase() || `user_${payload.sub}@google.example.com`;
    const provider = 'google';

    // Check if this Google account is already linked
    const existingCredential = await pool.query(
      `SELECT ac.user_id FROM auth_credentials ac WHERE ac.provider = $1 AND ac.provider_id = $2`,
      [provider, providerId]
    );

    let userId: string;

    if (existingCredential.rows.length > 0) {
      userId = existingCredential.rows[0].user_id;
      await pool.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [userId]);
    } else {
      // Check for existing user with same email (account linking)
      const existingEmail = await pool.query(
        'SELECT user_id FROM auth_credentials WHERE email = $1',
        [email]
      );

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        if (existingEmail.rows.length > 0) {
          // Link to existing account
          userId = existingEmail.rows[0].user_id;

          await client.query(
            `INSERT INTO auth_credentials (user_id, provider, provider_id, email, email_verified)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (provider, provider_id) DO UPDATE SET updated_at = NOW()`,
            [userId, provider, providerId, email]
          );
        } else {
          // Create new user (maintain backwards compatibility with old ID format)
          userId = providerId;

          await client.query(
            `INSERT INTO users (id, provider, email) VALUES ($1, $2, $3)
             ON CONFLICT (id) DO UPDATE SET updated_at = NOW(), email = $3`,
            [userId, provider, email]
          );

          await client.query(
            `INSERT INTO auth_credentials (user_id, provider, provider_id, email, email_verified)
             VALUES ($1, $2, $3, $4, true)
             ON CONFLICT (provider, provider_id) DO UPDATE SET updated_at = NOW()`,
            [userId, provider, providerId, email]
          );
        }

        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // Issue short-lived access token + refresh token pair
    const { accessToken, refreshToken, expiresIn } = await issueTokenPair(userId, provider, email, req);

    res.json({
      success: true,
      token: accessToken, // For backwards compatibility
      accessToken,
      refreshToken,
      expiresIn,
      userId,
      provider
    });
  } catch (error) {
    logger.error('Google authentication error', { error });
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Verify token endpoint (with rate limiting)
app.post('/auth/verify', verifyLimiter, (req: Request, res: Response) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ success: true, decoded });
  } catch (error) {
    res.status(401).json({ success: false, error: 'Invalid token' });
  }
});

// Refresh token endpoint - Exchange a valid refresh token for new access and refresh tokens
// Implements token rotation: each refresh issues a NEW refresh token, old one is invalidated
// Detects token reuse (replay attacks) and revokes entire token family if detected
app.post('/auth/refresh', authLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({ success: false, error: 'Refresh token is required' });
    }

    // Hash the provided refresh token to look it up
    const tokenHash = hashToken(refreshToken);

    // Find the refresh token in the database (including rotation tracking fields)
    const result = await pool.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, rt.token_family, rt.rotated_at,
              rt.device_info, rt.ip_address, u.provider, u.email
       FROM refresh_tokens rt
       JOIN users u ON rt.user_id = u.id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      // Token not found - check if this is a reuse of an already-rotated token
      // This indicates a potential replay attack where an attacker got hold of an old token
      const reuseCheck = await pool.query(
        `SELECT token_family, user_id FROM refresh_tokens WHERE superseded_by = $1`,
        [tokenHash]
      );

      if (reuseCheck.rows.length > 0) {
        // TOKEN REUSE DETECTED! This is a security incident.
        // Revoke the entire token family to protect the user
        const { token_family, user_id } = reuseCheck.rows[0];

        // Log the reuse attempt for security monitoring
        await pool.query(
          `INSERT INTO token_reuse_attempts (token_hash, user_id, token_family, ip_address, user_agent)
           VALUES ($1, $2, $3, $4, $5)`,
          [tokenHash, user_id, token_family, req.ip || null, req.headers['user-agent'] || null]
        );

        // Revoke all tokens in this family
        await pool.query(
          `UPDATE refresh_tokens
           SET revoked_at = NOW(), revoked_reason = 'reuse_detected'
           WHERE token_family = $1 AND revoked_at IS NULL`,
          [token_family]
        );

        logger.warn('Token reuse detected - all sessions revoked', {
          userId: user_id,
          tokenFamily: token_family,
          ip: req.ip
        });

        // Audit log the security incident
        await auditLogger.logAuthEvent(AuditAction.TOKEN_REFRESH, {
          userId: user_id,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          success: false,
          metadata: { reason: 'token_reuse_detected', tokenFamily: token_family }
        });

        return res.status(401).json({
          success: false,
          error: 'Token reuse detected - all sessions revoked for security'
        });
      }

      logger.warn('Refresh attempt with unknown token', { ip: req.ip });
      return res.status(401).json({ success: false, error: 'Invalid refresh token' });
    }

    const tokenRecord = result.rows[0];

    // Check if token has been revoked
    if (tokenRecord.revoked_at) {
      logger.warn('Refresh attempt with revoked token', {
        userId: tokenRecord.user_id,
        ip: req.ip
      });
      return res.status(401).json({ success: false, error: 'Refresh token has been revoked' });
    }

    // Check if token has already been rotated (used)
    // This catches the case where the original token is used but superseded_by wasn't found
    // (e.g., if the new token was also already used and rotated)
    if (tokenRecord.rotated_at) {
      logger.warn('Refresh attempt with already-rotated token', {
        userId: tokenRecord.user_id,
        ip: req.ip
      });

      // Log the reuse attempt
      await pool.query(
        `INSERT INTO token_reuse_attempts (token_hash, user_id, token_family, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5)`,
        [tokenHash, tokenRecord.user_id, tokenRecord.token_family, req.ip || null, req.headers['user-agent'] || null]
      );

      // Revoke entire family as a precaution
      await pool.query(
        `UPDATE refresh_tokens
         SET revoked_at = NOW(), revoked_reason = 'reuse_detected'
         WHERE token_family = $1 AND revoked_at IS NULL`,
        [tokenRecord.token_family]
      );

      await auditLogger.logAuthEvent(AuditAction.TOKEN_REFRESH, {
        userId: tokenRecord.user_id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: false,
        metadata: { reason: 'already_rotated_token_reuse', tokenFamily: tokenRecord.token_family }
      });

      return res.status(401).json({
        success: false,
        error: 'Refresh token has already been used'
      });
    }

    // Check if token has expired
    if (new Date() > new Date(tokenRecord.expires_at)) {
      logger.info('Refresh attempt with expired token', { userId: tokenRecord.user_id });
      return res.status(401).json({ success: false, error: 'Refresh token has expired' });
    }

    // Generate new refresh token (token rotation)
    const { token: newRefreshToken, tokenHash: newTokenHash, expires: newExpiresAt } = generateRefreshToken();

    // Use transaction to atomically rotate the token
    await pool.query('BEGIN');

    try {
      // Mark old token as rotated and link to new token
      await pool.query(
        `UPDATE refresh_tokens
         SET rotated_at = NOW(), superseded_by = $1, last_used_at = NOW()
         WHERE id = $2`,
        [newTokenHash, tokenRecord.id]
      );

      // Insert new token in the same token family
      await pool.query(
        `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, device_info, ip_address, token_family)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          tokenRecord.user_id,
          newTokenHash,
          newExpiresAt,
          tokenRecord.device_info || req.headers['user-agent']?.substring(0, 500) || null,
          req.ip || req.socket.remoteAddress || null,
          tokenRecord.token_family
        ]
      );

      await pool.query('COMMIT');
    } catch (txError) {
      await pool.query('ROLLBACK');
      throw txError;
    }

    // Generate new short-lived access token
    const accessToken = jwt.sign(
      { userId: tokenRecord.user_id, provider: tokenRecord.provider, email: tokenRecord.email },
      JWT_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    // Audit log: successful token refresh with rotation
    await auditLogger.logAuthEvent(AuditAction.TOKEN_REFRESH, {
      userId: tokenRecord.user_id,
      email: tokenRecord.email,
      provider: tokenRecord.provider,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: { rotated: true, tokenFamily: tokenRecord.token_family }
    });

    logger.info('Access token refreshed with rotation', {
      userId: tokenRecord.user_id,
      tokenFamily: tokenRecord.token_family
    });

    res.json({
      success: true,
      accessToken,
      refreshToken: newRefreshToken, // Return the NEW rotated refresh token
      expiresIn: 15 * 60 // 15 minutes in seconds
    });
  } catch (error) {
    logger.error('Token refresh error', { error });
    res.status(500).json({ success: false, error: 'Token refresh failed' });
  }
});

// Logout endpoint - Revoke refresh token
app.post('/auth/logout', authLimiter, async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      // If no refresh token provided, just acknowledge the logout
      // (client-side will clear access token)
      return res.json({ success: true, message: 'Logged out successfully' });
    }

    // Hash the provided refresh token
    const tokenHash = hashToken(refreshToken);

    // Revoke the refresh token
    const result = await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW(), revoked_reason = 'logout'
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING user_id`,
      [tokenHash]
    );

    if (result.rows.length > 0) {
      // Audit log: logout
      await auditLogger.logAuthEvent(AuditAction.LOGOUT, {
        userId: result.rows[0].user_id,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        success: true,
      });

      logger.info('User logged out, refresh token revoked', { userId: result.rows[0].user_id });
    }

    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error) {
    logger.error('Logout error', { error });
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// Logout from all devices - Revoke all refresh tokens for a user
app.post('/auth/logout-all', authLimiter, async (req: Request, res: Response) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    let decoded: any;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid token' });
    }

    const userId = decoded.userId;

    // Revoke all active refresh tokens for this user
    const result = await pool.query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW(), revoked_reason = 'logout_all'
       WHERE user_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [userId]
    );

    // Audit log: logout from all devices
    await auditLogger.logAuthEvent(AuditAction.LOGOUT_ALL_DEVICES, {
      userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      success: true,
      metadata: { tokensRevoked: result.rows.length },
    });

    logger.info('User logged out from all devices', {
      userId,
      tokensRevoked: result.rows.length
    });

    res.json({
      success: true,
      message: 'Logged out from all devices',
      tokensRevoked: result.rows.length
    });
  } catch (error) {
    logger.error('Logout all error', { error });
    res.status(500).json({ success: false, error: 'Logout failed' });
  }
});

// Check subscription status endpoint
app.get('/auth/subscription-status', generalLimiter, authenticateJWT, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;

    // Query user_subscriptions table for active subscription
    const result = await pool.query(
      `SELECT is_active, expires_at, product_id, entitlement_id
       FROM user_subscriptions
       WHERE user_id = $1
         AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY expires_at DESC NULLS FIRST
       LIMIT 1`,
      [userId]
    );

    if (result.rows.length > 0) {
      const sub = result.rows[0];
      return res.json({
        success: true,
        isPremium: true,
        subscription: {
          productId: sub.product_id,
          entitlementId: sub.entitlement_id,
          expiresAt: sub.expires_at
        }
      });
    }

    res.json({
      success: true,
      isPremium: false,
      subscription: null
    });
  } catch (error) {
    logger.error('Error checking subscription status', { error });
    res.status(500).json({ success: false, error: 'Failed to check subscription status' });
  }
});

// Email registration endpoint
app.post('/auth/email/register', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password, inviteCode } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Validate password
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
    }

    // Validate invite code if provided
    let referrerId: string | null = null;
    if (inviteCode) {
      const codeResult = await pool.query(
        `SELECT owner_id, used_by_id FROM invite_codes WHERE code = $1`,
        [inviteCode.toUpperCase()]
      );
      if (codeResult.rows.length === 0) {
        return res.status(400).json({ success: false, error: 'Invalid invite code' });
      }
      if (codeResult.rows[0].used_by_id) {
        return res.status(400).json({ success: false, error: 'Invite code has already been used' });
      }
      referrerId = codeResult.rows[0].owner_id;
    }

    // Check if email already exists
    const existingUser = await pool.query(
      'SELECT user_id FROM auth_credentials WHERE email = $1',
      [email.toLowerCase()]
    );

    if (existingUser.rows.length > 0) {
      // Don't reveal that account exists - return same success message
      // but don't send verification email (user already has an account)
      logger.info('Registration attempted for existing email', { email: email.toLowerCase() });
      return res.json({
        success: true,
        message: 'Registration successful. Please check your email to verify your account.'
      });
    }

    // Generate user ID and hash password
    const userId = `email_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const passwordHash = await hashPassword(password);
    const { token: verificationToken, tokenHash: verificationTokenHash, expires: verificationExpires } = generateVerificationToken();

    // Create user and auth credential in transaction
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create user (with optional referred_by)
      await client.query(
        `INSERT INTO users (id, provider, email, referred_by) VALUES ($1, $2, $3, $4)`,
        [userId, 'email', email.toLowerCase(), referrerId]
      );

      // Create auth credential
      // SECURITY: Store hash of verification token, not the raw token
      await client.query(
        `INSERT INTO auth_credentials
         (user_id, provider, email, password_hash, email_verified, verification_token_hash, verification_expires)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [userId, 'email', email.toLowerCase(), passwordHash, false, verificationTokenHash, verificationExpires]
      );

      // If invite code was used, mark it as used and award signup bonus
      if (inviteCode && referrerId) {
        await client.query(
          `UPDATE invite_codes SET used_by_id = $1, used_at = NOW() WHERE code = $2`,
          [userId, inviteCode.toUpperCase()]
        );

        // Award signup bonus ticket to new user
        await client.query(
          `INSERT INTO ticket_ledger (user_id, amount, reason, reference_id) VALUES ($1, 1, 'signup_bonus', $2)`,
          [userId, inviteCode.toUpperCase()]
        );

        logger.info('Invite code redeemed', { userId, inviteCode, referrerId });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Send verification email
    await emailService.sendVerificationEmail(email, verificationToken);

    logger.info('User registered', { userId, email: email.toLowerCase(), inviteCode: inviteCode || null });
    res.json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.'
    });
  } catch (error) {
    logger.error('Email registration error', { error });
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// Email verification endpoint
// Returns HTML when accessed from browser (email link click), JSON for API clients
app.get('/auth/email/verify', verifyLimiter, async (req: Request, res: Response) => {
  const isBrowser = req.headers.accept?.includes('text/html');

  const sendVerificationPage = (title: string, message: string, success: boolean) => {
    if (!isBrowser) return; // Only for browser requests
    const color = success ? '#6B46C1' : '#DC2626';
    const icon = success ? '&#10003;' : '&#10007;';
    res.send(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f5f5f5;color:#333}
.card{background:#fff;border-radius:12px;padding:48px;max-width:420px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.1)}
.icon{width:64px;height:64px;border-radius:50%;background:${color};color:#fff;font-size:32px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
h1{font-size:24px;margin:0 0 12px}p{color:#666;line-height:1.6;margin:0}
.logo{font-size:28px;font-weight:bold;color:#6B46C1;margin-bottom:24px}</style></head>
<body><div class="card"><div class="logo">VLVT</div><div class="icon">${icon}</div><h1>${title}</h1><p>${message}</p></div></body></html>`);
  };

  try {
    const { token } = req.query;

    if (!token || typeof token !== 'string') {
      if (isBrowser) return sendVerificationPage('Invalid Link', 'This verification link is invalid. Please request a new verification email from the app.', false);
      return res.status(400).json({ success: false, error: 'Verification token is required' });
    }

    // SECURITY: Hash the submitted token to look up in database
    const tokenHash = hashToken(token);

    // Find credential by hashed token
    const result = await pool.query(
      `SELECT user_id, email, verification_expires
       FROM auth_credentials
       WHERE verification_token_hash = $1 AND provider = 'email'`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      if (isBrowser) return sendVerificationPage('Link Expired', 'This verification link has already been used or is invalid. If your email is already verified, you can log in from the app.', false);
      return res.status(400).json({ success: false, error: 'Invalid or expired verification token' });
    }

    const credential = result.rows[0];

    // Check if token expired
    if (isTokenExpired(credential.verification_expires)) {
      if (isBrowser) return sendVerificationPage('Link Expired', 'This verification link has expired. Please request a new verification email from the app.', false);
      return res.status(400).json({ success: false, error: 'Verification token has expired' });
    }

    // Mark as verified and clear token hash
    await pool.query(
      `UPDATE auth_credentials
       SET email_verified = true, verification_token_hash = NULL, verification_expires = NULL, updated_at = NOW()
       WHERE user_id = $1 AND provider = 'email'`,
      [credential.user_id]
    );

    // Issue short-lived access token + refresh token pair for auto-login
    const { accessToken, refreshToken, expiresIn } = await issueTokenPair(
      credential.user_id,
      'email',
      credential.email,
      req
    );

    logger.info('Email verified', { userId: credential.user_id });

    // Award verification ticket (one-time)
    try {
      const existingVerificationTicket = await pool.query(
        `SELECT id FROM ticket_ledger WHERE user_id = $1 AND reason = 'verification'`,
        [credential.user_id]
      );
      if (existingVerificationTicket.rows.length === 0) {
        await awardTickets(credential.user_id, 1, 'verification', credential.user_id);
        logger.info('Awarded verification ticket', { userId: credential.user_id });
      }
    } catch (ticketError) {
      logger.error('Failed to award verification ticket', { error: ticketError, userId: credential.user_id });
      // Don't fail the verification if ticket awarding fails
    }

    if (isBrowser) {
      return sendVerificationPage('Email Verified!', 'Your email has been verified successfully. You can now go back to the VLVT app and log in.', true);
    }

    res.json({
      success: true,
      message: 'Email verified successfully',
      token: accessToken, // For backwards compatibility
      accessToken,
      refreshToken,
      expiresIn,
      userId: credential.user_id
    });
  } catch (error) {
    logger.error('Email verification error', { error });
    if (isBrowser) return sendVerificationPage('Verification Failed', 'Something went wrong. Please try again or request a new verification email from the app.', false);
    res.status(500).json({ success: false, error: 'Verification failed' });
  }
});

// Account lockout configuration
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Helper function to record a failed login attempt
 * Returns lockout status and remaining time if locked
 */
async function recordFailedLogin(
  email: string,
  ipAddress: string | undefined,
  userAgent: string | undefined,
  failureReason: string = 'invalid_password'
): Promise<{ isLocked: boolean; lockedUntil: Date | null; failedAttempts: number }> {
  try {
    const result = await pool.query(
      `SELECT * FROM record_failed_login($1, $2, $3, $4)`,
      [email.toLowerCase(), ipAddress || null, userAgent?.substring(0, 500) || null, failureReason]
    );

    if (result.rows.length > 0) {
      return {
        isLocked: result.rows[0].is_locked,
        lockedUntil: result.rows[0].locked_until_ts,
        failedAttempts: result.rows[0].failed_attempt_count
      };
    }
  } catch (err) {
    // If the function doesn't exist (migration not run), fall back to direct update
    logger.warn('record_failed_login function not available, using fallback', { error: err });

    // Fallback: Update auth_credentials directly
    const updateResult = await pool.query(
      `UPDATE auth_credentials
       SET failed_attempts = COALESCE(failed_attempts, 0) + 1,
           locked_until = CASE
             WHEN COALESCE(failed_attempts, 0) + 1 >= $2
             THEN NOW() + INTERVAL '${LOCKOUT_DURATION_MINUTES} minutes'
             ELSE locked_until
           END,
           updated_at = NOW()
       WHERE email = $1 AND provider = 'email'
       RETURNING failed_attempts, locked_until`,
      [email.toLowerCase(), MAX_LOGIN_ATTEMPTS]
    );

    if (updateResult.rows.length > 0) {
      return {
        isLocked: updateResult.rows[0].locked_until !== null && new Date(updateResult.rows[0].locked_until) > new Date(),
        lockedUntil: updateResult.rows[0].locked_until,
        failedAttempts: updateResult.rows[0].failed_attempts
      };
    }
  }

  return { isLocked: false, lockedUntil: null, failedAttempts: 0 };
}

/**
 * Helper function to record a successful login
 * Resets failed attempts counter and clears any lock
 */
async function recordSuccessfulLogin(
  userId: string,
  email: string,
  ipAddress: string | undefined,
  userAgent: string | undefined
): Promise<void> {
  try {
    await pool.query(
      `SELECT record_successful_login($1, $2, $3, $4)`,
      [userId, email.toLowerCase(), ipAddress || null, userAgent?.substring(0, 500) || null]
    );
  } catch (err) {
    // If the function doesn't exist (migration not run), fall back to direct update
    logger.warn('record_successful_login function not available, using fallback', { error: err });

    await pool.query(
      `UPDATE auth_credentials
       SET failed_attempts = 0, locked_until = NULL, updated_at = NOW()
       WHERE email = $1 AND provider = 'email'`,
      [email.toLowerCase()]
    );
  }
}

/**
 * Helper function to check if account is locked
 */
async function checkAccountLocked(email: string): Promise<{ isLocked: boolean; lockedUntil: Date | null }> {
  try {
    // Try using the database function first
    const result = await pool.query(
      `SELECT is_account_locked($1) as is_locked`,
      [email.toLowerCase()]
    );

    if (result.rows.length > 0 && result.rows[0].is_locked) {
      // Get the locked_until timestamp
      const lockResult = await pool.query(
        `SELECT locked_until FROM auth_credentials WHERE email = $1 AND provider = 'email'`,
        [email.toLowerCase()]
      );
      return {
        isLocked: true,
        lockedUntil: lockResult.rows[0]?.locked_until || null
      };
    }
    return { isLocked: false, lockedUntil: null };
  } catch (err) {
    // If the function doesn't exist, check directly
    logger.warn('is_account_locked function not available, using fallback', { error: err });

    const result = await pool.query(
      `SELECT locked_until FROM auth_credentials WHERE email = $1 AND provider = 'email'`,
      [email.toLowerCase()]
    );

    if (result.rows.length > 0 && result.rows[0].locked_until) {
      const lockedUntil = new Date(result.rows[0].locked_until);
      if (lockedUntil > new Date()) {
        return { isLocked: true, lockedUntil };
      }
      // Lock expired, clear it
      await pool.query(
        `UPDATE auth_credentials SET locked_until = NULL, failed_attempts = 0 WHERE email = $1 AND provider = 'email'`,
        [email.toLowerCase()]
      );
    }
    return { isLocked: false, lockedUntil: null };
  }
}

// Email login endpoint
// This endpoint demonstrates the enhanced error code system for secure error handling
app.post('/auth/email/login', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      // Using enhanced error codes - VAL_MISSING_FIELDS
      // This returns a generic message to the client while logging details internally
      return sendError(res, ErrorCodes.VAL_MISSING_FIELDS, undefined, {
        path: req.path,
        method: req.method,
        logContext: { missingFields: !email ? 'email' : 'password' },
      });
    }

    const ipAddress = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];

    // Check if account is locked BEFORE attempting authentication
    const lockStatus = await checkAccountLocked(email);
    if (lockStatus.isLocked) {
      const remainingMinutes = lockStatus.lockedUntil
        ? Math.ceil((lockStatus.lockedUntil.getTime() - Date.now()) / (1000 * 60))
        : LOCKOUT_DURATION_MINUTES;

      // Using enhanced error codes - AUTH_ACCOUNT_LOCKED
      // This is an alertable error that will be logged at error level
      return sendError(res, ErrorCodes.AUTH_ACCOUNT_LOCKED, undefined, {
        path: req.path,
        method: req.method,
        retryAfter: remainingMinutes * 60, // seconds for Retry-After header
        logContext: {
          email: email.toLowerCase(),
          ip: ipAddress,
          lockedUntil: lockStatus.lockedUntil?.toISOString(),
          remainingMinutes,
        },
      });
    }

    // Find credential
    const result = await pool.query(
      `SELECT ac.user_id, ac.email, ac.password_hash, ac.email_verified, ac.failed_attempts, u.provider
       FROM auth_credentials ac
       JOIN users u ON ac.user_id = u.id
       WHERE ac.email = $1 AND ac.provider = 'email'`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // User doesn't exist - don't reveal this, return generic error
      // Using enhanced error codes - AUTH_INVALID_CREDENTIALS
      // This prevents account enumeration by returning the same error for non-existent users
      return sendError(res, ErrorCodes.AUTH_INVALID_CREDENTIALS, undefined, {
        path: req.path,
        method: req.method,
        logContext: {
          reason: 'user_not_found',
          attemptedEmail: email.toLowerCase(),
          ip: ipAddress,
        },
      });
    }

    const credential = result.rows[0];

    // Verify password
    const passwordValid = await verifyPassword(password, credential.password_hash);
    if (!passwordValid) {
      // Record failed attempt and check if account should be locked
      const failResult = await recordFailedLogin(email, ipAddress, userAgent, 'invalid_password');

      // Audit log: failed login
      await auditLogger.logAuthEvent(AuditAction.LOGIN_FAILURE, {
        userId: credential.user_id,
        email: email.toLowerCase(),
        provider: 'email',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Invalid password',
        metadata: {
          failedAttempts: failResult.failedAttempts,
          isNowLocked: failResult.isLocked,
        },
      });

      logger.warn('Failed login attempt', {
        email: email.toLowerCase(),
        ip: ipAddress,
        failedAttempts: failResult.failedAttempts,
        isNowLocked: failResult.isLocked
      });

      if (failResult.isLocked) {
        // Audit log: account locked
        await auditLogger.logAuthEvent(AuditAction.ACCOUNT_LOCKED, {
          userId: credential.user_id,
          email: email.toLowerCase(),
          provider: 'email',
          ipAddress,
          userAgent,
          success: true,
          metadata: {
            lockedUntil: failResult.lockedUntil?.toISOString(),
            failedAttempts: failResult.failedAttempts,
          },
        });

        // Using enhanced error codes - AUTH_ACCOUNT_LOCKED
        return sendError(res, ErrorCodes.AUTH_ACCOUNT_LOCKED, undefined, {
          path: req.path,
          method: req.method,
          userId: credential.user_id,
          retryAfter: LOCKOUT_DURATION_MINUTES * 60,
          logContext: {
            email: email.toLowerCase(),
            ip: ipAddress,
            lockedUntil: failResult.lockedUntil?.toISOString(),
            failedAttempts: failResult.failedAttempts,
          },
        });
      }

      // Using enhanced error codes - AUTH_INVALID_CREDENTIALS
      // Same error code for wrong password as for non-existent user (prevents enumeration)
      return sendError(res, ErrorCodes.AUTH_INVALID_CREDENTIALS, undefined, {
        path: req.path,
        method: req.method,
        userId: credential.user_id,
        logContext: {
          reason: 'invalid_password',
          email: email.toLowerCase(),
          ip: ipAddress,
          failedAttempts: failResult.failedAttempts,
        },
      });
    }

    // Check if email is verified
    if (!credential.email_verified) {
      // Record this as a failed attempt too (prevents abuse of unverified accounts)
      await recordFailedLogin(email, ipAddress, userAgent, 'email_not_verified');

      // Audit log: login failed due to unverified email
      await auditLogger.logAuthEvent(AuditAction.LOGIN_FAILURE, {
        userId: credential.user_id,
        email: email.toLowerCase(),
        provider: 'email',
        ipAddress,
        userAgent,
        success: false,
        errorMessage: 'Email not verified',
      });

      // Using enhanced error codes - AUTH_EMAIL_NOT_VERIFIED
      return sendError(res, ErrorCodes.AUTH_EMAIL_NOT_VERIFIED, undefined, {
        path: req.path,
        method: req.method,
        userId: credential.user_id,
        logContext: {
          email: email.toLowerCase(),
          ip: ipAddress,
        },
      });
    }

    // Successful login - reset failed attempts counter
    await recordSuccessfulLogin(credential.user_id, email, ipAddress, userAgent);

    await pool.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [credential.user_id]);

    // Issue short-lived access token + refresh token pair
    const { accessToken, refreshToken, expiresIn } = await issueTokenPair(
      credential.user_id,
      'email',
      credential.email,
      req
    );

    // Audit log: successful login
    await auditLogger.logAuthEvent(AuditAction.LOGIN_SUCCESS, {
      userId: credential.user_id,
      email: credential.email,
      provider: 'email',
      ipAddress,
      userAgent,
      success: true,
    });

    logger.info('User logged in', { userId: credential.user_id, provider: 'email' });
    res.json({
      success: true,
      token: accessToken, // For backwards compatibility
      accessToken,
      refreshToken,
      expiresIn,
      userId: credential.user_id,
      provider: 'email'
    });
  } catch (error) {
    logger.error('Email login error', { error });
    res.status(500).json({ success: false, error: 'Login failed' });
  }
});

// Forgot password endpoint
app.post('/auth/email/forgot', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    // Always return success to prevent email enumeration
    const successResponse = {
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.'
    };

    const result = await pool.query(
      `SELECT user_id, email FROM auth_credentials WHERE email = $1 AND provider = 'email'`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      // Add random delay to prevent timing attacks (100-300ms)
      await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 200));
      return res.json(successResponse);
    }

    const credential = result.rows[0];
    const { token: resetToken, tokenHash: resetTokenHash, expires: resetExpires } = generateResetToken();

    // SECURITY: Store hash of reset token, not the raw token
    await pool.query(
      `UPDATE auth_credentials SET reset_token_hash = $1, reset_expires = $2, updated_at = NOW()
       WHERE user_id = $3 AND provider = 'email'`,
      [resetTokenHash, resetExpires, credential.user_id]
    );

    // Send the raw token via email - user will submit this, we'll hash it to compare
    await emailService.sendPasswordResetEmail(credential.email, resetToken);

    logger.info('Password reset requested', { userId: credential.user_id });
    res.json(successResponse);
  } catch (error) {
    logger.error('Forgot password error', { error });
    res.status(500).json({ success: false, error: 'Request failed' });
  }
});

// Reset password endpoint
app.post('/auth/email/reset', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ success: false, error: 'Token and new password are required' });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        success: false,
        error: 'Password does not meet requirements',
        details: passwordValidation.errors
      });
    }

    // SECURITY: Hash the provided token to compare with stored hash
    const tokenHash = hashToken(token);

    const result = await pool.query(
      `SELECT user_id, reset_expires FROM auth_credentials WHERE reset_token_hash = $1 AND provider = 'email'`,
      [tokenHash]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ success: false, error: 'Invalid or expired reset token' });
    }

    const credential = result.rows[0];

    if (isTokenExpired(credential.reset_expires)) {
      return res.status(400).json({ success: false, error: 'Reset token has expired' });
    }

    const passwordHash = await hashPassword(newPassword);
    await pool.query(
      `UPDATE auth_credentials SET password_hash = $1, reset_token_hash = NULL, reset_expires = NULL, updated_at = NOW()
       WHERE user_id = $2 AND provider = 'email'`,
      [passwordHash, credential.user_id]
    );

    // Audit log: password reset successful
    await auditLogger.logDataChange(AuditAction.PASSWORD_RESET_SUCCESS, {
      userId: credential.user_id,
      resourceType: AuditResourceType.AUTH_CREDENTIAL,
      resourceId: credential.user_id,
      oldValue: { hasResetToken: true },
      newValue: { hasResetToken: false, passwordChanged: true },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    logger.info('Password reset successful', { userId: credential.user_id });
    res.json({ success: true, message: 'Password has been reset successfully' });
  } catch (error) {
    logger.error('Reset password error', { error });
    res.status(500).json({ success: false, error: 'Reset failed' });
  }
});

// Resend verification email endpoint
app.post('/auth/email/resend-verification', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const result = await pool.query(
      `SELECT user_id, email, email_verified FROM auth_credentials WHERE email = $1 AND provider = 'email'`,
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, message: 'If the account exists and is unverified, a verification email has been sent.' });
    }

    const credential = result.rows[0];

    if (credential.email_verified) {
      // Don't reveal verification status
      return res.json({ success: true, message: 'If the account exists and is unverified, a verification email has been sent.' });
    }

    const { token: verificationToken, tokenHash: verificationTokenHash, expires: verificationExpires } = generateVerificationToken();

    // SECURITY: Store hash of verification token, not the raw token
    await pool.query(
      `UPDATE auth_credentials SET verification_token_hash = $1, verification_expires = $2, updated_at = NOW()
       WHERE user_id = $3 AND provider = 'email'`,
      [verificationTokenHash, verificationExpires, credential.user_id]
    );

    // Send raw token via email - user will submit this, we'll hash it to compare
    await emailService.sendVerificationEmail(credential.email, verificationToken);

    logger.info('Verification email resent', { userId: credential.user_id });
    res.json({ success: true, message: 'Verification email has been sent.' });
  } catch (error) {
    logger.error('Resend verification error', { error });
    res.status(500).json({ success: false, error: 'Failed to resend verification email' });
  }
});

// Instagram OAuth endpoint
app.post('/auth/instagram', authLimiter, async (req: Request, res: Response) => {
  try {
    // SECURITY: Only accept authorization codes, never direct access tokens
    // Direct token acceptance allows token injection attacks
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ success: false, error: 'Authorization code is required' });
    }

    let accessToken: string | undefined;

    // Exchange authorization code for access token
    {
      const clientId = process.env.INSTAGRAM_CLIENT_ID;
      const clientSecret = process.env.INSTAGRAM_CLIENT_SECRET;
      const redirectUri = process.env.INSTAGRAM_REDIRECT_URI || 'https://getvlvt.vip/auth/instagram/callback';

      if (!clientId || !clientSecret) {
        logger.error('Instagram OAuth not configured: missing INSTAGRAM_CLIENT_ID or INSTAGRAM_CLIENT_SECRET');
        return res.status(500).json({ success: false, error: 'Instagram authentication not configured' });
      }

      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
          code: code,
        }),
      });

      if (!tokenResponse.ok) {
        const errorData = await tokenResponse.text();
        logger.error('Failed to exchange Instagram code for token', { error: errorData });
        return res.status(401).json({ success: false, error: 'Failed to authenticate with Instagram' });
      }

      const tokenData = await tokenResponse.json() as { access_token?: string };
      accessToken = tokenData.access_token;

      if (!accessToken) {
        return res.status(401).json({ success: false, error: 'No access token received from Instagram' });
      }
    }

    // Verify Instagram token and get user info
    // Security: Use Authorization header instead of query parameter to avoid token exposure in logs
    const igResponse = await fetch(
      'https://graph.instagram.com/me?fields=id,username',
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`
        }
      }
    );

    if (!igResponse.ok) {
      return res.status(401).json({ success: false, error: 'Invalid Instagram access token' });
    }

    const igUser = await igResponse.json() as { id?: string; username?: string };

    if (!igUser.id) {
      return res.status(401).json({ success: false, error: 'Failed to get Instagram user info' });
    }

    const providerId = `instagram_${igUser.id}`;

    // Check if this Instagram account is already linked
    const existingCredential = await pool.query(
      `SELECT ac.user_id, ac.email, ac.email_verified, u.email as user_email
       FROM auth_credentials ac
       JOIN users u ON ac.user_id = u.id
       WHERE ac.provider = 'instagram' AND ac.provider_id = $1`,
      [providerId]
    );

    if (existingCredential.rows.length > 0) {
      const credential = existingCredential.rows[0];

      // If they have a verified email, log them in
      if (credential.email && credential.email_verified) {
        // Issue short-lived access token + refresh token pair
        const { accessToken, refreshToken, expiresIn } = await issueTokenPair(
          credential.user_id,
          'instagram',
          credential.email,
          req
        );

        return res.json({
          success: true,
          token: accessToken, // For backwards compatibility
          accessToken,
          refreshToken,
          expiresIn,
          userId: credential.user_id,
          provider: 'instagram'
        });
      } else {
        // Need to collect/verify email
        const tempToken = jwt.sign(
          { igUserId: igUser.id, igUsername: igUser.username, userId: credential.user_id },
          JWT_SECRET,
          { expiresIn: '15m' }
        );

        return res.json({
          success: true,
          needsEmail: true,
          tempToken,
          username: igUser.username
        });
      }
    }

    // New Instagram user - needs to provide email
    const tempToken = jwt.sign(
      { igUserId: igUser.id, igUsername: igUser.username, isNew: true },
      JWT_SECRET,
      { expiresIn: '15m' }
    );

    res.json({
      success: true,
      needsEmail: true,
      tempToken,
      username: igUser.username
    });
  } catch (error) {
    logger.error('Instagram authentication error', { error });
    res.status(500).json({ success: false, error: 'Authentication failed' });
  }
});

// Instagram complete registration (collect email)
app.post('/auth/instagram/complete', authLimiter, async (req: Request, res: Response) => {
  try {
    const { tempToken, email } = req.body;

    if (!tempToken || !email) {
      return res.status(400).json({ success: false, error: 'Temp token and email are required' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, error: 'Invalid email format' });
    }

    // Verify temp token
    let decoded: any;
    try {
      decoded = jwt.verify(tempToken, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }

    const { igUserId, igUsername, userId: existingUserId, isNew } = decoded;
    const providerId = `instagram_${igUserId}`;
    const normalizedEmail = email.toLowerCase();

    // Check if email already exists (for account linking)
    const existingEmail = await pool.query(
      'SELECT user_id FROM auth_credentials WHERE email = $1',
      [normalizedEmail]
    );

    let userId: string;
    const { token: verificationToken, tokenHash: verificationTokenHash, expires: verificationExpires } = generateVerificationToken();

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      if (existingEmail.rows.length > 0) {
        // Link Instagram to existing account
        userId = existingEmail.rows[0].user_id;

        // SECURITY: Store hash of verification token, not the raw token
        await client.query(
          `INSERT INTO auth_credentials
           (user_id, provider, provider_id, email, email_verified, verification_token_hash, verification_expires)
           VALUES ($1, 'instagram', $2, $3, false, $4, $5)
           ON CONFLICT (provider, provider_id) DO UPDATE SET
             email = $3, verification_token_hash = $4, verification_expires = $5, updated_at = NOW()`,
          [userId, providerId, normalizedEmail, verificationTokenHash, verificationExpires]
        );
      } else if (existingUserId) {
        // Update existing Instagram credential with email
        userId = existingUserId;

        // SECURITY: Store hash of verification token, not the raw token
        await client.query(
          `UPDATE auth_credentials
           SET email = $1, verification_token_hash = $2, verification_expires = $3, updated_at = NOW()
           WHERE user_id = $4 AND provider = 'instagram'`,
          [normalizedEmail, verificationTokenHash, verificationExpires, userId]
        );

        await client.query(
          'UPDATE users SET email = $1, updated_at = NOW() WHERE id = $2',
          [normalizedEmail, userId]
        );
      } else {
        // Create new user
        userId = `instagram_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

        await client.query(
          'INSERT INTO users (id, provider, email) VALUES ($1, $2, $3)',
          [userId, 'instagram', normalizedEmail]
        );

        // SECURITY: Store hash of verification token, not the raw token
        await client.query(
          `INSERT INTO auth_credentials
           (user_id, provider, provider_id, email, email_verified, verification_token_hash, verification_expires)
           VALUES ($1, 'instagram', $2, $3, false, $4, $5)`,
          [userId, providerId, normalizedEmail, verificationTokenHash, verificationExpires]
        );
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Send verification email
    await emailService.sendVerificationEmail(normalizedEmail, verificationToken);

    logger.info('Instagram registration completed', { userId, email: normalizedEmail });
    res.json({
      success: true,
      message: 'Please check your email to verify your account.',
      userId
    });
  } catch (error) {
    logger.error('Instagram complete error', { error });
    res.status(500).json({ success: false, error: 'Registration failed' });
  }
});

// ===== ACCOUNT DELETION ENDPOINT =====
// Required for Play Store compliance - allows users to delete their account
// GDPR Article 17 - Right to Erasure: Includes R2 photo deletion

app.delete('/auth/account', generalLimiter, authenticateJWT, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const client = await pool.connect();

  try {
    logger.info('Account deletion requested', { userId });

    // ===== GDPR: R2 Photo Cleanup =====
    // Fetch photo keys BEFORE database deletion (CASCADE would lose this data)
    // Photo deletion is best-effort - failures don't block account deletion
    const photosResult = await pool.query(
      'SELECT photos FROM profiles WHERE user_id = $1',
      [userId]
    );
    const photoKeys: string[] = photosResult.rows[0]?.photos || [];

    if (photoKeys.length > 0) {
      const profileServiceUrl = process.env.PROFILE_SERVICE_URL || 'http://localhost:3002';
      const internalPath = '/api/internal/cleanup-photos';
      const requestBody = { userId, photoKeys };

      try {
        // Call profile-service internal endpoint to delete photos from R2
        // Uses HMAC-signed headers for secure service-to-service authentication
        const signedHeaders = signInternalServiceRequest(
          'auth-service',
          'POST',
          internalPath,
          requestBody
        );

        await axios.post(
          `${profileServiceUrl}${internalPath}`,
          requestBody,
          {
            headers: signedHeaders,
            timeout: 30000 // 30 second timeout for R2 operations
          }
        );
        logger.info('R2 photos deleted for account deletion', { userId, photoCount: photoKeys.length });
      } catch (photoError) {
        // Log but don't block account deletion - Right to Erasure takes priority
        logger.warn('Failed to delete R2 photos during account deletion', {
          userId,
          error: (photoError as Error).message,
          photoCount: photoKeys.length
        });
      }
    }

    await client.query('BEGIN');

    // Delete user from users table - CASCADE will delete:
    // - profiles
    // - matches (as user_id_1 or user_id_2)
    // - messages (as sender_id)
    // - blocks (as user_id or blocked_user_id)
    // - reports (as reporter_id - reported_user reports are kept anonymized)
    // - auth_credentials
    // - refresh_tokens
    // - fcm_tokens
    // - user_status
    // - user_subscriptions
    // - swipes
    // - verifications
    // - kycaid_verifications
    // - login_attempts
    // - golden_tickets / golden_ticket_redemptions
    // - date_proposals (via matches CASCADE)
    // - after_hours_profiles
    // - after_hours_preferences
    // - after_hours_sessions (+ declines, matches, messages via CASCADE)
    // - device_fingerprints
    // - user_consents

    const result = await client.query(
      'DELETE FROM users WHERE id = $1 RETURNING id',
      [userId]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Account not found' });
    }

    await client.query('COMMIT');

    logger.info('Account deleted successfully', { userId });

    res.json({
      success: true,
      message: 'Your account and all associated data have been permanently deleted.'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Account deletion failed', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to delete account' });
  } finally {
    client.release();
  }
});

// ===== CONSENT MANAGEMENT ENDPOINTS =====
// GDPR-02, GDPR-05: Granular consent with withdrawal support

// Current privacy policy version (update when policy changes)
const CURRENT_CONSENT_VERSION = '2026-01-24';

/**
 * GET /auth/consents - Get user's current consent status
 * Returns all consent purposes with their current state
 */
app.get('/auth/consents', generalLimiter, authenticateJWT, async (req: Request, res: Response) => {
  const userId = req.user!.userId;

  try {
    const result = await pool.query(
      `SELECT purpose, granted, granted_at, withdrawn_at, consent_version
       FROM user_consents
       WHERE user_id = $1`,
      [userId]
    );

    // Return all purposes with defaults for missing ones
    const allPurposes = ['location_discovery', 'marketing', 'analytics', 'after_hours'];
    const consents = allPurposes.map(purpose => {
      const existing = result.rows.find(r => r.purpose === purpose);
      return {
        purpose,
        granted: existing?.granted || false,
        grantedAt: existing?.granted_at || null,
        withdrawnAt: existing?.withdrawn_at || null,
        consentVersion: existing?.consent_version || null,
        currentVersion: CURRENT_CONSENT_VERSION,
        needsRenewal: existing?.consent_version && existing.consent_version !== CURRENT_CONSENT_VERSION
      };
    });

    res.json({ success: true, consents, currentVersion: CURRENT_CONSENT_VERSION });
  } catch (error) {
    logger.error('Failed to fetch consents', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to fetch consents' });
  }
});

/**
 * POST /auth/consents - Grant consent for a purpose
 * Body: { purpose: string }
 */
app.post('/auth/consents', generalLimiter, authenticateJWT, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const { purpose } = req.body;

  const validPurposes = ['location_discovery', 'marketing', 'analytics', 'after_hours'];
  if (!validPurposes.includes(purpose)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid purpose',
      validPurposes
    });
  }

  try {
    await pool.query(
      `INSERT INTO user_consents (user_id, purpose, granted, granted_at, consent_version, ip_address, user_agent)
       VALUES ($1, $2, TRUE, CURRENT_TIMESTAMP, $3, $4, $5)
       ON CONFLICT (user_id, purpose)
       DO UPDATE SET
         granted = TRUE,
         granted_at = CURRENT_TIMESTAMP,
         withdrawn_at = NULL,
         consent_version = $3,
         ip_address = $4,
         user_agent = $5,
         updated_at = CURRENT_TIMESTAMP`,
      [userId, purpose, CURRENT_CONSENT_VERSION, req.ip, req.headers['user-agent']]
    );

    logger.info('Consent granted', { userId, purpose, version: CURRENT_CONSENT_VERSION });
    res.json({ success: true, message: `Consent granted for ${purpose}` });
  } catch (error) {
    logger.error('Failed to grant consent', { error, userId, purpose });
    res.status(500).json({ success: false, error: 'Failed to grant consent' });
  }
});

/**
 * DELETE /auth/consents/:purpose - Withdraw consent for a purpose
 * Does not delete the record - sets withdrawn_at timestamp for audit
 */
app.delete('/auth/consents/:purpose', generalLimiter, authenticateJWT, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const purpose = req.params.purpose as string;

  const validPurposes = ['location_discovery', 'marketing', 'analytics', 'after_hours'];
  if (!validPurposes.includes(purpose)) {
    return res.status(400).json({
      success: false,
      error: 'Invalid purpose',
      validPurposes
    });
  }

  try {
    const result = await pool.query(
      `UPDATE user_consents
       SET granted = FALSE, withdrawn_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND purpose = $2
       RETURNING id`,
      [userId, purpose]
    );

    if (result.rowCount === 0) {
      // No consent existed - create a withdrawn record for audit trail
      await pool.query(
        `INSERT INTO user_consents (user_id, purpose, granted, withdrawn_at, consent_version)
         VALUES ($1, $2, FALSE, CURRENT_TIMESTAMP, $3)`,
        [userId, purpose, CURRENT_CONSENT_VERSION]
      );
    }

    logger.info('Consent withdrawn', { userId, purpose });
    res.json({ success: true, message: `Consent withdrawn for ${purpose}` });
  } catch (error) {
    logger.error('Failed to withdraw consent', { error, userId, purpose });
    res.status(500).json({ success: false, error: 'Failed to withdraw consent' });
  }
});

// ===== DATA EXPORT ENDPOINT =====
// GDPR-03: Right to Access (Article 15)

interface UserDataExport {
  exportedAt: string;
  exportVersion: string;
  user: {
    id: string;
    email: string;
    provider: string;
    createdAt: string;
  };
  profile: {
    name: string | null;
    age: number | null;
    gender: string | null;
    bio: string | null;
    interests: string[];
    photos: string[];
    location: {
      latitude: number | null;
      longitude: number | null;
    };
    sexualPreference: string | null;
    intent: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  } | null;
  matches: Array<{
    matchId: string;
    matchedUserId: string;
    createdAt: string;
  }>;
  messages: Array<{
    matchId: string;
    content: string;
    sentAt: string;
    isFromUser: boolean;
  }>;
  blocks: Array<{
    blockedUserId: string;
    createdAt: string;
  }>;
  consents: Array<{
    purpose: string;
    granted: boolean;
    grantedAt: string | null;
    withdrawnAt: string | null;
    consentVersion: string | null;
  }>;
  afterHours?: {
    preferences: {
      seekingGender: string | null;
      minAge: number | null;
      maxAge: number | null;
      maxDistanceKm: number | null;
      sexualOrientation: string | null;
    };
    sessions: Array<{
      sessionId: string;
      startedAt: string;
      expiresAt: string;
    }>;
  };
  subscriptions: Array<{
    productId: string;
    purchaseDate: string;
    expiresAt: string | null;
    isActive: boolean;
  }>;
  verification: {
    idVerified: boolean;
    verifiedAt: string | null;
  } | null;
}

/**
 * Rate limiter specifically for data export - more strict to prevent abuse
 * 2 exports per hour max
 */
const exportLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 2, // 2 exports per hour max
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Export rate limit exceeded. Please try again later.' },
  handler: (req, res) => {
    logger.warn('Export rate limit exceeded', {
      ip: req.ip,
      userId: req.user?.userId,
      path: req.path,
      limiter: 'export'
    });
    res.status(429).json({
      success: false,
      error: 'Export rate limit exceeded. Please try again later.'
    });
  }
});

/**
 * GET /auth/data-export - Export all user data (GDPR Article 15)
 * Returns a structured JSON object containing all personal data
 * Rate limited more strictly to prevent abuse
 */
app.get('/auth/data-export', exportLimiter, authenticateJWT, async (req: Request, res: Response) => {
  const userId = req.user!.userId;
  const client = await pool.connect();

  try {
    logger.info('Data export requested', { userId });

    // Fetch all user data in parallel for efficiency
    const [
      userResult,
      profileResult,
      matchesResult,
      messagesResult,
      blocksResult,
      consentsResult,
      afterHoursPrefsResult,
      afterHoursSessionsResult,
      subscriptionsResult
    ] = await Promise.all([
      // Core user data
      client.query(
        'SELECT id, email, provider, created_at, id_verified, id_verified_at FROM users WHERE id = $1',
        [userId]
      ),
      // Profile data
      client.query(
        `SELECT name, age, gender, bio, interests, photos,
                latitude, longitude, sexual_preference, intent,
                created_at, updated_at
         FROM profiles WHERE user_id = $1`,
        [userId]
      ),
      // Matches (only include match metadata, not other user's data)
      client.query(
        `SELECT id as match_id,
                CASE WHEN user_id_1 = $1 THEN user_id_2 ELSE user_id_1 END as matched_user_id,
                created_at
         FROM matches
         WHERE user_id_1 = $1 OR user_id_2 = $1`,
        [userId]
      ),
      // Messages sent by user only (don't include messages sent TO user - that's other user's data)
      client.query(
        `SELECT match_id, text as content, created_at as sent_at, TRUE as is_from_user
         FROM messages WHERE sender_id = $1
         ORDER BY created_at`,
        [userId]
      ),
      // Blocks
      client.query(
        'SELECT blocked_user_id, created_at FROM blocks WHERE user_id = $1',
        [userId]
      ),
      // Consents
      client.query(
        `SELECT purpose, granted, granted_at, withdrawn_at, consent_version
         FROM user_consents WHERE user_id = $1`,
        [userId]
      ),
      // After Hours preferences
      client.query(
        `SELECT seeking_gender, min_age, max_age, max_distance_km, sexual_orientation
         FROM after_hours_preferences WHERE user_id = $1`,
        [userId]
      ),
      // After Hours sessions (last 30 days)
      client.query(
        `SELECT id as session_id, started_at, expires_at
         FROM after_hours_sessions
         WHERE user_id = $1 AND started_at > NOW() - INTERVAL '30 days'`,
        [userId]
      ),
      // Subscriptions
      client.query(
        `SELECT product_id, purchased_at as purchase_date, expires_at, is_active
         FROM user_subscriptions WHERE user_id = $1`,
        [userId]
      )
    ]);

    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const profile = profileResult.rows[0];
    const ahPrefs = afterHoursPrefsResult.rows[0];

    // Build the export object
    const exportData: UserDataExport = {
      exportedAt: new Date().toISOString(),
      exportVersion: '1.0',
      user: {
        id: user.id,
        email: user.email,
        provider: user.provider,
        createdAt: user.created_at?.toISOString() || ''
      },
      profile: profile ? {
        name: profile.name,
        age: profile.age,
        gender: profile.gender,
        bio: profile.bio,
        interests: profile.interests || [],
        photos: profile.photos || [], // R2 keys only, not full URLs
        location: {
          latitude: profile.latitude ? parseFloat(profile.latitude) : null,
          longitude: profile.longitude ? parseFloat(profile.longitude) : null
        },
        sexualPreference: profile.sexual_preference,
        intent: profile.intent,
        createdAt: profile.created_at?.toISOString() || null,
        updatedAt: profile.updated_at?.toISOString() || null
      } : null,
      matches: matchesResult.rows.map(m => ({
        matchId: m.match_id,
        matchedUserId: m.matched_user_id,
        createdAt: m.created_at?.toISOString() || ''
      })),
      messages: messagesResult.rows.map(m => ({
        matchId: m.match_id,
        content: m.content,
        sentAt: m.sent_at?.toISOString() || '',
        isFromUser: m.is_from_user
      })),
      blocks: blocksResult.rows.map(b => ({
        blockedUserId: b.blocked_user_id,
        createdAt: b.created_at?.toISOString() || ''
      })),
      consents: consentsResult.rows.map(c => ({
        purpose: c.purpose,
        granted: c.granted,
        grantedAt: c.granted_at?.toISOString() || null,
        withdrawnAt: c.withdrawn_at?.toISOString() || null,
        consentVersion: c.consent_version
      })),
      subscriptions: subscriptionsResult.rows.map(s => ({
        productId: s.product_id,
        purchaseDate: s.purchase_date?.toISOString() || '',
        expiresAt: s.expires_at?.toISOString() || null,
        isActive: s.is_active
      })),
      verification: {
        idVerified: user.id_verified || false,
        verifiedAt: user.id_verified_at?.toISOString() || null
      }
    };

    // Add After Hours data if preferences exist
    if (ahPrefs) {
      exportData.afterHours = {
        preferences: {
          seekingGender: ahPrefs.seeking_gender,
          minAge: ahPrefs.min_age,
          maxAge: ahPrefs.max_age,
          maxDistanceKm: ahPrefs.max_distance_km,
          sexualOrientation: ahPrefs.sexual_orientation
        },
        sessions: afterHoursSessionsResult.rows.map(s => ({
          sessionId: s.session_id,
          startedAt: s.started_at?.toISOString() || '',
          expiresAt: s.expires_at?.toISOString() || ''
        }))
      };
    }

    logger.info('Data export generated', {
      userId,
      matchCount: exportData.matches.length,
      messageCount: exportData.messages.length
    });

    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="vlvt-data-export-${new Date().toISOString().split('T')[0]}.json"`);

    res.json(exportData);
  } catch (error) {
    logger.error('Data export failed', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to generate data export' });
  } finally {
    client.release();
  }
});

// ===== GOLDEN TICKET ENDPOINTS =====
// Referral system for growth - users earn tickets through engagement

// Helper function to generate unique invite code
function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Exclude similar chars: I,O,0,1
  let code = 'VLVT-';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper function to get ticket balance
async function getTicketBalance(userId: string): Promise<number> {
  const result = await pool.query(
    'SELECT COALESCE(SUM(amount), 0) as balance FROM ticket_ledger WHERE user_id = $1',
    [userId]
  );
  return parseInt(result.rows[0].balance) || 0;
}

// Helper function to award tickets
async function awardTickets(userId: string, amount: number, reason: string, referenceId?: string): Promise<void> {
  await pool.query(
    'INSERT INTO ticket_ledger (user_id, amount, reason, reference_id) VALUES ($1, $2, $3, $4)',
    [userId, amount, reason, referenceId || null]
  );
  logger.info('Tickets awarded', { userId, amount, reason, referenceId });
}

// GET /auth/tickets - Get user's ticket balance and history
app.get('/auth/tickets', generalLimiter, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  let userId: string;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  try {
    // Get balance
    const balance = await getTicketBalance(userId);

    // Get invite codes created by this user
    const codesResult = await pool.query(
      `SELECT ic.code, ic.created_at, ic.used_at, ic.used_by_id,
              p.name as used_by_name
       FROM invite_codes ic
       LEFT JOIN profiles p ON p.user_id = ic.used_by_id
       WHERE ic.owner_id = $1
       ORDER BY ic.created_at DESC
       LIMIT 20`,
      [userId]
    );

    const codes = codesResult.rows.map(row => ({
      code: row.code,
      createdAt: row.created_at,
      used: row.used_by_id !== null,
      usedBy: row.used_by_name || null,
      usedAt: row.used_at,
    }));

    // Get ticket history
    const historyResult = await pool.query(
      `SELECT amount, reason, reference_id, created_at
       FROM ticket_ledger
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );

    const history = historyResult.rows.map(row => ({
      amount: row.amount,
      reason: row.reason,
      referenceId: row.reference_id,
      createdAt: row.created_at,
    }));

    res.json({
      success: true,
      balance,
      codes,
      history,
    });
  } catch (error) {
    logger.error('Failed to get ticket balance', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to get ticket balance' });
  }
});

// POST /auth/tickets/create-code - Generate a new invite code (costs 1 ticket)
app.post('/auth/tickets/create-code', generalLimiter, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  let userId: string;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Check balance
    const balance = await getTicketBalance(userId);
    if (balance < 1) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        success: false,
        error: 'Insufficient tickets',
        balance: balance,
      });
    }

    // Generate unique code (retry if collision)
    let code: string;
    let attempts = 0;
    const maxAttempts = 10;

    do {
      code = generateInviteCode();
      const existing = await client.query('SELECT 1 FROM invite_codes WHERE code = $1', [code]);
      if (existing.rowCount === 0) break;
      attempts++;
    } while (attempts < maxAttempts);

    if (attempts >= maxAttempts) {
      await client.query('ROLLBACK');
      return res.status(500).json({ success: false, error: 'Failed to generate unique code' });
    }

    // Create invite code
    await client.query(
      'INSERT INTO invite_codes (code, owner_id) VALUES ($1, $2)',
      [code, userId]
    );

    // Deduct ticket
    await client.query(
      'INSERT INTO ticket_ledger (user_id, amount, reason, reference_id) VALUES ($1, $2, $3, $4)',
      [userId, -1, 'invite_created', code]
    );

    await client.query('COMMIT');

    logger.info('Invite code created', { userId, code });

    res.json({
      success: true,
      code,
      shareUrl: `https://getvlvt.vip/invite/${code}`,
      balance: balance - 1,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to create invite code', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to create invite code' });
  } finally {
    client.release();
  }
});

// POST /auth/tickets/validate - Validate invite code during signup
app.post('/auth/tickets/validate', authLimiter, async (req: Request, res: Response) => {
  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'Invite code is required' });
  }

  const normalizedCode = code.toUpperCase().trim();

  try {
    const result = await pool.query(
      `SELECT ic.id, ic.owner_id, ic.used_by_id, ic.expires_at, p.name as owner_name
       FROM invite_codes ic
       LEFT JOIN profiles p ON p.user_id = ic.owner_id
       WHERE ic.code = $1`,
      [normalizedCode]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ success: false, error: 'Invalid invite code' });
    }

    const inviteCode = result.rows[0];

    // Check if already used
    if (inviteCode.used_by_id) {
      return res.status(400).json({ success: false, error: 'This invite code has already been used' });
    }

    // Check if expired
    if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'This invite code has expired' });
    }

    res.json({
      success: true,
      valid: true,
      invitedBy: inviteCode.owner_name || 'A VLVT member',
    });
  } catch (error) {
    logger.error('Failed to validate invite code', { error, code: normalizedCode });
    res.status(500).json({ success: false, error: 'Failed to validate invite code' });
  }
});

// POST /auth/tickets/redeem - Redeem invite code after signup (called internally or by client)
app.post('/auth/tickets/redeem', generalLimiter, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  let userId: string;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  const { code } = req.body;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ success: false, error: 'Invite code is required' });
  }

  const normalizedCode = code.toUpperCase().trim();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get invite code with lock
    const result = await client.query(
      `SELECT id, owner_id, used_by_id, expires_at
       FROM invite_codes
       WHERE code = $1
       FOR UPDATE`,
      [normalizedCode]
    );

    if (result.rowCount === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ success: false, error: 'Invalid invite code' });
    }

    const inviteCode = result.rows[0];

    // Check if already used
    if (inviteCode.used_by_id) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'This invite code has already been used' });
    }

    // Prevent self-redemption
    if (inviteCode.owner_id === userId) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'You cannot use your own invite code' });
    }

    // Check if expired
    if (inviteCode.expires_at && new Date(inviteCode.expires_at) < new Date()) {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, error: 'This invite code has expired' });
    }

    // Mark code as used
    await client.query(
      'UPDATE invite_codes SET used_by_id = $1, used_at = NOW() WHERE id = $2',
      [userId, inviteCode.id]
    );

    // Update user's referred_by
    await client.query(
      'UPDATE users SET referred_by = $1 WHERE id = $2',
      [inviteCode.owner_id, userId]
    );

    // Award signup bonus ticket to new user
    await client.query(
      'INSERT INTO ticket_ledger (user_id, amount, reason, reference_id) VALUES ($1, $2, $3, $4)',
      [userId, 1, 'signup_bonus', normalizedCode]
    );

    await client.query('COMMIT');

    logger.info('Invite code redeemed', { userId, code: normalizedCode, ownerId: inviteCode.owner_id });

    res.json({
      success: true,
      message: 'Invite code redeemed successfully! You earned 1 ticket.',
      ticketsEarned: 1,
    });
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Failed to redeem invite code', { error, userId, code: normalizedCode });
    res.status(500).json({ success: false, error: 'Failed to redeem invite code' });
  } finally {
    client.release();
  }
});

// Export helper for other services to award tickets
export { awardTickets, getTicketBalance };

// ===== KYCAID ID VERIFICATION ENDPOINTS =====
// Government ID verification via KYCAID - required before profile creation (Option B paywall)

// POST /auth/kycaid/start - Initiate ID verification process
app.post('/auth/kycaid/start', generalLimiter, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  let userId: string;
  let email: string | undefined;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email?: string };
    userId = decoded.userId;
    email = decoded.email;
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  try {
    // Auto-verify test users (sandbox mode)
    const isTestUser = userId.startsWith('test_') || userId.startsWith('google_test');
    if (isTestUser) {
      // Check if already verified
      const existingResult = await pool.query(
        'SELECT id_verified FROM users WHERE id = $1',
        [userId]
      );

      if (existingResult.rows.length > 0 && existingResult.rows[0].id_verified) {
        return res.json({
          success: true,
          alreadyVerified: true,
          message: 'Your ID has already been verified'
        });
      }

      // Auto-verify test user
      await pool.query(
        'UPDATE users SET id_verified = true, id_verified_at = NOW() WHERE id = $1',
        [userId]
      );

      logger.info('Test user auto-verified for ID', { userId });

      return res.json({
        success: true,
        alreadyVerified: true,
        testMode: true,
        message: 'Test user automatically verified'
      });
    }

    // Check if KYCAID is configured (only needed for real users)
    if (!kycaidService.isKycaidConfigured()) {
      logger.error('KYCAID not configured');
      return res.status(503).json({ success: false, error: 'ID verification service not configured' });
    }

    // Check if user is already verified
    const userResult = await pool.query(
      'SELECT id_verified, kycaid_applicant_id FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.id_verified) {
      return res.json({
        success: true,
        alreadyVerified: true,
        message: 'Your ID has already been verified'
      });
    }

    let applicantId = user.kycaid_applicant_id;

    // Create or get KYCAID applicant
    if (!applicantId) {
      const applicant = await kycaidService.createOrGetApplicant(userId, email);
      applicantId = applicant.applicant_id;

      // Store applicant ID on user
      await pool.query(
        'UPDATE users SET kycaid_applicant_id = $1 WHERE id = $2',
        [applicantId, userId]
      );
    }

    // Get a one-time hosted form URL from KYCAID
    // The user completes document upload + liveness check through KYCAID's UI
    const formResult = await kycaidService.getFormUrl(applicantId, userId);

    logger.info('KYCAID form URL generated', { userId, applicantId });

    res.json({
      success: true,
      formUrl: formResult.form_url,
      applicantId,
    });
  } catch (error) {
    logger.error('Failed to start KYCAID verification', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to start ID verification' });
  }
});

// GET /auth/kycaid/status - Check verification status
app.get('/auth/kycaid/status', generalLimiter, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  let userId: string;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  try {
    // Get user verification status
    const userResult = await pool.query(
      'SELECT id_verified, id_verified_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user = userResult.rows[0];

    if (user.id_verified) {
      return res.json({
        success: true,
        verified: true,
        verifiedAt: user.id_verified_at
      });
    }

    // Get latest verification attempt
    const verificationResult = await pool.query(
      `SELECT kycaid_verification_id, status, verification_status,
              document_verified, face_match_verified, liveness_verified, aml_cleared,
              created_at, completed_at
       FROM kycaid_verifications
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (verificationResult.rows.length === 0) {
      return res.json({
        success: true,
        verified: false,
        status: 'not_started',
        message: 'ID verification has not been started'
      });
    }

    const verification = verificationResult.rows[0];

    res.json({
      success: true,
      verified: false,
      status: verification.status,
      verificationStatus: verification.verification_status,
      checks: {
        document: verification.document_verified,
        faceMatch: verification.face_match_verified,
        liveness: verification.liveness_verified,
        aml: verification.aml_cleared
      },
      createdAt: verification.created_at,
      completedAt: verification.completed_at
    });
  } catch (error) {
    logger.error('Failed to get KYCAID status', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to check verification status' });
  }
});

// POST /auth/kycaid/webhook - Receive KYCAID callbacks
// This endpoint does NOT require authentication - it receives callbacks from KYCAID
app.post('/auth/kycaid/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    // Security: Require encryption key for PII storage - fail closed
    const encryptionKey = process.env.KYCAID_ENCRYPTION_KEY;
    if (!encryptionKey) {
      logger.error('KYCAID_ENCRYPTION_KEY not set - cannot store PII securely');
      return res.status(503).json({
        success: false,
        error: 'KYC service not properly configured for encryption'
      });
    }

    // Verify signature
    const signature = req.headers['x-kycaid-signature'] as string;
    const rawBody = req.body;

    if (!signature || !kycaidService.verifyCallbackSignature(rawBody, signature)) {
      logger.warn('KYCAID webhook signature verification failed');
      return res.status(401).json({ success: false, error: 'Invalid signature' });
    }

    // Parse callback data - handle both Buffer (from express.raw) and already-parsed JSON (from global express.json)
    const body = Buffer.isBuffer(rawBody) ? JSON.parse(rawBody.toString()) : rawBody;

    // Validate required webhook fields before processing
    if (!body.type || typeof body.type !== 'string') {
      logger.warn('KYCAID webhook missing required field: type', { body });
      return res.status(400).json({ success: false, error: 'Missing required field: type' });
    }
    if (!body.applicant_id || typeof body.applicant_id !== 'string') {
      logger.warn('KYCAID webhook missing required field: applicant_id', { body });
      return res.status(400).json({ success: false, error: 'Missing required field: applicant_id' });
    }
    if (!body.verification_id || typeof body.verification_id !== 'string') {
      logger.warn('KYCAID webhook missing required field: verification_id', { body });
      return res.status(400).json({ success: false, error: 'Missing required field: verification_id' });
    }

    const callbackData = kycaidService.parseCallbackData(body);

    if (!callbackData) {
      logger.warn('Invalid KYCAID callback data', { body });
      return res.status(400).json({ success: false, error: 'Invalid callback data' });
    }

    logger.info('KYCAID webhook received', {
      verificationId: callbackData.verification_id,
      applicantId: callbackData.applicant_id,
      status: callbackData.status,
      verificationStatus: callbackData.verification_status
    });

    // Find the verification record
    const verificationResult = await pool.query(
      `SELECT v.id, v.user_id FROM kycaid_verifications v
       WHERE v.kycaid_verification_id = $1`,
      [callbackData.verification_id]
    );

    if (verificationResult.rows.length === 0) {
      logger.warn('Verification not found for callback', { verificationId: callbackData.verification_id });
      // Return 200 to acknowledge receipt even if we can't process
      return res.json({ success: true, message: 'Acknowledged' });
    }

    const verification = verificationResult.rows[0];
    const userId = verification.user_id;

    // Extract verified user data
    const userData = kycaidService.extractVerifiedUserData(callbackData);

    // Determine status
    const isApproved = callbackData.verification_status === 'approved' && callbackData.verified;
    const status = isApproved ? 'approved' : (callbackData.verification_status === 'declined' ? 'declined' : 'completed');

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Update verification record
      // Security: Encrypt sensitive PII data before storing (encryption key validated at handler start)
      const piiData = {
        firstName: userData.firstName,
        lastName: userData.lastName,
        dateOfBirth: userData.dateOfBirth,
        documentNumber: userData.documentNumber,
        documentExpiry: userData.documentExpiry
      };

      // Store encrypted PII, clear plaintext columns
      await client.query(
        `UPDATE kycaid_verifications SET
           status = $1,
           verification_status = $2,
           encrypted_pii = encrypt_kycaid_pii($3::jsonb, $4),
           document_type = $5,
           document_country = $6,
           document_verified = $7,
           face_match_verified = $8,
           liveness_verified = $9,
           aml_cleared = $10,
           kycaid_response = $11,
           completed_at = NOW(),
           -- Clear plaintext PII columns
           first_name = NULL,
           last_name = NULL,
           date_of_birth = NULL,
           document_number = NULL,
           document_expiry = NULL
         WHERE id = $12`,
        [
          status,
          callbackData.verification_status,
          JSON.stringify(piiData),
          encryptionKey,
          userData.documentType,
          userData.documentCountry,
          userData.documentVerified,
          userData.faceMatchVerified,
          userData.livenessVerified,
          userData.amlCleared,
          JSON.stringify(body),
          verification.id
        ]
      );

      // If approved, update user as verified
      if (isApproved) {
        await client.query(
          'UPDATE users SET id_verified = true, id_verified_at = NOW() WHERE id = $1',
          [userId]
        );

        // Award verification completion ticket (one-time)
        const existingTicket = await client.query(
          `SELECT id FROM ticket_ledger WHERE user_id = $1 AND reason = 'id_verification'`,
          [userId]
        );
        if (existingTicket.rows.length === 0) {
          await client.query(
            'INSERT INTO ticket_ledger (user_id, amount, reason, reference_id) VALUES ($1, $2, $3, $4)',
            [userId, 1, 'id_verification', callbackData.verification_id]
          );
        }

        logger.info('User ID verified', { userId, verificationId: callbackData.verification_id });
      } else if (status === 'declined') {
        logger.info('User ID verification declined', {
          userId,
          verificationId: callbackData.verification_id,
          reason: callbackData.verification_status
        });
      }

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    res.json({ success: true, message: 'Webhook processed' });
  } catch (error) {
    logger.error('KYCAID webhook processing error', { error });
    // Return 200 to prevent retries for processing errors
    res.json({ success: true, message: 'Acknowledged with errors' });
  }
});

// GET /auth/kycaid/refresh - Manually refresh verification status from KYCAID
app.get('/auth/kycaid/refresh', generalLimiter, async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  const token = authHeader.substring(7);
  let userId: string;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    userId = decoded.userId;
  } catch (error) {
    return res.status(401).json({ success: false, error: 'Invalid or expired token' });
  }

  try {
    // Get latest verification
    const verificationResult = await pool.query(
      `SELECT kycaid_verification_id, status FROM kycaid_verifications
       WHERE user_id = $1
       ORDER BY created_at DESC LIMIT 1`,
      [userId]
    );

    if (verificationResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'No verification found' });
    }

    const verificationId = verificationResult.rows[0].kycaid_verification_id;

    // Fetch current status from KYCAID
    const kycaidStatus = await kycaidService.getVerificationStatus(verificationId);

    logger.info('KYCAID status refreshed', { userId, verificationId, status: kycaidStatus.status });

    res.json({
      success: true,
      status: kycaidStatus.status,
      verificationStatus: kycaidStatus.verification_status
    });
  } catch (error) {
    logger.error('Failed to refresh KYCAID status', { error, userId });
    res.status(500).json({ success: false, error: 'Failed to refresh verification status' });
  }
});

// ===== REVENUECAT WEBHOOK =====
// Receives subscription events from RevenueCat to sync with database

app.post('/auth/revenuecat/webhook', express.json(), async (req: Request, res: Response) => {
  // SECURITY: Require webhook auth to be configured - fail closed
  const webhookAuth = process.env.REVENUECAT_WEBHOOK_AUTH;
  if (!webhookAuth) {
    logger.error('RevenueCat webhook: REVENUECAT_WEBHOOK_AUTH not configured - rejecting request');
    return res.status(503).json({
      success: false,
      error: 'Webhook not configured'
    });
  }

  // Verify authorization header using timing-safe comparison
  const authHeader = req.headers.authorization;
  if (!authHeader || !timingSafeEqual(authHeader, webhookAuth)) {
    logger.warn('RevenueCat webhook: Invalid or missing authorization header');
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    const { api_version, event } = req.body;

    if (!event || !event.type) {
      logger.warn('RevenueCat webhook: Invalid payload - missing event or type');
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }

    const {
      type,
      id: eventId,
      app_user_id,
      original_app_user_id,
      product_id,
      entitlement_ids,
      period_type,
      purchased_at_ms,
      expiration_at_ms,
      store,
      environment,
      price,
      currency,
      transaction_id,
      original_transaction_id,
    } = event;

    // Use original_app_user_id as the primary identifier (most stable)
    const userId = original_app_user_id || app_user_id;

    if (!userId) {
      logger.warn('RevenueCat webhook: No user ID in event', { eventId, type });
      return res.status(400).json({ success: false, error: 'Missing user ID' });
    }

    logger.info('RevenueCat webhook received', {
      eventId,
      type,
      userId,
      productId: product_id,
      environment,
    });

    // Handle different event types
    switch (type) {
      case 'TEST':
        // Test webhook - just acknowledge
        logger.info('RevenueCat TEST webhook received');
        break;

      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'NON_RENEWING_PURCHASE': {
        // Active subscription - upsert into database
        const entitlementId = entitlement_ids?.[0] || 'premium';
        const purchasedAt = purchased_at_ms ? new Date(purchased_at_ms) : new Date();
        const expiresAt = expiration_at_ms ? new Date(expiration_at_ms) : null;

        await pool.query(
          `INSERT INTO user_subscriptions (
            id, user_id, revenuecat_id, product_id, entitlement_id,
            is_active, will_renew, period_type, purchased_at, expires_at,
            store, environment, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET
            is_active = $6,
            will_renew = $7,
            expires_at = $10,
            updated_at = NOW()`,
          [
            `rc_${original_transaction_id || transaction_id || eventId}`,
            userId,
            app_user_id,
            product_id,
            entitlementId,
            true, // is_active
            type !== 'NON_RENEWING_PURCHASE', // will_renew
            period_type || 'normal',
            purchasedAt,
            expiresAt,
            store || 'unknown',
            environment || 'production',
          ]
        );

        logger.info('RevenueCat subscription activated', {
          userId,
          productId: product_id,
          type,
          expiresAt,
        });
        break;
      }

      case 'CANCELLATION': {
        // User cancelled - will_renew = false, but still active until expiration
        await pool.query(
          `UPDATE user_subscriptions
           SET will_renew = false, updated_at = NOW()
           WHERE user_id = $1 AND is_active = true`,
          [userId]
        );

        logger.info('RevenueCat subscription cancelled (will expire)', { userId });
        break;
      }

      case 'EXPIRATION':
      case 'BILLING_ISSUE': {
        // Subscription expired or billing failed - deactivate
        const expiresAt = expiration_at_ms ? new Date(expiration_at_ms) : new Date();

        await pool.query(
          `UPDATE user_subscriptions
           SET is_active = false, will_renew = false, expires_at = $2, updated_at = NOW()
           WHERE user_id = $1`,
          [userId, expiresAt]
        );

        logger.info('RevenueCat subscription expired/deactivated', { userId, type });
        break;
      }

      case 'PRODUCT_CHANGE': {
        // User changed product - update product_id
        const entitlementId = entitlement_ids?.[0] || 'premium';
        const expiresAt = expiration_at_ms ? new Date(expiration_at_ms) : null;

        await pool.query(
          `UPDATE user_subscriptions
           SET product_id = $2, entitlement_id = $3, expires_at = $4, updated_at = NOW()
           WHERE user_id = $1 AND is_active = true`,
          [userId, product_id, entitlementId, expiresAt]
        );

        logger.info('RevenueCat product changed', { userId, productId: product_id });
        break;
      }

      case 'TRANSFER': {
        // Subscription transferred to different user
        const newUserId = app_user_id;
        if (newUserId && newUserId !== original_app_user_id) {
          await pool.query(
            `UPDATE user_subscriptions
             SET user_id = $2, updated_at = NOW()
             WHERE user_id = $1 AND is_active = true`,
            [original_app_user_id, newUserId]
          );
          logger.info('RevenueCat subscription transferred', {
            fromUser: original_app_user_id,
            toUser: newUserId,
          });
        }
        break;
      }

      default:
        // Log unknown events but don't fail
        logger.info('RevenueCat webhook: Unhandled event type', { type, eventId });
    }

    // Always return 200 to acknowledge receipt
    res.json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    logger.error('RevenueCat webhook processing error', { error });
    // Return 200 anyway to prevent retries for processing errors
    // RevenueCat will keep retrying on non-2xx responses
    res.json({ success: true, message: 'Acknowledged with errors' });
  }
});

// Async initialization function
async function initializeApp() {
  // Initialize advanced caching system
  try {
    await cacheManager.initialize();
    logger.info('Advanced caching system initialized');

    // Add cache health check endpoint
    app.get('/cache/health', async (req, res) => {
      const health = await cacheManager.healthCheck();
      res.json({
        success: true,
        cache: {
          healthy: health.healthy,
          message: health.message || 'Cache is operational'
        }
      });
    });
  } catch (error) {
    logger.warn('Cache initialization failed, continuing without cache', { error });
  }

  // Initialize Swagger API documentation
  if (process.env.NODE_ENV !== 'production' || process.env.ENABLE_SWAGGER === 'true') {
    initializeSwagger(app);
    logger.info('Swagger API documentation enabled');
  }

  // Sentry error handler - must be after all routes but before our global error handler
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Replace generic error handler with comprehensive error handling
  app.use(globalErrorHandler);

  // 404 handler for unmatched routes
  app.use(notFoundHandler);

  // Only start server if not in test environment
  if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
      logger.info(`Auth service started`, { port: PORT, environment: process.env.NODE_ENV || 'development' });
    });
  }
}

// Initialize the application
initializeApp().catch((error) => {
  logger.error('Failed to initialize application', { error });
  process.exit(1);
});

// Export for testing
export default app;
