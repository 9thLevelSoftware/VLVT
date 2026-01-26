import dotenv from 'dotenv';
// Load environment variables first
dotenv.config();

// Initialize Sentry before any other imports
import * as Sentry from '@sentry/node';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: 0.1, // 10% of transactions

    // Service identification for dashboard grouping (MON-05)
    initialScope: {
      tags: {
        service: 'profile-service',
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
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { Pool } from 'pg';
import { authMiddleware } from './middleware/auth';
import { validateProfile, validateProfileUpdate } from './middleware/validation';
import logger from './utils/logger';
import { generateMatchId } from './utils/id-generator';
import { redactCoordinates } from './utils/geo-redact';
import { generalLimiter, profileCreationLimiter, discoveryLimiter } from './middleware/rate-limiter';
import {
  initializeUploadDirectory,
  validateImage,
  validateImageMagicBytes,
  processImage,
  deleteImage,
  getPhotoIdFromUrl,
  canUploadMorePhotos,
  MAX_PHOTOS_PER_PROFILE,
} from './utils/image-handler';
import { resolvePhotoUrls, uploadToR2, getPresignedUrl, deleteUserPhotos } from './utils/r2-client';
import { RekognitionClient, CompareFacesCommand } from '@aws-sdk/client-rekognition';
import { initializeFirebase, sendMatchNotification } from './services/fcm-service';
import { initializeSessionWorker, closeSessionScheduler } from './services/session-scheduler';
import {
  initializeMatchingScheduler,
  closeMatchingScheduler,
} from './services/matching-scheduler';
import {
  initializeSessionCleanupJob,
  closeSessionCleanupJob,
} from './jobs/session-cleanup-job';
import {
  createCsrfMiddleware,
  createCsrfTokenHandler,
  addVersionToHealth,
  API_VERSIONS,
  CURRENT_API_VERSION,
  // Correlation ID middleware (MON-05)
  correlationMiddleware,
  // Request logger middleware (MON-05)
  createRequestLoggerMiddleware,
} from '@vlvt/shared';
import { createAfterHoursRouter } from './routes/after-hours';

const app = express();
const PORT = process.env.PORT || 3002;

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
if (!process.env.DATABASE_URL && process.env.NODE_ENV !== 'test') {
  logger.error('DATABASE_URL environment variable is required');
  process.exit(1);
}

if (!process.env.JWT_SECRET && process.env.NODE_ENV !== 'test') {
  logger.error('JWT_SECRET environment variable is required');
  process.exit(1);
}

// CORS origin from environment variable - require in production
const CORS_ORIGIN = (() => {
  const origin = process.env.CORS_ORIGIN;
  if (!origin && process.env.NODE_ENV === 'production') {
    throw new Error('CORS_ORIGIN environment variable is required in production');
  }
  return origin || 'http://localhost:19006';
})();

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
  // See auth-service/src/index.ts for HSTS preload submission checklist
  // Submit domain to https://hstspreload.org after deployment
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
app.use(cookieParser());

// Correlation ID middleware - generates/propagates IDs for request tracing (MON-05)
app.use(correlationMiddleware);

// Request logger middleware - attaches child logger with correlationId (MON-05)
const requestLoggerMiddleware = createRequestLoggerMiddleware(logger);
app.use(requestLoggerMiddleware);

// CSRF Protection Configuration
const csrfMiddleware = createCsrfMiddleware({
  skipPaths: [
    '/health',
    '/webhooks/',
  ],
  logger,
});
const csrfTokenHandler = createCsrfTokenHandler();

// NOTE: Static file serving removed - images now served via R2 presigned URLs

// Configure multer for file uploads using disk storage to prevent OOM attacks
// Files are stored in temp directory and cleaned up after processing
const UPLOAD_TEMP_DIR = process.env.UPLOAD_TEMP_DIR || path.join(os.tmpdir(), 'vlvt-uploads');

// Ensure temp upload directory exists
if (!fs.existsSync(UPLOAD_TEMP_DIR)) {
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
  logger.info('Created temp upload directory', { path: UPLOAD_TEMP_DIR });
}

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_TEMP_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename to prevent collisions
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1E9)}`;
    const ext = path.extname(file.originalname) || '.tmp';
    cb(null, `upload-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage: diskStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1, // Single file per request
  },
});

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
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 2000, // Return an error after 2 seconds if connection cannot be established
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

// Helper function to award first match ticket (one-time)
async function awardFirstMatchTicket(userId: string): Promise<void> {
  try {
    // Check if user already received first match ticket
    const existingTicket = await pool.query(
      `SELECT id FROM ticket_ledger WHERE user_id = $1 AND reason = 'first_match'`,
      [userId]
    );
    if (existingTicket.rows.length === 0) {
      await pool.query(
        `INSERT INTO ticket_ledger (user_id, amount, reason) VALUES ($1, 1, 'first_match')`,
        [userId]
      );
      logger.info('Awarded first match ticket', { userId });
    }
  } catch (error) {
    logger.error('Failed to award first match ticket', { error, userId });
    // Don't throw - ticket awarding is non-critical
  }
}

// Helper function to award verification ticket (one-time)
async function awardVerificationTicket(userId: string, verificationId: string): Promise<void> {
  try {
    // Check if user already received verification ticket
    const existingTicket = await pool.query(
      `SELECT id FROM ticket_ledger WHERE user_id = $1 AND reason = 'verification'`,
      [userId]
    );
    if (existingTicket.rows.length === 0) {
      await pool.query(
        `INSERT INTO ticket_ledger (user_id, amount, reason, reference_id) VALUES ($1, 1, 'verification', $2)`,
        [userId, verificationId]
      );
      logger.info('Awarded verification ticket', { userId, verificationId });
    }
  } catch (error) {
    logger.error('Failed to award verification ticket', { error, userId });
    // Don't throw - ticket awarding is non-critical
  }
}

// AWS Rekognition client for face comparison
const rekognitionClient = new RekognitionClient({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
    ? {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      }
    : undefined,
});

