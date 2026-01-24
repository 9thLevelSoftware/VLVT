/**
 * Photo Hash Service
 *
 * Provides perceptual hashing for photos to detect banned content.
 * Uses sharp-phash for computing perceptual hashes (pHash algorithm).
 *
 * Key features:
 * - computePhotoHash: Generate 64-bit perceptual hash from image buffer
 * - hammingDistance: Compare two hashes for similarity
 * - checkBannedPhoto: Check if a photo matches any banned hashes
 *
 * Threshold: Images with Hamming distance < 10 bits are considered matches.
 * This allows detecting re-uploads of banned photos even with minor edits
 * (cropping, filters, compression artifacts).
 */

import phash from 'sharp-phash';
import { Pool } from 'pg';
import logger from '../utils/logger';

/**
 * Convert binary string (64 chars of 0/1) to hex string (16 chars).
 * sharp-phash returns binary, we store hex for compactness.
 */
function binaryToHex(binary: string): string {
  let hex = '';
  for (let i = 0; i < binary.length; i += 4) {
    const chunk = binary.slice(i, i + 4);
    hex += parseInt(chunk, 2).toString(16);
  }
  return hex;
}

/**
 * Compute perceptual hash for an image buffer.
 * Returns 64-bit hex string (16 chars).
 *
 * The perceptual hash is resistant to:
 * - Resizing
 * - Minor color adjustments
 * - Compression artifacts
 * - Small crops
 *
 * @param imageBuffer - Raw image data as Buffer
 * @returns 16-character hex string representing the perceptual hash
 */
export async function computePhotoHash(imageBuffer: Buffer): Promise<string> {
  try {
    // phash takes buffer directly and returns 64-char binary string
    const binaryHash = await phash(imageBuffer);
    // Convert to hex for compact storage (16 chars)
    const hexHash = binaryToHex(binaryHash);
    logger.debug('Computed photo hash', { hashLength: hexHash.length });
    return hexHash;
  } catch (error: any) {
    logger.error('Failed to compute photo hash', { error: error.message });
    throw error;
  }
}

/**
 * Calculate Hamming distance between two perceptual hashes.
 * Lower distance = more similar images.
 *
 * The Hamming distance counts the number of differing bits between
 * two hashes. For 64-bit hashes:
 * - Distance 0: Identical images
 * - Distance 1-9: Very similar (likely same image with minor edits)
 * - Distance 10-20: Somewhat similar
 * - Distance 21+: Different images
 *
 * @param hash1 - First hash as 16-char hex string
 * @param hash2 - Second hash as 16-char hex string
 * @returns Number of differing bits (0-64)
 */
export function hammingDistance(hash1: string, hash2: string): number {
  let distance = 0;
  const h1 = BigInt('0x' + hash1);
  const h2 = BigInt('0x' + hash2);
  let xor = h1 ^ h2;
  while (xor > 0n) {
    distance += Number(xor & 1n);
    xor >>= 1n;
  }
  return distance;
}

/**
 * Check if a photo hash matches any banned hashes.
 *
 * Uses Hamming distance to find similar hashes. A threshold of 10 bits
 * catches most re-uploads while avoiding false positives.
 *
 * @param pool - Database connection pool
 * @param photoHash - Hash of the photo to check
 * @param threshold - Maximum Hamming distance to consider a match (default: 10)
 * @returns Object with isBanned flag and matched hash if found
 */
export async function checkBannedPhoto(
  pool: Pool,
  photoHash: string,
  threshold: number = 10
): Promise<{ isBanned: boolean; matchedHash?: string }> {
  try {
    const result = await pool.query('SELECT photo_hash FROM banned_photo_hashes');

    for (const row of result.rows) {
      const distance = hammingDistance(photoHash, row.photo_hash);
      if (distance < threshold) {
        logger.warn('Banned photo hash match detected', {
          uploadedHash: photoHash,
          bannedHash: row.photo_hash,
          distance,
        });
        return { isBanned: true, matchedHash: row.photo_hash };
      }
    }

    logger.debug('Photo hash check passed', { photoHash, bannedCount: result.rows.length });
    return { isBanned: false };
  } catch (error: any) {
    logger.error('Failed to check banned photo', { error: error.message, photoHash });
    // Fail open: if we can't check, allow the upload
    // This prevents blocking legitimate users due to database issues
    return { isBanned: false };
  }
}
