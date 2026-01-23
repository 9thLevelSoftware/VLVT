/**
 * After Hours Profile Router
 *
 * Provides CRUD endpoints for After Hours profiles (separate from main profiles).
 * All routes require:
 * - JWT authentication (via authMiddleware)
 * - Premium subscription + ID verification + GDPR consent (via createAfterHoursAuthMiddleware)
 *
 * Endpoints:
 * - POST /profile - Create After Hours profile
 * - GET /profile - Get own After Hours profile
 * - PATCH /profile - Update After Hours profile
 * - POST /profile/photo - Upload/replace After Hours photo
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
} from '../middleware/after-hours-validation';
import {
  validateImage,
  validateImageMagicBytes,
  processImage,
} from '../utils/image-handler';
import { resolvePhotoUrl, uploadToR2, getPresignedUrl } from '../utils/r2-client';
import logger from '../utils/logger';
import sharp from 'sharp';

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

  return router;
}