// Gesture prompts for liveness verification
const GESTURE_PROMPTS = [
  { id: 'three_fingers', instruction: 'Hold up 3 fingers' },
  { id: 'touch_nose', instruction: 'Touch your nose' },
  { id: 'look_left', instruction: 'Look to your left' },
  { id: 'look_right', instruction: 'Look to your right' },
  { id: 'thumbs_up', instruction: 'Give a thumbs up' },
  { id: 'peace_sign', instruction: 'Show a peace sign' },
];

// Similarity threshold for face verification (0-100)
const SIMILARITY_THRESHOLD = parseFloat(process.env.REKOGNITION_SIMILARITY_THRESHOLD || '90');

// Initialize Firebase Admin SDK for push notifications
initializeFirebase();

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
    service: 'profile-service',
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

// ===== INTERNAL ENDPOINTS =====
// These are called by other services, not directly by clients
// NOT rate limited - internal network only

/**
 * Internal endpoint for cleaning up user photos during account deletion
 * Called by auth-service DELETE /auth/account
 * GDPR Article 17 - Right to Erasure: Removes photos from R2 storage
 */
app.post('/api/internal/cleanup-photos', async (req: Request, res: Response) => {
  // Verify internal service header - simple shared secret for service-to-service auth
  const internalHeader = req.headers['x-internal-service'];
  if (internalHeader !== 'auth-service') {
    logger.warn('Unauthorized internal endpoint access attempt', {
      header: internalHeader,
      ip: req.ip
    });
    return res.status(403).json({ success: false, error: 'Internal endpoint only' });
  }

  const { userId, photoKeys } = req.body;

  if (!userId || !Array.isArray(photoKeys)) {
    return res.status(400).json({ success: false, error: 'Invalid request body' });
  }

  try {
    const result = await deleteUserPhotos(userId, photoKeys);
    logger.info('Internal photo cleanup completed', { userId, ...result });
    res.json({ success: true, ...result });
  } catch (error) {
    logger.error('Internal photo cleanup failed', { userId, error });
    res.status(500).json({ success: false, error: 'Photo cleanup failed' });
  }
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

// =============================================================================
// API VERSIONING SUPPORT
// All routes are available at both:
// - Versioned: /api/v1/profile/* (recommended for new clients)
// - Legacy: /profile/* (backwards compatible, will eventually be deprecated)
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
    req.url = remainingPath;
  } else {
    // Legacy unversioned route
    req.apiVersion = 1; // Default to v1
    res.setHeader('X-API-Version', 'v1');
    res.setHeader('X-API-Legacy-Route', 'true');
  }

  next();
});

// Create profile - Extract userId from JWT token, not request body
app.post('/profile', authMiddleware, profileCreationLimiter, validateProfile, async (req: Request, res: Response) => {
  try {
    // Get userId from authenticated JWT token, not from request body
    const userId = req.user!.userId;
    const { name, age, bio, photos, interests } = req.body;

    const result = await pool.query(
      `INSERT INTO profiles (user_id, name, age, bio, photos, interests)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING user_id, name, age, bio, photos, interests, created_at, updated_at`,
      [userId, name, age, bio, photos || [], interests || []]
    );

    const profile = result.rows[0];

    // Resolve photo keys to presigned URLs
    const photoUrls = await resolvePhotoUrls(profile.photos || []);

    res.json({
      success: true,
      profile: {
        userId: profile.user_id,
        name: profile.name,
        age: profile.age,
        bio: profile.bio,
        photos: photoUrls,
        interests: profile.interests
      }
    });
  } catch (error: any) {
    logger.error('Failed to save profile', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      userId: req.user?.userId,
    });

    // Return specific error for known database error codes
    if (error.code === '23505') {
      res.status(409).json({ success: false, error: 'Profile already exists for this user' });
    } else if (error.code === '23503') {
      res.status(400).json({ success: false, error: 'Invalid user reference' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to save profile' });
    }
  }
});

// Get profile by userId - Allow viewing other users' public profiles
// This endpoint returns public profile data for discovery and matches
app.get('/profile/:userId', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const requestedUserId = req.params.userId;
    const authenticatedUserId = req.user!.userId;
    const isOwnProfile = requestedUserId === authenticatedUserId;

    // Fetch profile from database
    const result = await pool.query(
      `SELECT user_id, name, age, bio, photos, interests, is_verified, verified_at, created_at, updated_at
       FROM profiles
       WHERE user_id = $1`,
      [requestedUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const profile = result.rows[0];

    // Resolve photo keys to presigned URLs
    const photoUrls = await resolvePhotoUrls(profile.photos || []);

    // Return profile data
    // Note: Currently all profile fields are public (name, age, bio, photos, interests)
    // If we add sensitive fields (email, phone, etc.) in the future, we must filter them out
    // when isOwnProfile is false to maintain privacy
    res.json({
      success: true,
      profile: {
        userId: profile.user_id,
        name: profile.name,
        age: profile.age,
        bio: profile.bio,
        photos: photoUrls,
        interests: profile.interests,
        isVerified: profile.is_verified || false,
        verifiedAt: profile.verified_at,
      },
      isOwnProfile: isOwnProfile
    });
  } catch (error: any) {
    logger.error('Failed to retrieve profile', {
      error: error.message,
      code: error.code,
      requestedUserId: req.params.userId,
    });
    res.status(500).json({ success: false, error: 'Failed to retrieve profile' });
  }
});

// Update profile - Only allow users to update their own profile
app.put('/profile/:userId', authMiddleware, generalLimiter, validateProfileUpdate, async (req: Request, res: Response) => {
  try {
    const requestedUserId = req.params.userId;
    const authenticatedUserId = req.user!.userId;

    // Authorization check: user can only update their own profile
    if (requestedUserId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Cannot modify other users\' profiles'
      });
    }

    const { name, age, bio, photos, interests } = req.body;

    const result = await pool.query(
      `UPDATE profiles
       SET name = COALESCE($2, name),
           age = COALESCE($3, age),
           bio = COALESCE($4, bio),
           photos = COALESCE($5, photos),
           interests = COALESCE($6, interests),
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING user_id, name, age, bio, photos, interests, created_at, updated_at`,
      [requestedUserId, name, age, bio, photos, interests]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const profile = result.rows[0];

    // Resolve photo keys to presigned URLs
    const photoUrls = await resolvePhotoUrls(profile.photos || []);

    res.json({
      success: true,
      profile: {
        userId: profile.user_id,
        name: profile.name,
        age: profile.age,
        bio: profile.bio,
        photos: photoUrls,
        interests: profile.interests
      }
    });
  } catch (error: any) {
    logger.error('Failed to update profile', {
      error: error.message,
      code: error.code,
      detail: error.detail,
      requestedUserId: req.params.userId,
    });

    // Return specific error for known database error codes
    if (error.code === '23514') {
      res.status(400).json({ success: false, error: 'Invalid data: check constraint violated' });
    } else {
      res.status(500).json({ success: false, error: 'Failed to update profile' });
    }
  }
});

