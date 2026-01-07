import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import logger from './logger';

// R2 Configuration - uses S3-compatible API
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'vlvt-images';

// Presigned URL expiration (1 hour default)
const PRESIGNED_URL_EXPIRY = parseInt(process.env.R2_URL_EXPIRY_SECONDS || '3600', 10);

// Validate required environment variables
export function validateR2Config(): boolean {
  const missing: string[] = [];

  if (!R2_ACCOUNT_ID) missing.push('R2_ACCOUNT_ID');
  if (!R2_ACCESS_KEY_ID) missing.push('R2_ACCESS_KEY_ID');
  if (!R2_SECRET_ACCESS_KEY) missing.push('R2_SECRET_ACCESS_KEY');

  if (missing.length > 0) {
    logger.error('Missing R2 configuration', { missing });
    return false;
  }

  return true;
}

// Create S3-compatible client for Cloudflare R2
const r2Client = new S3Client({
  region: 'auto',
  endpoint: R2_ACCOUNT_ID
    ? `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
    : undefined,
  credentials: R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
    ? {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      }
    : undefined,
});

/**
 * Upload a file to R2
 * @param key - Object key (path in bucket)
 * @param body - File buffer
 * @param contentType - MIME type
 * @returns The object key for later retrieval
 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
    Body: body,
    ContentType: contentType,
  });

  await r2Client.send(command);

  logger.info('File uploaded to R2', { key, contentType, size: body.length });

  return key;
}

/**
 * Delete a file from R2
 * @param key - Object key to delete
 */
export async function deleteFromR2(key: string): Promise<void> {
  try {
    const command = new DeleteObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);
    logger.info('File deleted from R2', { key });
  } catch (error) {
    // Log but don't throw - deletion is best effort
    logger.warn('Failed to delete file from R2', { key, error });
  }
}

/**
 * Check if a file exists in R2
 * @param key - Object key to check
 */
export async function existsInR2(key: string): Promise<boolean> {
  try {
    const command = new HeadObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    await r2Client.send(command);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Generate a presigned URL for temporary access to a private object
 * @param key - Object key
 * @param expiresIn - Expiration in seconds (default: 1 hour)
 * @returns Presigned URL
 */
export async function getPresignedUrl(
  key: string,
  expiresIn: number = PRESIGNED_URL_EXPIRY
): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: key,
  });

  const url = await getSignedUrl(r2Client, command, { expiresIn });

  return url;
}

/**
 * Generate presigned URLs for multiple keys
 * @param keys - Array of object keys
 * @param expiresIn - Expiration in seconds
 * @returns Map of key -> presigned URL
 */
export async function getPresignedUrls(
  keys: string[],
  expiresIn: number = PRESIGNED_URL_EXPIRY
): Promise<Map<string, string>> {
  const urlMap = new Map<string, string>();

  await Promise.all(
    keys.map(async (key) => {
      try {
        const url = await getPresignedUrl(key, expiresIn);
        urlMap.set(key, url);
      } catch (error) {
        logger.warn('Failed to generate presigned URL', { key, error });
      }
    })
  );

  return urlMap;
}

/**
 * Convert a photo key to presigned URL, handling both legacy URLs and R2 keys
 * Legacy URLs (starting with /uploads/ or http) are passed through unchanged
 * R2 keys are converted to presigned URLs
 */
export async function resolvePhotoUrl(photoKeyOrUrl: string): Promise<string> {
  // Legacy local URLs or already-signed URLs - pass through
  if (photoKeyOrUrl.startsWith('/uploads/') ||
      photoKeyOrUrl.startsWith('http://') ||
      photoKeyOrUrl.startsWith('https://')) {
    return photoKeyOrUrl;
  }

  // R2 key - generate presigned URL
  return getPresignedUrl(photoKeyOrUrl);
}

/**
 * Resolve multiple photo URLs (handles mix of legacy and R2)
 */
export async function resolvePhotoUrls(photosKeysOrUrls: string[]): Promise<string[]> {
  return Promise.all(photosKeysOrUrls.map(resolvePhotoUrl));
}

/**
 * Extract R2 key from a photo URL or return the key if it's already a key
 * Handles both full URLs (https://...) and direct R2 keys
 * @param photoKeyOrUrl - Photo URL or R2 key
 * @returns The R2 key, or null if extraction failed
 */
function extractR2Key(photoKeyOrUrl: string): string | null {
  // If it's already a key (not a URL), return it
  if (!photoKeyOrUrl.startsWith('http://') && !photoKeyOrUrl.startsWith('https://')) {
    // Legacy local path - cannot delete from R2
    if (photoKeyOrUrl.startsWith('/uploads/')) {
      return null;
    }
    return photoKeyOrUrl;
  }

  // Try to extract path from URL
  try {
    const url = new URL(photoKeyOrUrl);
    const pathname = url.pathname;
    // Remove leading slash if present
    return pathname.startsWith('/') ? pathname.slice(1) : pathname;
  } catch {
    return null;
  }
}

/**
 * Delete all photos for a user (batch deletion)
 * Used during profile deletion for GDPR compliance
 * @param userId - User ID for logging purposes
 * @param photoKeysOrUrls - Array of photo keys or URLs to delete
 * @returns Object with deleted and failed counts
 */
export async function deleteUserPhotos(
  userId: string,
  photoKeysOrUrls: string[]
): Promise<{ deleted: number; failed: number }> {
  // Check if R2 is configured
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
    logger.warn('R2 credentials not configured - photo cleanup disabled', { userId });
    return { deleted: 0, failed: 0 };
  }

  if (!photoKeysOrUrls || photoKeysOrUrls.length === 0) {
    return { deleted: 0, failed: 0 };
  }

  let deleted = 0;
  let failed = 0;

  for (const photoKeyOrUrl of photoKeysOrUrls) {
    const key = extractR2Key(photoKeyOrUrl);

    if (!key) {
      // Skip legacy local paths or invalid URLs
      logger.debug('Skipping non-R2 photo', { userId, photoKeyOrUrl });
      continue;
    }

    try {
      const command = new DeleteObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });

      await r2Client.send(command);
      deleted++;
      logger.debug('Deleted photo from R2', { userId, key });
    } catch (error) {
      failed++;
      logger.error('Failed to delete photo from R2', { userId, key, error });
    }
  }

  logger.info('R2 photo cleanup completed', { userId, deleted, failed, total: photoKeysOrUrls.length });
  return { deleted, failed };
}

export { R2_BUCKET_NAME };
