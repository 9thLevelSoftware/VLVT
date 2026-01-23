/**
 * After Hours Router
 *
 * Provides CRUD endpoints for After Hours profiles, preferences, sessions, and matching (separate from main profiles).
 * All routes require:
 * - JWT authentication (via authMiddleware)
 * - Premium subscription + ID verification + GDPR consent (via createAfterHoursAuthMiddleware)
 *
 * Endpoints:
 * - POST /profile - Create After Hours profile
 * - GET /profile - Get own After Hours profile
 * - PATCH /profile - Update After Hours profile
 * - POST /profile/photo - Upload/replace After Hours photo
 * - POST /preferences - Create After Hours preferences (with smart defaults)
 * - GET /preferences - Get After Hours preferences
 * - PATCH /preferences - Update After Hours preferences
 * - POST /session/start - Start a timed After Hours session
 * - POST /session/end - End session early
 * - POST /session/extend - Extend active session
 * - GET /session - Get current session status
 * - POST /match/decline - Decline current match (silent, 3-session memory)
 * - GET /match/current - Get current match status (match or searching)
 * - GET /nearby/count - Get active user count nearby (social proof)
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import multer from 'multer';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { authMiddleware } from '../middleware/auth';
import { createAfterHoursAuthMiddleware } from '@vlvt/shared';
import {
  validateAfterHoursProfile,
  validateAfterHoursProfileUpdate,
  validatePreferences,
  validatePreferencesUpdate,
  validateSessionStart,
  validateSessionExtend,
  validateDecline,
} from '../middleware/after-hours-validation';
import { fuzzLocationForAfterHours } from '../utils/location-fuzzer';
import {
  scheduleSessionExpiry,
  cancelSessionExpiry,
  extendSessionExpiry,
} from '../services/session-scheduler';
import {
  validateImage,
  validateImageMagicBytes,
  processImage,
} from '../utils/image-handler';
import { resolvePhotoUrl, uploadToR2, getPresignedUrl } from '../utils/r2-client';
import logger from '../utils/logger';
import sharp from 'sharp';
import { triggerMatchingForUser, cancelAutoDecline } from '../services/matching-scheduler';
import { getActiveUserCountNearby } from '../services/matching-engine';

/**
 * Calculate Haversine distance between two points in km
 */
