import sharp from 'sharp';
import { v4 as uuidv4 } from 'uuid';
import { promises as fs } from 'fs';
import path from 'path';
import fileType from 'file-type';
import logger from './logger';
import { uploadToR2, deleteFromR2, validateR2Config } from './r2-client';

// Configuration
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const MAX_PHOTOS_PER_PROFILE = 6;

// Allowed MIME types for magic byte validation (more specific than extension-based)
const ALLOWED_MAGIC_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
];

// Image sizes for optimization
const IMAGE_SIZES = {
  thumbnail: { width: 200, height: 200 },
  medium: { width: 800, height: 800 },
  large: { width: 1200, height: 1200 },
};

export interface ProcessedImage {
  id: string;
  key: string;           // R2 object key (stored in database)
  thumbnailKey: string;  // R2 thumbnail key (stored in database)
  originalSize: number;
  processedSize: number;
}

export interface MagicByteValidationResult {
  valid: boolean;
  mimeType?: string;
  error?: string;
}

/**
 * Initialize R2 storage - validates configuration
 */
export async function initializeStorage(): Promise<void> {
  if (!validateR2Config()) {
    throw new Error('R2 configuration is incomplete. Check environment variables.');
  }
  logger.info('R2 storage initialized');
}

/**
 * Validate uploaded image file
 */