// Delete profile - Only allow users to delete their own profile
app.delete('/profile/:userId', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const requestedUserId = req.params.userId;
    const authenticatedUserId = req.user!.userId;

    // Authorization check: user can only delete their own profile
    if (requestedUserId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Cannot delete other users\' profiles'
      });
    }

    // Get photos before deletion for R2 cleanup (GDPR right-to-erasure)
    const photoResult = await pool.query(
      `SELECT photos FROM profiles WHERE user_id = $1`,
      [requestedUserId]
    );
    const photos: string[] = photoResult.rows[0]?.photos || [];

    // Delete profile from database
    const result = await pool.query(
      `DELETE FROM profiles WHERE user_id = $1 RETURNING user_id`,
      [requestedUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Clean up photos from R2 (async, don't block response)
    if (photos.length > 0) {
      deleteUserPhotos(requestedUserId, photos).catch((error) => {
        logger.error('Background R2 cleanup failed', { userId: requestedUserId, error });
      });
    }

    res.json({ success: true, message: 'Profile deleted' });
  } catch (error) {
    logger.error('Failed to delete profile', { error, requestedUserId: req.params.userId });
    res.status(500).json({ success: false, error: 'Failed to delete profile' });
  }
});

// ===== LOCATION ENDPOINTS =====

// Update user location - P1 Feature
app.put('/profile/:userId/location', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const requestedUserId = req.params.userId;
    const authenticatedUserId = req.user!.userId;

    // Authorization check: user can only update their own location
    if (requestedUserId !== authenticatedUserId) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden: Cannot update other users\' location'
      });
    }

    const { latitude, longitude } = req.body;

    // Validate latitude and longitude
    if (typeof latitude !== 'number' || typeof longitude !== 'number') {
      return res.status(400).json({
        success: false,
        error: 'Invalid location data: latitude and longitude must be numbers'
      });
    }

    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        error: 'Invalid latitude: must be between -90 and 90'
      });
    }

    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        error: 'Invalid longitude: must be between -180 and 180'
      });
    }

    const result = await pool.query(
      `UPDATE profiles
       SET latitude = $2,
           longitude = $3,
           location_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1
       RETURNING user_id, latitude, longitude, location_updated_at`,
      [requestedUserId, latitude, longitude]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const redacted = redactCoordinates(latitude, longitude);
    logger.info('Location updated', {
      userId: requestedUserId,
      // Log only city-level precision to protect user privacy
      latitude: redacted.latitude,
      longitude: redacted.longitude
    });

    res.json({
      success: true,
      location: {
        userId: result.rows[0].user_id,
        latitude: result.rows[0].latitude,
        longitude: result.rows[0].longitude,
        updatedAt: result.rows[0].location_updated_at
      }
    });
  } catch (error) {
    logger.error('Failed to update location', {
      error,
      requestedUserId: req.params.userId
    });
    res.status(500).json({ success: false, error: 'Failed to update location' });
  }
});

// ===== PHOTO UPLOAD ENDPOINTS =====

// Upload photo - Only allow users to upload photos to their own profile
app.post('/profile/photos/upload', authMiddleware, generalLimiter, upload.single('photo'), async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // Validate image (basic MIME type and size check)
    const validation = validateImage(req.file);
    if (!validation.valid) {
      // Clean up temp file if using disk storage
      if (req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore cleanup errors */ }
      }
      return res.status(400).json({ success: false, error: validation.error });
    }

    // Validate magic bytes to prevent malicious files disguised as images
    // Read file content from disk (multer disk storage) or use buffer (memory storage)
    const fileBuffer = req.file.path
      ? fs.readFileSync(req.file.path)
      : req.file.buffer;

    const magicByteValidation = await validateImageMagicBytes(fileBuffer, req.file.originalname);
    if (!magicByteValidation.valid) {
      // Clean up temp file if using disk storage
      if (req.file.path) {
        try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore cleanup errors */ }
      }
      logger.warn('Magic byte validation failed for upload', {
        userId: authenticatedUserId,
        filename: req.file.originalname,
        claimedMime: req.file.mimetype,
        error: magicByteValidation.error,
      });
      return res.status(400).json({ success: false, error: magicByteValidation.error });
    }

    // Get current profile to check photo count
    const profileResult = await pool.query(
      'SELECT photos FROM profiles WHERE user_id = $1',
      [authenticatedUserId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const currentPhotos = profileResult.rows[0].photos || [];

    // Check photo limit
    if (!canUploadMorePhotos(currentPhotos.length)) {
      return res.status(400).json({
        success: false,
        error: `Maximum ${MAX_PHOTOS_PER_PROFILE} photos allowed`
      });
    }

    // Process and upload image to R2
    const processedImage = await processImage(req.file, authenticatedUserId);

    // Update profile with new photo key (R2 object key, not URL)
    const updatedPhotos = [...currentPhotos, processedImage.key];
    await pool.query(
      'UPDATE profiles SET photos = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [updatedPhotos, authenticatedUserId]
    );

    // Resolve keys to presigned URLs for the response
    const [photoUrl, thumbnailUrl] = await resolvePhotoUrls([
      processedImage.key,
      processedImage.thumbnailKey,
    ]);

    res.json({
      success: true,
      photo: {
        url: photoUrl,
        thumbnailUrl: thumbnailUrl,
      },
      totalPhotos: updatedPhotos.length,
    });
  } catch (error) {
    logger.error('Failed to upload photo', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to upload photo' });
  }
});