function calculateHaversineDistance(
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Factory function to create After Hours router with injected dependencies
 *
 * @param pool - PostgreSQL connection pool
 * @param upload - Configured multer instance for file uploads
 * @returns Express Router with After Hours endpoints
 */
export function createAfterHoursRouter(pool: Pool, upload: multer.Multer): Router {
  const router = Router();

  // Create After Hours auth middleware with dependencies
  const afterHoursAuth = createAfterHoursAuthMiddleware({ pool, logger });

  // Apply middleware chain to all routes: JWT auth + After Hours auth
  router.use(authMiddleware, afterHoursAuth);

  /**
   * POST /profile - Create After Hours profile
   *
   * Creates a new After Hours profile for the authenticated user.
   * photo_url is initialized to empty string (NOT NULL constraint satisfied).
   * Users upload their photo separately via POST /profile/photo.
   */
  router.post('/profile', validateAfterHoursProfile, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { description } = req.body;

      // Insert new After Hours profile with empty photo_url
      // Photo is uploaded separately via POST /profile/photo
      const result = await pool.query(
        `INSERT INTO after_hours_profiles (user_id, photo_url, description)
         VALUES ($1, $2, $3)
         RETURNING user_id, photo_url, description, created_at, updated_at`,
        [userId, '', description || null]
      );

      const profile = result.rows[0];

      logger.info('After Hours profile created', { userId });

      res.status(201).json({
        success: true,
        profile: {
          userId: profile.user_id,
          photoUrl: profile.photo_url || null,
          description: profile.description,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
      });
    } catch (error: any) {
      // Handle duplicate profile error (unique constraint violation)
      if (error.code === '23505') {
        logger.warn('After Hours profile already exists', { userId: req.user?.userId });
        return res.status(409).json({
          success: false,
          error: 'After Hours profile already exists for this user',
        });
      }

      logger.error('Failed to create After Hours profile', {
        error: error.message,
        code: error.code,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to create After Hours profile',
      });
    }
  });

  /**
   * GET /profile - Get own After Hours profile
   *
   * Returns the authenticated user's After Hours profile with inherited
   * name and age from their main profile. Photo URL is resolved to presigned URL.
   */
  router.get('/profile', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;

      // Query After Hours profile with JOIN to main profile for name/age
      const result = await pool.query(
        `SELECT
           ah.user_id,
           ah.photo_url,
           ah.description,
           ah.created_at,
           ah.updated_at,
           p.name,
           p.age
         FROM after_hours_profiles ah
         JOIN profiles p ON ah.user_id = p.user_id
         WHERE ah.user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'After Hours profile not found',
        });
      }

      const profile = result.rows[0];

      // Resolve photo_url to presigned URL if present (skip if empty string)
      let photoUrl: string | null = null;
      if (profile.photo_url && profile.photo_url !== '') {
        try {
          photoUrl = await resolvePhotoUrl(profile.photo_url);
        } catch (error) {
          logger.warn('Failed to resolve After Hours photo URL', { userId, error });
          // Continue with null photoUrl rather than failing the request
        }
      }

      res.json({
        success: true,
        profile: {
          userId: profile.user_id,
          name: profile.name,
          age: profile.age,
          photoUrl,
          description: profile.description,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
      });
    } catch (error: any) {
      logger.error('Failed to get After Hours profile', {
        error: error.message,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get After Hours profile',
      });
    }
  });

  /**
   * PATCH /profile - Update After Hours profile
   *
   * Updates the description field of the After Hours profile.
   * Photo updates are handled via POST /profile/photo.
   */
  router.patch('/profile', validateAfterHoursProfileUpdate, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { description } = req.body;

      const result = await pool.query(
        `UPDATE after_hours_profiles
         SET description = COALESCE($2, description),
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1
         RETURNING user_id, photo_url, description, created_at, updated_at`,
        [userId, description]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'After Hours profile not found',
        });
      }

      const profile = result.rows[0];

      // Resolve photo_url to presigned URL if present
      let photoUrl: string | null = null;
      if (profile.photo_url && profile.photo_url !== '') {
        try {
          photoUrl = await resolvePhotoUrl(profile.photo_url);
        } catch (error) {
          logger.warn('Failed to resolve After Hours photo URL', { userId, error });
        }
      }

      logger.info('After Hours profile updated', { userId });

      res.json({
        success: true,
        profile: {
          userId: profile.user_id,
          photoUrl,
          description: profile.description,
          createdAt: profile.created_at,
          updatedAt: profile.updated_at,
        },
      });
    } catch (error: any) {
      logger.error('Failed to update After Hours profile', {
        error: error.message,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update After Hours profile',
      });
    }
  });

  /**
   * POST /profile/photo - Upload/replace After Hours photo
   *
   * Uploads a single photo for the After Hours profile.
   * Replaces any existing photo (After Hours profiles have only one photo).
   * Photo is processed (resized, EXIF stripped) and uploaded to R2.
   */
  router.post(
    '/profile/photo',
    upload.single('photo'),
    async (req: Request, res: Response) => {
      try {
        const userId = req.user!.userId;

        // Check if file was uploaded
        if (!req.file) {
          return res.status(400).json({
            success: false,
            error: 'No file uploaded',
          });
        }

        // Validate image (basic MIME type and size check)
        const validation = validateImage(req.file);
        if (!validation.valid) {
          // Clean up temp file if using disk storage
          if (req.file.path) {
            try {
              fs.unlinkSync(req.file.path);
            } catch (e) {
              /* ignore cleanup errors */
            }
          }
          return res.status(400).json({
            success: false,
            error: validation.error,
          });
        }

        // Read file content from disk (multer disk storage) or use buffer (memory storage)
        const fileBuffer = req.file.path
          ? fs.readFileSync(req.file.path)
          : req.file.buffer;

        // Validate magic bytes to prevent malicious files disguised as images
        const magicByteValidation = await validateImageMagicBytes(
          fileBuffer,
          req.file.originalname
        );
        if (!magicByteValidation.valid) {
          // Clean up temp file if using disk storage
          if (req.file.path) {
            try {
              fs.unlinkSync(req.file.path);
            } catch (e) {
              /* ignore cleanup errors */
            }
          }
          logger.warn('Magic byte validation failed for After Hours photo upload', {
            userId,
            filename: req.file.originalname,
            claimedMime: req.file.mimetype,
            error: magicByteValidation.error,
          });
          return res.status(400).json({
            success: false,
            error: magicByteValidation.error,
          });
        }

        // Check if After Hours profile exists
        const profileCheck = await pool.query(
          'SELECT user_id FROM after_hours_profiles WHERE user_id = $1',
          [userId]
        );

        if (profileCheck.rows.length === 0) {
          // Clean up temp file
          if (req.file.path) {
            try {
              fs.unlinkSync(req.file.path);
            } catch (e) {
              /* ignore cleanup errors */
            }
          }
          return res.status(404).json({
            success: false,
            error: 'After Hours profile not found. Create a profile first.',
          });
        }

        // Process and upload image to R2
        // Use dedicated After Hours photo prefix for organization
        const photoId = uuidv4();
        const photoKey = `after-hours-photos/${userId}/${photoId}.jpg`;

        // Process image with sharp (resize, convert to JPEG, strip EXIF)
        const processedBuffer = await sharp(fileBuffer)
          .rotate() // Auto-rotate based on EXIF orientation
          .resize(1200, 1200, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 85, progressive: true })
          .withMetadata({}) // Strip all metadata for privacy
          .toBuffer();

        // Upload to R2
        await uploadToR2(photoKey, processedBuffer, 'image/jpeg');

        // Clean up temp file if using disk storage
        if (req.file.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (e) {
            /* ignore cleanup errors */
          }
        }

        // Update After Hours profile with new photo key
        await pool.query(
          `UPDATE after_hours_profiles
           SET photo_url = $2, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $1`,
          [userId, photoKey]
        );

        // Get presigned URL for the response
        const presignedUrl = await getPresignedUrl(photoKey);

        logger.info('After Hours photo uploaded', {
          userId,
          photoKey,
          originalSize: req.file.size,
          processedSize: processedBuffer.length,
        });

        res.json({
          success: true,
          photo: {
            url: presignedUrl,
            key: photoKey,
          },
        });
      } catch (error: any) {
        // Clean up temp file on error
        if (req.file?.path) {
          try {
            fs.unlinkSync(req.file.path);
          } catch (e) {
            /* ignore cleanup errors */
          }
        }

        logger.error('Failed to upload After Hours photo', {
          error: error.message,
          userId: req.user?.userId,
        });
        res.status(500).json({
          success: false,
          error: 'Failed to upload photo',
        });
      }
    }
  );

  // ============================================
  // PREFERENCES ENDPOINTS
  // ============================================

  /**
   * POST /preferences - Create After Hours preferences
   *
   * Creates preferences with smart defaults inherited from main profile.
   * All fields are optional - defaults are applied for missing values.
   */
  router.post('/preferences', validatePreferences, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { seekingGender, maxDistanceKm, minAge, maxAge, sexualOrientation } = req.body;

      // Check if preferences already exist
      const existing = await pool.query(
        'SELECT user_id FROM after_hours_preferences WHERE user_id = $1',
        [userId]
      );

      if (existing.rows.length > 0) {
        return res.status(409).json({
          success: false,
          error: 'After Hours preferences already exist. Use PATCH to update.',
        });
      }

      // Apply smart defaults from main profile if values not provided
      let finalSeekingGender = seekingGender;
      let finalMaxDistance = maxDistanceKm;
      let finalMinAge = minAge;
      let finalMaxAge = maxAge;
      let finalOrientation = sexualOrientation;

      // Only apply smart defaults on creation (not updates)
      if (!seekingGender || !maxDistanceKm || !minAge || !maxAge) {
        const mainProfileResult = await pool.query(
          `SELECT gender, sexual_preference FROM profiles WHERE user_id = $1`,
          [userId]
        );

        const mainProfile = mainProfileResult.rows[0];
        if (mainProfile) {
          // Infer seeking gender from sexual preference if not provided
          if (!finalSeekingGender && mainProfile.sexual_preference) {
            // Map sexual preference to seeking gender (rough heuristic)
            finalSeekingGender = 'Any'; // Safe default
          }
          finalSeekingGender = finalSeekingGender || 'Any';
        }
      }

      // Apply safe defaults for any remaining nulls
      finalSeekingGender = finalSeekingGender || 'Any';
      finalMaxDistance = finalMaxDistance || 10;
      finalMinAge = finalMinAge || 18;
      finalMaxAge = finalMaxAge || 99;

      // Insert with defaults applied
      const result = await pool.query(
        `INSERT INTO after_hours_preferences
         (user_id, seeking_gender, max_distance_km, min_age, max_age, sexual_orientation)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, finalSeekingGender, finalMaxDistance, finalMinAge, finalMaxAge, finalOrientation]
      );

      const prefs = result.rows[0];

      logger.info('After Hours preferences created', { userId });

      res.status(201).json({
        success: true,
        preferences: {
          seekingGender: prefs.seeking_gender,
          maxDistanceKm: prefs.max_distance_km,
          minAge: prefs.min_age,
          maxAge: prefs.max_age,
          sexualOrientation: prefs.sexual_orientation,
        },
      });
    } catch (error: any) {
      // Handle duplicate preferences error (unique constraint violation)
      if (error.code === '23505') {
        logger.warn('After Hours preferences already exist', { userId: req.user?.userId });
        return res.status(409).json({
          success: false,
          error: 'After Hours preferences already exist. Use PATCH to update.',
        });
      }

      logger.error('Failed to create After Hours preferences', {
        error: error.message,
        code: error.code,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to create After Hours preferences',
      });
    }
  });

  /**
   * GET /preferences - Get After Hours preferences
   *
   * Returns the authenticated user's After Hours preferences.
   */
  router.get('/preferences', async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;

      const result = await pool.query(
        'SELECT * FROM after_hours_preferences WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'After Hours preferences not found',
        });
      }

      const prefs = result.rows[0];

      res.json({
        success: true,
        preferences: {
          seekingGender: prefs.seeking_gender,
          maxDistanceKm: prefs.max_distance_km,
          minAge: prefs.min_age,
          maxAge: prefs.max_age,
          sexualOrientation: prefs.sexual_orientation,
        },
      });
    } catch (error: any) {
      logger.error('Failed to get After Hours preferences', {
        error: error.message,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to get After Hours preferences',
      });
    }
  });

  /**
   * PATCH /preferences - Update After Hours preferences
   *
   * Updates preferences using COALESCE to preserve existing values for fields not provided.
   */
  router.patch('/preferences', validatePreferencesUpdate, async (req: Request, res: Response) => {
    try {
      const userId = req.user!.userId;
      const { seekingGender, maxDistanceKm, minAge, maxAge, sexualOrientation } = req.body;

      const result = await pool.query(
        `UPDATE after_hours_preferences SET
           seeking_gender = COALESCE($2, seeking_gender),
           max_distance_km = COALESCE($3, max_distance_km),
           min_age = COALESCE($4, min_age),
           max_age = COALESCE($5, max_age),
           sexual_orientation = COALESCE($6, sexual_orientation),
           updated_at = NOW()
         WHERE user_id = $1
         RETURNING *`,
        [userId, seekingGender, maxDistanceKm, minAge, maxAge, sexualOrientation]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'After Hours preferences not found',
        });
      }

      const prefs = result.rows[0];

      logger.info('After Hours preferences updated', { userId });

      res.json({
        success: true,
        preferences: {
          seekingGender: prefs.seeking_gender,
          maxDistanceKm: prefs.max_distance_km,
          minAge: prefs.min_age,
          maxAge: prefs.max_age,
          sexualOrientation: prefs.sexual_orientation,
        },
      });
    } catch (error: any) {
      logger.error('Failed to update After Hours preferences', {
        error: error.message,
        userId: req.user?.userId,
      });
      res.status(500).json({
        success: false,
        error: 'Failed to update After Hours preferences',
      });
    }
  });

  // ============================================
  // SESSION LIFECYCLE ENDPOINTS
  // ============================================

  /**
   * POST /session/start - Start a timed After Hours session
   *
   * Creates a new session with the user's current location (fuzzed for privacy).
   * Requires an existing After Hours profile and no currently active session.
   * Session will auto-expire after the specified duration via BullMQ.
   */
  router.post('/session/start', validateSessionStart, async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { duration, latitude, longitude } = req.body;

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check user has After Hours profile (required before session)
      const profileCheck = await client.query(
        'SELECT user_id FROM after_hours_profiles WHERE user_id = $1',
        [userId]
      );
      if (profileCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          success: false,
          error: 'After Hours profile required before starting session',
          code: 'PROFILE_REQUIRED',
        });
      }

      // Check for existing active session
      const existingSession = await client.query(
        `SELECT id FROM after_hours_sessions
         WHERE user_id = $1 AND ended_at IS NULL`,
        [userId]
      );
      if (existingSession.rows.length > 0) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          error: 'Active session already exists',
          code: 'SESSION_ALREADY_ACTIVE',
        });
      }

      // Fuzz location for privacy
      const fuzzed = fuzzLocationForAfterHours(latitude, longitude);

      // Calculate expiry time
      const durationMinutes = duration;
      const expiresAt = new Date(Date.now() + durationMinutes * 60 * 1000);

      // Create session
      const result = await client.query(
        `INSERT INTO after_hours_sessions
         (user_id, expires_at, latitude, longitude, fuzzed_latitude, fuzzed_longitude)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, started_at, expires_at`,
        [userId, expiresAt, latitude, longitude, fuzzed.latitude, fuzzed.longitude]
      );

      await client.query('COMMIT');

      const session = result.rows[0];

      // Schedule expiry job (fire-and-forget, session persists regardless)
      scheduleSessionExpiry(session.id, userId, durationMinutes * 60 * 1000).catch((err) => {
        logger.error('Failed to schedule session expiry', {
          sessionId: session.id,
          error: err.message,
        });
      });

      // Trigger matching after 15-second delay (gives user time to see the session UI)
      triggerMatchingForUser(userId, session.id, 15000).catch((err) => {
        logger.error('Failed to trigger matching after session start', {
          sessionId: session.id,
          error: err.message,
        });
      });

      logger.info('Session started', {
        userId,
        sessionId: session.id,
        durationMinutes,
        expiresAt: session.expires_at,
      });

      res.status(201).json({
        success: true,
        session: {
          id: session.id,
          startedAt: session.started_at,
          expiresAt: session.expires_at,
          durationMinutes,
        },
      });
    } catch (error: any) {
      await client.query('ROLLBACK');
      logger.error('Failed to start session', { error: error.message, userId });
      res.status(500).json({ success: false, error: 'Failed to start session' });
    } finally {
      client.release();
    }
  });

  /**
   * POST /session/end - End session early
   *
   * Terminates the user's active session and cancels the scheduled expiry job.
   */
  router.post('/session/end', async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    try {
      const result = await pool.query(
        `UPDATE after_hours_sessions
         SET ended_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND ended_at IS NULL
         RETURNING id`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No active session found',
        });
      }

      const sessionId = result.rows[0].id;

      // Cancel the scheduled expiry job
      cancelSessionExpiry(sessionId).catch((err) => {
        logger.error('Failed to cancel session expiry', {
          sessionId,
          error: err.message,
        });
      });

      logger.info('Session ended early', { userId, sessionId });

      res.json({
        success: true,
        message: 'Session ended',
      });
    } catch (error: any) {
      logger.error('Failed to end session', { error: error.message, userId });
      res.status(500).json({ success: false, error: 'Failed to end session' });
    }
  });

  /**
   * POST /session/extend - Extend active session
   *
   * Extends the user's active session by the specified duration and reschedules expiry.
   */
  router.post('/session/extend', validateSessionExtend, async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { additionalMinutes } = req.body;

    try {
      // Get current active session
      const sessionResult = await pool.query(
        `SELECT id, expires_at FROM after_hours_sessions
         WHERE user_id = $1 AND ended_at IS NULL`,
        [userId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'No active session to extend',
        });
      }

      const session = sessionResult.rows[0];
      const currentExpiry = new Date(session.expires_at);
      const newExpiry = new Date(currentExpiry.getTime() + additionalMinutes * 60 * 1000);
      const remainingMs = newExpiry.getTime() - Date.now();

      // Update session expiry
      await pool.query(
        `UPDATE after_hours_sessions SET expires_at = $1 WHERE id = $2`,
        [newExpiry, session.id]
      );

      // Reschedule the expiry job
      extendSessionExpiry(session.id, userId, remainingMs).catch((err) => {
        logger.error('Failed to extend session expiry', {
          sessionId: session.id,
          error: err.message,
        });
      });

      logger.info('Session extended', {
        userId,
        sessionId: session.id,
        additionalMinutes,
        newExpiry,
      });

      res.json({
        success: true,
        session: {
          id: session.id,
          expiresAt: newExpiry,
          extendedByMinutes: additionalMinutes,
        },
      });
    } catch (error: any) {
      logger.error('Failed to extend session', { error: error.message, userId });
      res.status(500).json({ success: false, error: 'Failed to extend session' });
    }
  });

  /**
   * GET /session - Get current session status
   *
   * Returns the user's current session status including remaining time.
   */
  router.get('/session', async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    try {
      const result = await pool.query(
        `SELECT id, started_at, expires_at,
                EXTRACT(EPOCH FROM (expires_at - NOW())) AS remaining_seconds
         FROM after_hours_sessions
         WHERE user_id = $1 AND ended_at IS NULL`,
        [userId]
      );

      if (result.rows.length === 0) {
        return res.json({
          success: true,
          active: false,
          session: null,
        });
      }

      const session = result.rows[0];
      const remainingSeconds = Math.max(0, Math.floor(session.remaining_seconds));

      res.json({
        success: true,
        active: remainingSeconds > 0,
        session: {
          id: session.id,
          startedAt: session.started_at,
          expiresAt: session.expires_at,
          remainingSeconds,
        },
      });
    } catch (error: any) {
      logger.error('Failed to get session status', { error: error.message, userId });
      res.status(500).json({ success: false, error: 'Failed to get session status' });
    }
  });

  // ============================================
  // MATCHING ENDPOINTS
  // ============================================

  /**
   * POST /match/decline - Decline current match
   *
   * Silently declines the current match. The other user is NOT notified.
   * Records decline with 3-session memory (declined user won't appear for 3 sessions).
   * Triggers matching to find next candidate after 30-second cooldown.
   */
  router.post('/match/decline', validateDecline, async (req: Request, res: Response) => {
    const userId = req.user!.userId;
    const { matchId } = req.body;

    try {
      // Get current active session
      const sessionResult = await pool.query(
        `SELECT id FROM after_hours_sessions WHERE user_id = $1 AND ended_at IS NULL`,
        [userId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No active session',
          code: 'NO_ACTIVE_SESSION',
        });
      }

      const sessionId = sessionResult.rows[0].id;

      // Get the match and verify user is part of it
      const matchResult = await pool.query(
        `SELECT id, user_id_1, user_id_2
         FROM after_hours_matches
         WHERE id = $1
           AND (user_id_1 = $2 OR user_id_2 = $2)
           AND declined_by IS NULL`,
        [matchId, userId]
      );

      if (matchResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Match not found or already declined',
        });
      }

      const match = matchResult.rows[0];
      const declinedUserId = match.user_id_1 === userId ? match.user_id_2 : match.user_id_1;

      // Record decline with 3-session memory (UPSERT pattern)
      await pool.query(
        `INSERT INTO after_hours_declines
         (user_id, declined_user_id, session_id, decline_count, first_declined_at, last_session_id)
         VALUES ($1, $2, $3, 1, NOW(), $3)
         ON CONFLICT (user_id, declined_user_id)
         DO UPDATE SET
           decline_count = CASE
             WHEN after_hours_declines.decline_count >= 3 THEN 1  -- Reset after 3 (they can reappear)
             ELSE after_hours_declines.decline_count + 1
           END,
           last_session_id = $3`,
        [userId, declinedUserId, sessionId]
      );

      // Mark match as declined
      await pool.query(
        `UPDATE after_hours_matches
         SET declined_by = $1, declined_at = NOW()
         WHERE id = $2`,
        [userId, matchId]
      );

      // Cancel the auto-decline job since user manually declined
      cancelAutoDecline(matchId).catch((err) => {
        logger.error('Failed to cancel auto-decline', { matchId, error: err.message });
      });

      logger.info('Match declined', { userId, matchId, declinedUserId });

      // Trigger matching after 30-second cooldown
      triggerMatchingForUser(userId, sessionId, 30000).catch((err) => {
        logger.error('Failed to trigger matching after decline', { error: err.message });
      });

      res.json({
        success: true,
        message: 'Match declined',
      });
    } catch (error: any) {
      logger.error('Failed to decline match', { error: error.message, userId });
      res.status(500).json({ success: false, error: 'Failed to decline match' });
    }
  });

  /**
   * GET /match/current - Get current match status
   *
   * Returns the user's current undeclined match (if any) or searching status.
   * Used when app reopens to restore match card state.
   */
  router.get('/match/current', async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    try {
      // Check for active session first
      const sessionResult = await pool.query(
        `SELECT id, fuzzed_latitude, fuzzed_longitude FROM after_hours_sessions
         WHERE user_id = $1 AND ended_at IS NULL`,
        [userId]
      );

      if (sessionResult.rows.length === 0) {
        return res.json({
          success: true,
          active: false,
          status: 'no_session',
          match: null,
        });
      }

      // Get current undeclined match
      const matchResult = await pool.query(
        `SELECT m.id, m.expires_at, m.created_at,
                p.name, p.age, ahp.photo_url, ahp.description,
                s.fuzzed_latitude, s.fuzzed_longitude,
                m.user_id_1, m.user_id_2
         FROM after_hours_matches m
         JOIN after_hours_sessions s ON
           (m.user_id_1 = $1 AND s.user_id = m.user_id_2 AND s.ended_at IS NULL) OR
           (m.user_id_2 = $1 AND s.user_id = m.user_id_1 AND s.ended_at IS NULL)
         JOIN profiles p ON p.user_id = s.user_id
         JOIN after_hours_profiles ahp ON ahp.user_id = s.user_id
         WHERE (m.user_id_1 = $1 OR m.user_id_2 = $1)
           AND m.declined_by IS NULL
           AND m.expires_at > NOW()
         ORDER BY m.created_at DESC
         LIMIT 1`,
        [userId]
      );

      if (matchResult.rows.length === 0) {
        return res.json({
          success: true,
          active: true,
          status: 'searching',
          match: null,
        });
      }

      const match = matchResult.rows[0];

      // Resolve photo URL using resolvePhotoUrl from ../utils/r2-client
      let photoUrl: string | null = null;
      if (match.photo_url && match.photo_url !== '') {
        try {
          photoUrl = await resolvePhotoUrl(match.photo_url);
        } catch (err) {
          logger.warn('Failed to resolve match photo URL', { matchId: match.id });
        }
      }

      // Calculate distance from user's session to match's session
      const userSession = sessionResult.rows[0];
      const distanceKm = calculateHaversineDistance(
        parseFloat(userSession.fuzzed_latitude),
        parseFloat(userSession.fuzzed_longitude),
        parseFloat(match.fuzzed_latitude),
        parseFloat(match.fuzzed_longitude)
      );

      // Calculate auto-decline time (5 minutes from match creation, or match expiry, whichever is sooner)
      const autoDeclineAt = new Date(Math.min(
        new Date(match.created_at).getTime() + 5 * 60 * 1000,
        new Date(match.expires_at).getTime()
      ));

      res.json({
        success: true,
        active: true,
        status: 'matched',
        match: {
          id: match.id,
          expiresAt: match.expires_at,
          autoDeclineAt,
          profile: {
            name: match.name,
            age: match.age,
            photoUrl,
            description: match.description,
            distanceKm: Math.round(distanceKm * 10) / 10, // 1 decimal place
          },
        },
      });
    } catch (error: any) {
      logger.error('Failed to get current match', { error: error.message, userId });
      res.status(500).json({ success: false, error: 'Failed to get match status' });
    }
  });

  /**
   * GET /nearby/count - Get count of active users nearby
   *
   * Returns count of active After Hours sessions within user's max distance preference.
   * Used for social proof ("12 people nearby in After Hours").
   */
  router.get('/nearby/count', async (req: Request, res: Response) => {
    const userId = req.user!.userId;

    try {
      // Get user's session and preferences
      const sessionResult = await pool.query(
        `SELECT s.fuzzed_latitude, s.fuzzed_longitude, p.max_distance_km
         FROM after_hours_sessions s
         JOIN after_hours_preferences p ON p.user_id = s.user_id
         WHERE s.user_id = $1 AND s.ended_at IS NULL`,
        [userId]
      );

      if (sessionResult.rows.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No active session',
          code: 'NO_ACTIVE_SESSION',
        });
      }

      const { fuzzed_latitude, fuzzed_longitude, max_distance_km } = sessionResult.rows[0];

      const count = await getActiveUserCountNearby(
        pool,
        { lat: parseFloat(fuzzed_latitude), lng: parseFloat(fuzzed_longitude) },
        parseFloat(max_distance_km)
      );

      res.json({
        success: true,
        count: Math.max(0, count - 1), // Exclude self from count, ensure non-negative
        maxDistanceKm: parseFloat(max_distance_km),
      });
    } catch (error: any) {
      logger.error('Failed to get nearby count', { error: error.message, userId });
      res.status(500).json({ success: false, error: 'Failed to get nearby count' });
    }
  });

  return router;
}
