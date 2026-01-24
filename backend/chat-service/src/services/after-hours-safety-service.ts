/**
 * After Hours Safety Service
 *
 * Handles block and report operations for After Hours mode.
 * All blocks are permanent (same as main app) and reports auto-block.
 *
 * Key features:
 * - blockAfterHoursUser: Permanently block a user and decline the match
 * - reportAfterHoursUser: Report a user, auto-block, and decline the match
 * - Fire-and-forget pattern: don't block response on async operations
 */

import { Pool } from 'pg';
import { generateBlockId, generateReportId } from '../utils/id-generator';
import logger from '../utils/logger';

// ============================================
// TYPES
// ============================================

/**
 * Result of a block operation
 */
export interface BlockResult {
  success: boolean;
  blockId?: string;
  error?: string;
}

/**
 * Result of a report operation
 */
export interface ReportResult {
  success: boolean;
  reportId?: string;
  error?: string;
}

/**
 * Valid reasons for reporting a user
 */
export type ReportReason = 'inappropriate' | 'harassment' | 'spam' | 'underage' | 'other';

/**
 * Valid report reasons for validation
 */
export const VALID_REPORT_REASONS: ReportReason[] = [
  'inappropriate',
  'harassment',
  'spam',
  'underage',
  'other',
];

// ============================================
// BLOCK USER
// ============================================

/**
 * Block a user from After Hours (permanent block).
 *
 * This performs two operations:
 * 1. Insert into blocks table (permanent, same as main app)
 * 2. Decline the After Hours match
 *
 * Both operations are fire-and-forget with error logging.
 *
 * @param pool - PostgreSQL connection pool
 * @param userId - User performing the block
 * @param blockedUserId - User being blocked
 * @param matchId - After Hours match ID to decline
 * @param reason - Optional reason for the block
 * @returns BlockResult with success status and block ID
 */
export async function blockAfterHoursUser(
  pool: Pool,
  userId: string,
  blockedUserId: string,
  matchId: string,
  reason?: string
): Promise<BlockResult> {
  try {
    // Check if already blocked
    const existing = await pool.query(
      `SELECT id FROM blocks WHERE user_id = $1 AND blocked_user_id = $2`,
      [userId, blockedUserId]
    );

    let blockId: string;

    if (existing.rows.length > 0) {
      // Already blocked, use existing block ID
      blockId = existing.rows[0].id;
      logger.debug('User already blocked', { userId, blockedUserId, blockId });
    } else {
      // Create new block
      blockId = generateBlockId();

      await pool.query(
        `INSERT INTO blocks (id, user_id, blocked_user_id, reason)
         VALUES ($1, $2, $3, $4)`,
        [blockId, userId, blockedUserId, reason || null]
      );

      logger.info('After Hours block created', {
        blockId,
        userId,
        blockedUserId,
        matchId,
        reason: reason || 'none',
      });
    }

    // Decline the After Hours match (fire-and-forget pattern)
    pool
      .query(
        `UPDATE after_hours_matches
         SET declined_by = $1, declined_at = NOW()
         WHERE id = $2 AND declined_by IS NULL`,
        [userId, matchId]
      )
      .then((result) => {
        if (result.rowCount && result.rowCount > 0) {
          logger.info('After Hours match declined due to block', {
            matchId,
            declinedBy: userId,
          });
        }
      })
      .catch((error) => {
        logger.error('Failed to decline After Hours match after block', {
          error: error instanceof Error ? error.message : 'Unknown error',
          matchId,
          userId,
        });
      });

    return { success: true, blockId };
  } catch (error) {
    logger.error('Failed to block After Hours user', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      blockedUserId,
      matchId,
    });
    return {
      success: false,
      error: 'Failed to block user',
    };
  }
}

// ============================================
// REPORT USER
// ============================================

/**
 * Report a user from After Hours.
 *
 * This performs three operations:
 * 1. Insert into reports table with source='after_hours'
 * 2. Auto-block the reported user (fire-and-forget)
 * 3. Auto-decline the After Hours match (via blockAfterHoursUser)
 *
 * @param pool - PostgreSQL connection pool
 * @param userId - User submitting the report
 * @param reportedUserId - User being reported
 * @param matchId - After Hours match ID
 * @param reason - Report reason (enum value)
 * @param details - Optional additional details
 * @returns ReportResult with success status and report ID
 */
export async function reportAfterHoursUser(
  pool: Pool,
  userId: string,
  reportedUserId: string,
  matchId: string,
  reason: ReportReason,
  details?: string
): Promise<ReportResult> {
  try {
    const reportId = generateReportId();

    // Insert report (reason includes 'after_hours' prefix for tracking)
    await pool.query(
      `INSERT INTO reports (id, reporter_id, reported_user_id, reason, details, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')`,
      [reportId, userId, reportedUserId, `after_hours:${reason}`, details || null]
    );

    logger.info('After Hours report submitted', {
      reportId,
      reporterId: userId,
      reportedUserId,
      matchId,
      reason,
    });

    // Auto-block the reported user (fire-and-forget)
    // This also auto-declines the match
    blockAfterHoursUser(pool, userId, reportedUserId, matchId, `Reported: ${reason}`).catch(
      (error) => {
        logger.error('Failed to auto-block after report', {
          error: error instanceof Error ? error.message : 'Unknown error',
          reportId,
          userId,
          reportedUserId,
        });
      }
    );

    return { success: true, reportId };
  } catch (error) {
    logger.error('Failed to report After Hours user', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      reportedUserId,
      matchId,
      reason,
    });
    return {
      success: false,
      error: 'Failed to submit report',
    };
  }
}