// Delete photo - Only allow users to delete their own photos
app.delete('/profile/photos/:photoId', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;
    const photoId = req.params.photoId;

    // Get current profile
    const profileResult = await pool.query(
      'SELECT photos FROM profiles WHERE user_id = $1',
      [authenticatedUserId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const currentPhotos: string[] = profileResult.rows[0].photos || [];

    // Find photo URL containing the photoId
    const photoToDelete = currentPhotos.find(url => url.includes(photoId));

    if (!photoToDelete) {
      return res.status(404).json({ success: false, error: 'Photo not found' });
    }

    // Remove photo from array
    const updatedPhotos = currentPhotos.filter(url => url !== photoToDelete);

    // Update database
    await pool.query(
      'UPDATE profiles SET photos = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [updatedPhotos, authenticatedUserId]
    );

    // Delete physical files (best effort - don't fail if files are missing)
    await deleteImage(photoToDelete);

    res.json({
      success: true,
      message: 'Photo deleted',
      totalPhotos: updatedPhotos.length,
    });
  } catch (error) {
    logger.error('Failed to delete photo', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to delete photo' });
  }
});

// Reorder photos - Only allow users to reorder their own photos
app.put('/profile/photos/reorder', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;
    const { photos } = req.body;

    if (!Array.isArray(photos)) {
      return res.status(400).json({ success: false, error: 'photos must be an array' });
    }

    // Get current profile to verify all photos belong to user
    const profileResult = await pool.query(
      'SELECT photos FROM profiles WHERE user_id = $1',
      [authenticatedUserId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const currentPhotos: string[] = profileResult.rows[0].photos || [];

    // Verify all provided photos are valid
    const invalidPhotos = photos.filter(url => !currentPhotos.includes(url));
    if (invalidPhotos.length > 0) {
      return res.status(400).json({ success: false, error: 'Invalid photo URLs provided' });
    }

    // Update database with reordered photos
    await pool.query(
      'UPDATE profiles SET photos = $1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $2',
      [photos, authenticatedUserId]
    );

    res.json({
      success: true,
      message: 'Photos reordered',
      photos: photos,
    });
  } catch (error) {
    logger.error('Failed to reorder photos', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to reorder photos' });
  }
});

// ===== VERIFICATION ENDPOINTS =====

// Get a random gesture prompt for verification
app.get('/verification/prompt', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    // Select a random gesture prompt
    const prompt = GESTURE_PROMPTS[Math.floor(Math.random() * GESTURE_PROMPTS.length)];

    res.json({
      success: true,
      prompt: {
        id: prompt.id,
        instruction: prompt.instruction,
        timeLimit: 5, // seconds to complete the gesture
      },
    });
  } catch (error) {
    logger.error('Failed to get verification prompt', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to get verification prompt' });
  }
});

// Submit verification selfie
app.post('/verification/submit', authMiddleware, generalLimiter, upload.single('selfie'), async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;
    const { gesturePrompt, referencePhotoIndex } = req.body;

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No selfie uploaded' });
    }

    if (!gesturePrompt) {
      return res.status(400).json({ success: false, error: 'Gesture prompt is required' });
    }

    // Validate gesture prompt is valid
    const validPrompt = GESTURE_PROMPTS.find(p => p.id === gesturePrompt);
    if (!validPrompt) {
      return res.status(400).json({ success: false, error: 'Invalid gesture prompt' });
    }

    // Get user's profile photos
    const profileResult = await pool.query(
      'SELECT photos, is_verified FROM profiles WHERE user_id = $1',
      [authenticatedUserId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    // Check if already verified
    if (profileResult.rows[0].is_verified) {
      return res.status(400).json({ success: false, error: 'Already verified' });
    }

    const photos: string[] = profileResult.rows[0].photos || [];
    if (photos.length === 0) {
      return res.status(400).json({ success: false, error: 'No profile photos to compare against' });
    }

    // Get the reference photo (default to first photo)
    const photoIndex = parseInt(referencePhotoIndex || '0', 10);
    const referencePhotoKey = photos[Math.min(photoIndex, photos.length - 1)];

    // Read the selfie file
    const selfieBuffer = fs.readFileSync(req.file.path);

    // Validate magic bytes to prevent malicious files disguised as images
    const magicByteValidation = await validateImageMagicBytes(selfieBuffer, req.file.originalname);
    if (!magicByteValidation.valid) {
      // Clean up temp file
      try { fs.unlinkSync(req.file.path); } catch (e) { /* ignore cleanup errors */ }
      logger.warn('Magic byte validation failed for verification selfie', {
        userId: authenticatedUserId,
        filename: req.file.originalname,
        claimedMime: req.file.mimetype,
        error: magicByteValidation.error,
      });
      return res.status(400).json({ success: false, error: magicByteValidation.error });
    }

    // Generate unique key for verification selfie
    const timestamp = Date.now();
    const selfieKey = `verifications/${authenticatedUserId}/${timestamp}.jpg`;

    // Upload selfie to R2
    await uploadToR2(selfieKey, selfieBuffer, 'image/jpeg');

    // Clean up temp file
    fs.unlinkSync(req.file.path);

    // Create verification record with pending status
    const verificationResult = await pool.query(
      `INSERT INTO verifications (user_id, selfie_key, reference_photo_key, gesture_prompt, status)
       VALUES ($1, $2, $3, $4, 'pending')
       RETURNING id`,
      [authenticatedUserId, selfieKey, referencePhotoKey, gesturePrompt]
    );

    const verificationId = verificationResult.rows[0].id;

    // Perform face comparison with AWS Rekognition
    try {
      // Get the reference photo from R2 (or resolve if it's a URL)
      let referenceImageBytes: Uint8Array;

      if (referencePhotoKey.startsWith('http://') || referencePhotoKey.startsWith('https://')) {
        // Fetch from URL (legacy photos)
        const response = await fetch(referencePhotoKey);
        const arrayBuffer = await response.arrayBuffer();
        referenceImageBytes = new Uint8Array(arrayBuffer);
      } else {
        // Get presigned URL and fetch
        const referenceUrl = await getPresignedUrl(referencePhotoKey);
        const response = await fetch(referenceUrl);
        const arrayBuffer = await response.arrayBuffer();
        referenceImageBytes = new Uint8Array(arrayBuffer);
      }

      // Compare faces using Rekognition
      const compareFacesCommand = new CompareFacesCommand({
        SourceImage: {
          Bytes: selfieBuffer,
        },
        TargetImage: {
          Bytes: referenceImageBytes,
        },
        SimilarityThreshold: SIMILARITY_THRESHOLD,
      });

      const rekognitionResponse = await rekognitionClient.send(compareFacesCommand);

      // Check if faces match
      const faceMatches = rekognitionResponse.FaceMatches || [];
      const highestSimilarity = faceMatches.length > 0
        ? Math.max(...faceMatches.map(m => m.Similarity || 0))
        : 0;

      const isVerified = highestSimilarity >= SIMILARITY_THRESHOLD;

      // Update verification record
      await pool.query(
        `UPDATE verifications
         SET similarity_score = $1,
             rekognition_response = $2,
             status = $3,
             rejection_reason = $4,
             processed_at = CURRENT_TIMESTAMP
         WHERE id = $5`,
        [
          highestSimilarity,
          JSON.stringify(rekognitionResponse),
          isVerified ? 'approved' : 'rejected',
          isVerified ? null : 'Face similarity below threshold',
          verificationId,
        ]
      );

      if (isVerified) {
        // Update profile as verified
        await pool.query(
          `UPDATE profiles SET is_verified = true, verified_at = CURRENT_TIMESTAMP WHERE user_id = $1`,
          [authenticatedUserId]
        );

        // Award verification ticket
        await awardVerificationTicket(authenticatedUserId, verificationId);

        logger.info('User verified successfully', { userId: authenticatedUserId, similarity: highestSimilarity });

        res.json({
          success: true,
          verified: true,
          message: 'Verification successful! You are now verified.',
          similarity: Math.round(highestSimilarity),
          ticketAwarded: true,
        });
      } else {
        logger.info('Verification failed - low similarity', { userId: authenticatedUserId, similarity: highestSimilarity });

        res.json({
          success: true,
          verified: false,
          message: 'Verification failed. Please ensure your selfie matches your profile photo.',
          similarity: Math.round(highestSimilarity),
        });
      }
    } catch (rekognitionError) {
      logger.error('Rekognition error', { error: rekognitionError, userId: authenticatedUserId });

      // Update verification record with error
      await pool.query(
        `UPDATE verifications
         SET status = 'rejected',
             rejection_reason = $1,
             processed_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        ['Face comparison service error', verificationId]
      );

      res.status(500).json({
        success: false,
        error: 'Face comparison service unavailable. Please try again later.',
      });
    }
  } catch (error) {
    logger.error('Failed to submit verification', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to submit verification' });
  }
});

// Get verification status
app.get('/verification/status', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;

    // Get profile verification status
    const profileResult = await pool.query(
      'SELECT is_verified, verified_at FROM profiles WHERE user_id = $1',
      [authenticatedUserId]
    );

    if (profileResult.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'Profile not found' });
    }

    const { is_verified, verified_at } = profileResult.rows[0];

    // Get recent verification attempts
    const attemptsResult = await pool.query(
      `SELECT id, status, rejection_reason, similarity_score, created_at, processed_at
       FROM verifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 5`,
      [authenticatedUserId]
    );

    res.json({
      success: true,
      isVerified: is_verified || false,
      verifiedAt: verified_at,
      attempts: attemptsResult.rows.map(a => ({
        id: a.id,
        status: a.status,
        rejectionReason: a.rejection_reason,
        similarity: a.similarity_score ? Math.round(a.similarity_score) : null,
        createdAt: a.created_at,
        processedAt: a.processed_at,
      })),
    });
  } catch (error) {
    logger.error('Failed to get verification status', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to get verification status' });
  }
});

// ===== DISCOVERY ENDPOINTS =====

// Get random profiles for discovery - Requires authentication
// P1: Now supports distance filtering based on user location
// P4: Supports filtering by verified users only
app.get('/profiles/discover', authMiddleware, discoveryLimiter, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;

    // Parse optional query parameters
    const minAge = req.query.minAge ? parseInt(req.query.minAge as string) : null;
    const maxAge = req.query.maxAge ? parseInt(req.query.maxAge as string) : null;
    const maxDistance = req.query.maxDistance ? parseFloat(req.query.maxDistance as string) : null; // P1: Distance in km
    const interests = req.query.interests ? (req.query.interests as string).split(',') : null;
    const excludeIds = req.query.exclude ? (req.query.exclude as string).split(',') : [];
    const showVerifiedOnly = req.query.verifiedOnly === 'true'; // P4: Show only verified users

    // Get current user's location for distance filtering
    let userLocation: { latitude: number; longitude: number } | null = null;
    if (maxDistance !== null) {
      const locationResult = await pool.query(
        'SELECT latitude, longitude FROM profiles WHERE user_id = $1',
        [authenticatedUserId]
      );

      if (locationResult.rows.length > 0 &&
          locationResult.rows[0].latitude !== null &&
          locationResult.rows[0].longitude !== null) {
        userLocation = {
          latitude: locationResult.rows[0].latitude,
          longitude: locationResult.rows[0].longitude
        };
      }
    }

    // Build WHERE clause conditions
    const conditions = [
      'user_id != $1',
      // Exclude users who blocked me (for privacy and safety)
      `user_id NOT IN (SELECT user_id FROM blocks WHERE blocked_user_id = $1)`,
      // Exclude users I blocked
      `user_id NOT IN (SELECT blocked_user_id FROM blocks WHERE user_id = $1)`
    ];
    const params: any[] = [authenticatedUserId];
    let paramIndex = 2;

    // Age filter
    if (minAge !== null) {
      conditions.push(`age >= $${paramIndex}`);
      params.push(minAge);
      paramIndex++;
    }
    if (maxAge !== null) {
      conditions.push(`age <= $${paramIndex}`);
      params.push(maxAge);
      paramIndex++;
    }

    // Interests filter
    if (interests && interests.length > 0) {
      conditions.push(`interests && $${paramIndex}::text[]`);
      params.push(interests);
      paramIndex++;
    }

    // Exclude specific user IDs
    if (excludeIds.length > 0) {
      conditions.push(`user_id != ALL($${paramIndex}::text[])`);
      params.push(excludeIds);
      paramIndex++;
    }

    // P4: Verified only filter
    if (showVerifiedOnly) {
      conditions.push('is_verified = TRUE');
    }

    const whereClause = conditions.join(' AND ');

    // Fetch profiles with or without distance calculation
    let query: string;
    let countQuery: string;
    let totalCount = 0;

    // First, get total count of matching profiles for efficient random offset
    if (userLocation && maxDistance) {
      // Count profiles within distance (more expensive due to distance calculation)
      countQuery = `
        SELECT COUNT(*) as count
        FROM profiles
        WHERE ${whereClause}
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND (
            6371 * acos(
              cos(radians($${paramIndex})) * cos(radians(latitude)) *
              cos(radians(longitude) - radians($${paramIndex + 1})) +
              sin(radians($${paramIndex})) * sin(radians(latitude))
            )
          ) <= $${paramIndex + 2}
      `;
      const countResult = await pool.query(countQuery, [...params, userLocation.latitude, userLocation.longitude, maxDistance]);
      totalCount = parseInt(countResult.rows[0].count);
    } else {
      // Simple count for non-distance queries
      countQuery = `SELECT COUNT(*) as count FROM profiles WHERE ${whereClause}`;
      const countResult = await pool.query(countQuery, params);
      totalCount = parseInt(countResult.rows[0].count);
    }

    const limit = 20;

    // Helper function to build discovery query with new user boost
    const buildDiscoveryQuery = (effectiveMaxDistance: number | null) => {
      const queryParams = [...params];
      let discoveryQuery: string;

      if (userLocation && effectiveMaxDistance) {
        // P1: Use Haversine formula to calculate distance and filter
        // P2: New user boost - prioritize users created in last 48 hours
        // P4: Include is_verified field
        discoveryQuery = `
          SELECT * FROM (
            SELECT
              user_id, name, age, bio, photos, interests, latitude, longitude, created_at, is_verified,
              (
                6371 * acos(
                  cos(radians($${paramIndex})) * cos(radians(latitude)) *
                  cos(radians(longitude) - radians($${paramIndex + 1})) +
                  sin(radians($${paramIndex})) * sin(radians(latitude))
                )
              ) AS distance
            FROM profiles
            WHERE ${whereClause}
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
          ) AS profiles_with_distance
          WHERE distance <= $${paramIndex + 2}
          ORDER BY
            CASE WHEN created_at > NOW() - INTERVAL '48 hours' THEN 0 ELSE 1 END,
            distance ASC,
            RANDOM()
          LIMIT ${limit}
        `;
        queryParams.push(userLocation.latitude, userLocation.longitude, effectiveMaxDistance);
      } else {
        // P2: New user boost - prioritize users created in last 48 hours
        // P4: Include is_verified field
        discoveryQuery = `
          SELECT user_id, name, age, bio, photos, interests, latitude, longitude, created_at, is_verified
          FROM profiles
          WHERE ${whereClause}
          ORDER BY
            CASE WHEN created_at > NOW() - INTERVAL '48 hours' THEN 0 ELSE 1 END,
            RANDOM()
          LIMIT ${limit}
        `;
      }

      return { query: discoveryQuery, params: queryParams };
    };

    // Initial query with user's requested distance
    let queryData = buildDiscoveryQuery(maxDistance);
    query = queryData.query;
    let queryParams = queryData.params;

    let result = await pool.query(query, queryParams);

    // P2: Distance fuzzing - auto-expand search if results < 5
    let expandedSearch = false;
    const originalMaxDistance = maxDistance;

    if (result.rows.length < 5 && userLocation && maxDistance && maxDistance < 200) {
      logger.info('Discovery fuzzing: expanding search radius', {
        userId: authenticatedUserId,
        originalDistance: maxDistance,
        expandedDistance: 200,
        originalResults: result.rows.length
      });

      queryData = buildDiscoveryQuery(200);
      query = queryData.query;
      queryParams = queryData.params;
      result = await pool.query(query, queryParams);
      expandedSearch = true;
    }

    // Resolve all photo keys to presigned URLs in parallel
    const profiles = await Promise.all(result.rows.map(async (profile) => {
      const photoUrls = await resolvePhotoUrls(profile.photos || []);

      // Check if user is new (created in last 48 hours)
      const createdAt = profile.created_at ? new Date(profile.created_at) : null;
      const isNewUser = createdAt && (Date.now() - createdAt.getTime()) < 48 * 60 * 60 * 1000;

      const profileData: any = {
        userId: profile.user_id,
        name: profile.name,
        age: profile.age,
        bio: profile.bio,
        photos: photoUrls,
        interests: profile.interests,
        isNewUser: isNewUser || false,
        isVerified: profile.is_verified || false, // P4: Include verification status
      };

      // P1: Include distance if calculated
      if (profile.distance !== undefined) {
        profileData.distance = Math.round(profile.distance * 10) / 10; // Round to 1 decimal

        // P2: Mark profiles that are beyond original search radius (from fuzzing)
        if (expandedSearch && originalMaxDistance && profile.distance > originalMaxDistance) {
          profileData.expandedSearch = true;
        }
      }

      return profileData;
    }));

    logger.info('Discovery profiles fetched', {
      userId: authenticatedUserId,
      count: profiles.length,
      expandedSearch,
      filters: {
        minAge,
        maxAge,
        maxDistance,
        hasInterests: interests !== null,
        excludeCount: excludeIds.length
      }
    });

    res.json({ success: true, profiles, expandedSearch });
  } catch (error) {
    logger.error('Failed to retrieve profiles', { error });
    res.status(500).json({ success: false, error: 'Failed to retrieve profiles' });
  }
});

// ===== SEARCH ENDPOINTS (for free users to see user counts) =====

// Search for count of users matching criteria
app.post('/profiles/search/count', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;
    const { maxDistance, genders, sexualPreferences, intents } = req.body;

    // Get current user's location for distance filtering
    const locationResult = await pool.query(
      'SELECT latitude, longitude FROM profiles WHERE user_id = $1',
      [authenticatedUserId]
    );

    let userLocation: { latitude: number; longitude: number } | null = null;
    if (locationResult.rows.length > 0 &&
        locationResult.rows[0].latitude !== null &&
        locationResult.rows[0].longitude !== null) {
      userLocation = {
        latitude: locationResult.rows[0].latitude,
        longitude: locationResult.rows[0].longitude
      };
    }

    // Build WHERE clause conditions
    const conditions = [
      'user_id != $1', // Exclude self
      // Exclude users who blocked me
      `user_id NOT IN (SELECT user_id FROM blocks WHERE blocked_user_id = $1)`,
      // Exclude users I blocked
      `user_id NOT IN (SELECT blocked_user_id FROM blocks WHERE user_id = $1)`
    ];
    const params: any[] = [authenticatedUserId];
    let paramIndex = 2;

    // Distance filter - convert miles to km (1 mile = 1.60934 km)
    let distanceFilter = '';
    if (userLocation && maxDistance) {
      const maxDistanceKm = maxDistance * 1.60934;
      distanceFilter = `
        AND latitude IS NOT NULL
        AND longitude IS NOT NULL
        AND (
          6371 * acos(
            cos(radians($${paramIndex})) * cos(radians(latitude)) *
            cos(radians(longitude) - radians($${paramIndex + 1})) +
            sin(radians($${paramIndex})) * sin(radians(latitude))
          )
        ) <= $${paramIndex + 2}
      `;
      params.push(userLocation.latitude, userLocation.longitude, maxDistanceKm);
      paramIndex += 3;
    }

    // Build dynamic filter conditions for gender, sexual preference, and intent
    // These columns were added in migration 019_add_profile_filters.sql
    let filterConditions = '';

    if (genders && Array.isArray(genders) && genders.length > 0) {
      filterConditions += ` AND gender = ANY($${paramIndex})`;
      params.push(genders);
      paramIndex++;
    }

    if (sexualPreferences && Array.isArray(sexualPreferences) && sexualPreferences.length > 0) {
      filterConditions += ` AND sexual_preference = ANY($${paramIndex})`;
      params.push(sexualPreferences);
      paramIndex++;
    }

    if (intents && Array.isArray(intents) && intents.length > 0) {
      filterConditions += ` AND intent = ANY($${paramIndex})`;
      params.push(intents);
      paramIndex++;
    }

    const whereClause = conditions.join(' AND ');

    const countQuery = `
      SELECT COUNT(*) as count
      FROM profiles
      WHERE ${whereClause}
      ${distanceFilter}
      ${filterConditions}
    `;

    const result = await pool.query(countQuery, params);
    const count = parseInt(result.rows[0].count);

    logger.info('Search count executed', {
      userId: authenticatedUserId,
      maxDistance,
      hasLocation: userLocation !== null,
      genderFilters: genders?.length || 0,
      preferenceFilters: sexualPreferences?.length || 0,
      intentFilters: intents?.length || 0,
      count
    });

    res.json({ success: true, count });
  } catch (error) {
    logger.error('Failed to search user count', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to search' });
  }
});

// ===== SWIPE ENDPOINTS =====

// Record a swipe (like/pass) and check for mutual match
app.post('/swipes', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;
    const { targetUserId, action } = req.body;

    // Validate input
    if (!targetUserId || !action) {
      return res.status(400).json({
        success: false,
        error: 'targetUserId and action are required'
      });
    }

    if (!['like', 'pass'].includes(action)) {
      return res.status(400).json({
        success: false,
        error: 'action must be "like" or "pass"'
      });
    }

    if (targetUserId === authenticatedUserId) {
      return res.status(400).json({
        success: false,
        error: 'Cannot swipe on yourself'
      });
    }

    // Check if target user exists
    const targetUserResult = await pool.query(
      'SELECT user_id FROM profiles WHERE user_id = $1',
      [targetUserId]
    );

    if (targetUserResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Target user not found'
      });
    }

    // Record the swipe (upsert to handle re-swipes)
    await pool.query(
      `INSERT INTO swipes (user_id, target_user_id, action, created_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (user_id, target_user_id)
       DO UPDATE SET action = $3, created_at = CURRENT_TIMESTAMP`,
      [authenticatedUserId, targetUserId, action]
    );

    logger.info('Swipe recorded', {
      userId: authenticatedUserId,
      targetUserId,
      action
    });

    // If action is 'like', check for mutual like
    let isMatch = false;
    if (action === 'like') {
      const mutualLikeResult = await pool.query(
        `SELECT id FROM swipes
         WHERE user_id = $1 AND target_user_id = $2 AND action = 'like'`,
        [targetUserId, authenticatedUserId]
      );

      isMatch = mutualLikeResult.rows.length > 0;

      if (isMatch) {
        logger.info('Mutual match detected', {
          userId: authenticatedUserId,
          targetUserId
        });

        // Award first match tickets to both users (one-time per user)
        await Promise.all([
          awardFirstMatchTicket(authenticatedUserId),
          awardFirstMatchTicket(targetUserId)
        ]);

        // Send push notifications to both users about the match
        // Get user names for the notifications
        const matchProfilesResult = await pool.query(
          'SELECT user_id, name FROM profiles WHERE user_id IN ($1, $2)',
          [authenticatedUserId, targetUserId]
        );

        if (matchProfilesResult.rows.length === 2) {
          const currentUserProfile = matchProfilesResult.rows.find((p: any) => p.user_id === authenticatedUserId);
          const targetUserProfile = matchProfilesResult.rows.find((p: any) => p.user_id === targetUserId);

          if (currentUserProfile && targetUserProfile) {
            // Generate a match ID for deep linking (matches the format used in chat-service)
            const matchId = generateMatchId();

            // Create the match record in the database FIRST
            try {
              await pool.query(
                `INSERT INTO matches (id, user_id_1, user_id_2)
                 VALUES ($1, $2, $3)
                 ON CONFLICT DO NOTHING`,
                [matchId, authenticatedUserId, targetUserId]
              );
              logger.info('Match created from mutual swipe', { matchId, user1: authenticatedUserId, user2: targetUserId });
            } catch (err) {
              logger.error('Failed to create match record', { matchId, error: err });
              // Continue anyway - users already liked each other, notifications should still be sent
            }

            // THEN send notifications to both users about the match
            // Send notification to current user about matching with target user (fire and forget)
            sendMatchNotification(pool, authenticatedUserId, targetUserProfile.name, matchId).catch(err =>
              logger.error('Failed to send match notification to current user', { userId: authenticatedUserId, error: err })
            );

            // Send notification to target user about matching with current user (fire and forget)
            sendMatchNotification(pool, targetUserId, currentUserProfile.name, matchId).catch(err =>
              logger.error('Failed to send match notification to target user', { userId: targetUserId, error: err })
            );
          }
        }
      }
    }

    res.json({
      success: true,
      action,
      isMatch,
      message: isMatch ? 'It\'s a match!' : (action === 'like' ? 'Like recorded' : 'Pass recorded')
    });
  } catch (error) {
    logger.error('Failed to record swipe', {
      error,
      userId: req.user?.userId,
      targetUserId: req.body.targetUserId
    });
    res.status(500).json({ success: false, error: 'Failed to record swipe' });
  }
});

// Get users who have liked the current user (for "See who likes you" feature)
app.get('/swipes/received', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;

    const result = await pool.query(
      `SELECT s.user_id, s.created_at, p.name, p.age, p.photos
       FROM swipes s
       JOIN profiles p ON p.user_id = s.user_id
       WHERE s.target_user_id = $1 AND s.action = 'like'
       ORDER BY s.created_at DESC`,
      [authenticatedUserId]
    );

    const likes = await Promise.all(result.rows.map(async (row) => ({
      userId: row.user_id,
      name: row.name,
      age: row.age,
      photos: await resolvePhotoUrls(row.photos || []),
      likedAt: row.created_at
    })));

    res.json({ success: true, likes });
  } catch (error) {
    logger.error('Failed to get received likes', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to get received likes' });
  }
});

// Get users the current user has liked (sent likes - for matches screen)
app.get('/swipes/sent', authMiddleware, generalLimiter, async (req: Request, res: Response) => {
  try {
    const authenticatedUserId = req.user!.userId;

    const result = await pool.query(
      `SELECT s.target_user_id, s.created_at, p.name, p.age, p.photos
       FROM swipes s
       JOIN profiles p ON p.user_id = s.target_user_id
       WHERE s.user_id = $1 AND s.action = 'like'
       ORDER BY s.created_at DESC`,
      [authenticatedUserId]
    );

    const likes = await Promise.all(result.rows.map(async (row) => ({
      target_user_id: row.target_user_id,
      name: row.name,
      age: row.age,
      photos: await resolvePhotoUrls(row.photos || []),
      created_at: row.created_at
    })));

    res.json({ success: true, likes });
  } catch (error) {
    logger.error('Failed to get sent likes', { error, userId: req.user?.userId });
    res.status(500).json({ success: false, error: 'Failed to get sent likes' });
  }
});

// After Hours routes
const afterHoursRouter = createAfterHoursRouter(pool, upload);
app.use('/api/after-hours', afterHoursRouter);
logger.info('After Hours routes mounted at /api/after-hours');

// Sentry error handler - must be after all routes but before generic error handler
if (process.env.SENTRY_DSN) {
  Sentry.setupExpressErrorHandler(app);
}

// Generic error handler (optional - for catching any remaining errors)
app.use((err: any, req: Request, res: Response, next: any) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method
  });
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// Graceful shutdown handlers
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await closeMatchingScheduler();
  await closeSessionScheduler();
  await closeSessionCleanupJob();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await closeMatchingScheduler();
  await closeSessionScheduler();
  await closeSessionCleanupJob();
  process.exit(0);
});

// Only start server if not in test environment
if (process.env.NODE_ENV !== 'test') {
  // Initialize upload directory and session scheduler before starting server
  initializeUploadDirectory()
    .then(async () => {
      // Initialize session scheduler (BullMQ)
      // In production, consider making this fatal (process.exit(1)) if Redis is required
      try {
        await initializeSessionWorker(pool);
        logger.info('Session scheduler initialized successfully');
      } catch (err: any) {
        logger.error('Failed to initialize session scheduler - sessions will NOT auto-expire', {
          error: err.message,
          hint: 'Ensure REDIS_URL is set and Redis is accessible',
        });
        // Continue startup - sessions will still work but won't auto-expire
        // For stricter behavior, uncomment: process.exit(1);
      }

      // Initialize matching scheduler (uses Redis pub/sub for event delivery)
      // Note: Match events are published to Redis channel 'after_hours:events'
      // chat-service subscribes to this channel and delivers to clients via Socket.IO
      initializeMatchingScheduler(pool).catch((err) => {
        logger.error('Failed to initialize matching scheduler', { error: err.message });
        logger.warn('Matching will not work automatically. Start Redis and restart.');
      });

      // Initialize session cleanup job (non-blocking)
      // Runs daily at 4 AM UTC to clean expired sessions and orphaned data
      initializeSessionCleanupJob(pool).catch((err) => {
        logger.warn('Session cleanup job initialization failed', { error: err.message });
      });

      app.listen(PORT, () => {
        logger.info(`Profile service started`, { port: PORT, environment: process.env.NODE_ENV || 'development' });
      });
    })
    .catch((error) => {
      logger.error('Failed to initialize upload directory', { error });
      process.exit(1);
    });
}

// Export for testing
export default app;
