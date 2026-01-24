/**
 * Device Fingerprint Utility
 *
 * Stores device fingerprints at session start for ban evasion detection.
 * Fingerprints are collected from mobile clients and include:
 * - deviceId: IDFV (iOS) or Android ID
 * - deviceModel: Device model identifier (e.g., "iPhone14,3")
 * - platform: 'ios' or 'android'
 *
 * Storage is non-blocking: errors are logged but don't fail the request.
 * This ensures session start is never blocked by fingerprint storage issues.
 */

import { Pool } from 'pg';
import logger from './logger';

export interface DeviceFingerprint {
  deviceId?: string;    // IDFV or Android ID
  deviceModel?: string; // Device model name
  platform?: string;    // 'ios' or 'android'
}

/**
 * Store device fingerprint at session start.
 * Non-blocking: errors are logged but don't fail the request.
 *
 * @param pool - Database connection pool
 * @param userId - User ID
 * @param sessionId - Session ID
 * @param fingerprint - Device fingerprint data
 */
export async function storeDeviceFingerprint(
  pool: Pool,
  userId: string,
  sessionId: string,
  fingerprint: DeviceFingerprint
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO device_fingerprints (user_id, session_id, device_id, device_model, platform)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        userId,
        sessionId,
        fingerprint.deviceId || null,
        fingerprint.deviceModel || null,
        fingerprint.platform || null,
      ]
    );
    logger.info('Device fingerprint stored', { userId, sessionId });
  } catch (error: any) {
    // Non-blocking: log but don't fail
    logger.warn('Failed to store device fingerprint', {
      userId,
      sessionId,
      error: error.message,
    });
  }
}