export function validateImage(file: Express.Multer.File): { valid: boolean; error?: string } {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds ${MAX_FILE_SIZE / 1024 / 1024}MB limit` };
  }

  // Check MIME type
  if (!ALLOWED_MIME_TYPES.includes(file.mimetype.toLowerCase())) {
    return { valid: false, error: 'Invalid file type. Only JPEG, PNG, HEIC, HEIF, and WebP images are allowed' };
  }

  return { valid: true };
}

/**
 * Validate file magic bytes to ensure file content matches claimed type
 * This prevents attacks where malicious files are disguised as images
 * by simply changing the file extension
 *
 * @param buffer - File content as Buffer
 * @param filename - Original filename (for extension mismatch warning)
 * @returns Validation result with detected MIME type
 */
export async function validateImageMagicBytes(
  buffer: Buffer,
  filename: string
): Promise<MagicByteValidationResult> {
  try {
    // Detect actual file type from magic bytes
    const detected = await fileType.fromBuffer(buffer);

    // If file-type library cannot detect the type, reject it
    if (!detected) {
      logger.warn('Magic byte validation failed: unknown file type', { filename });
      return {
        valid: false,
        error: 'Unable to determine file type. File may be corrupted or unsupported.',
      };
    }

    // Check if detected MIME type is in allowed list
    if (!ALLOWED_MAGIC_MIME_TYPES.includes(detected.mime)) {
      logger.warn('Magic byte validation failed: disallowed MIME type', {
        filename,
        detectedMime: detected.mime,
        detectedExt: detected.ext,
      });
      return {
        valid: false,
        mimeType: detected.mime,
        error: `File content is ${detected.mime}, which is not an allowed image type. Only JPEG, PNG, WebP, HEIC, and HEIF images are accepted.`,
      };
    }

    // Check for extension mismatch (warn but don't reject)
    const fileExt = path.extname(filename).toLowerCase().replace('.', '');
    const expectedExts = getExpectedExtensions(detected.mime);

    if (fileExt && !expectedExts.includes(fileExt)) {
      logger.warn('Magic byte validation: extension mismatch', {
        filename,
        claimedExtension: fileExt,
        detectedMime: detected.mime,
        expectedExtensions: expectedExts,
      });
      // Note: We warn but don't reject - some systems may rename files
    }

    logger.debug('Magic byte validation passed', {
      filename,
      detectedMime: detected.mime,
      detectedExt: detected.ext,
    });

    return {
      valid: true,
      mimeType: detected.mime,
    };
  } catch (error) {
    logger.error('Magic byte validation error', { filename, error });
    return {
      valid: false,
      error: 'Failed to validate file type.',
    };
  }
}

/**
 * Get expected file extensions for a MIME type
 */
function getExpectedExtensions(mimeType: string): string[] {
  const extensionMap: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/heic': ['heic'],
    'image/heif': ['heif', 'heics'],
  };
  return extensionMap[mimeType] || [];
}

/**
 * Process and upload image to R2
 * Creates thumbnail and optimized versions, uploads both to R2
 * Supports both memory storage (file.buffer) and disk storage (file.path)
 * Returns R2 object keys (NOT URLs - URLs are generated on-demand via presigning)
 */
export async function processImage(file: Express.Multer.File, userId: string): Promise<ProcessedImage> {
  const photoId = uuidv4();

  // Determine input source: disk storage uses file.path, memory storage uses file.buffer
  const inputSource = file.path || file.buffer;
  const usingDiskStorage = !!file.path;

  try {
    // Process main image (large size)
    const largeBuffer = await sharp(inputSource)
      .rotate() // Auto-rotate based on EXIF orientation AND strip all EXIF metadata (including GPS location)
      .resize(IMAGE_SIZES.large.width, IMAGE_SIZES.large.height, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, progressive: true })
      .withMetadata({}) // Explicitly remove all metadata for privacy
      .toBuffer();

    // Process thumbnail
    const thumbnailBuffer = await sharp(inputSource)
      .rotate() // Auto-rotate and strip EXIF from thumbnail too
      .resize(IMAGE_SIZES.thumbnail.width, IMAGE_SIZES.thumbnail.height, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 })
      .withMetadata({}) // Remove metadata from thumbnail
      .toBuffer();

    // Upload to R2
    // Key format: photos/{userId}/{photoId}.jpg
    const largeKey = `photos/${userId}/${photoId}.jpg`;
    const thumbnailKey = `photos/${userId}/${photoId}_thumb.jpg`;

    await Promise.all([
      uploadToR2(largeKey, largeBuffer, 'image/jpeg'),
      uploadToR2(thumbnailKey, thumbnailBuffer, 'image/jpeg'),
    ]);

    logger.info('Image processed and uploaded to R2', {
      photoId,
      originalSize: file.size,
      processedSize: largeBuffer.length,
      userId,
      largeKey,
      thumbnailKey,
      storageType: usingDiskStorage ? 'disk' : 'memory',
    });

    // Clean up temp file if using disk storage
    if (usingDiskStorage && file.path) {
      try {
        await fs.unlink(file.path);
        logger.debug('Cleaned up temp upload file', { path: file.path });
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp upload file', { path: file.path, error: cleanupError });
      }
    }

    return {
      id: photoId,
      key: largeKey,
      thumbnailKey: thumbnailKey,
      originalSize: file.size,
      processedSize: largeBuffer.length,
    };
  } catch (error) {
    // Clean up temp file even on error if using disk storage
    if (usingDiskStorage && file.path) {
      try {
        await fs.unlink(file.path);
      } catch (cleanupError) {
        logger.warn('Failed to clean up temp file after error', { path: file.path });
      }
    }
    logger.error('Failed to process image', { error, userId });
    throw new Error('Failed to process image');
  }
}

/**
 * Delete image files from R2
 * @param photoKey - The R2 object key (e.g., photos/user123/abc-123.jpg)
 */
export async function deleteImage(photoKey: string): Promise<void> {
  try {
    // Handle legacy local URLs - extract just the filename portion
    if (photoKey.startsWith('/uploads/')) {
      // Legacy format: /uploads/userId_photoId.jpg
      // We can't delete these from R2, just log and return
      logger.warn('Attempted to delete legacy local image', { photoKey });
      return;
    }

    // Delete main image
    await deleteFromR2(photoKey);

    // Delete thumbnail (derive key from main key)
    const thumbnailKey = photoKey.replace('.jpg', '_thumb.jpg');
    await deleteFromR2(thumbnailKey);

    logger.info('Image deleted from R2', { photoKey, thumbnailKey });
  } catch (error) {
    logger.error('Failed to delete image from R2', { error, photoKey });
    // Don't throw - deletion is best effort
  }
}

/**
 * Get photo ID from key or URL
 * Handles both R2 keys (photos/user/uuid.jpg) and legacy URLs (/uploads/user_uuid.jpg)
 */
export function getPhotoIdFromKey(keyOrUrl: string): string | null {
  const match = keyOrUrl.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
  return match ? match[0] : null;
}

/**
 * Check if user can upload more photos
 */
export function canUploadMorePhotos(currentPhotoCount: number): boolean {
  return currentPhotoCount < MAX_PHOTOS_PER_PROFILE;
}

// Legacy export for backwards compatibility
export const initializeUploadDirectory = initializeStorage;
export const getPhotoIdFromUrl = getPhotoIdFromKey;

export { MAX_PHOTOS_PER_PROFILE };
