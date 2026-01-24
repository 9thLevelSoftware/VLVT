/**
 * After Hours Chat REST API Routes
 *
 * Provides HTTP endpoints for After Hours chat functionality.
 *
 * Endpoints:
 * - GET /after-hours/messages/:matchId - Retrieve message history for an After Hours match
 * - POST /after-hours/matches/:matchId/save - Vote to save an After Hours match as permanent
 * - POST /after-hours/matches/:matchId/block - Block user and decline match
 * - POST /after-hours/matches/:matchId/report - Report user, auto-block, and decline match
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { Server as SocketServer } from 'socket.io';
import logger from '../utils/logger';
import { recordSaveVote } from '../services/match-conversion-service';
import { emitPartnerSaved, emitMatchSaved } from '../socket/after-hours-handler';
import {
  sendAfterHoursPartnerSavedNotification,
  sendAfterHoursMutualSaveNotification,
} from '../services/fcm-service';
import {
  blockAfterHoursUser,
  reportAfterHoursUser,
  VALID_REPORT_REASONS,
  ReportReason,
} from '../services/after-hours-safety-service';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates the After Hours chat router with database and Socket.IO connections.
 *
 * @param pool - PostgreSQL connection pool
 * @param io - Socket.IO server instance (optional, for real-time save notifications)
 * @returns Express Router with After Hours chat endpoints
 */
export const createAfterHoursChatRouter = (pool: Pool, io?: SocketServer): Router => {
  const router = Router();

  /**
   * GET /after-hours/messages/:matchId
   *
   * Retrieve message history for an After Hours match.
   * Supports cursor-based pagination with 'before' timestamp parameter.
   *
   * Query params:
   * - before (optional): ISO timestamp for cursor pagination (get messages before this time)
   *
   * Returns:
   * - success: boolean
   * - messages: Array of message objects (newest first)
   * - hasMore: boolean indicating if more messages exist
   */
  router.get(
    '/after-hours/messages/:matchId',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { matchId } = req.params;
        const userId = req.user!.userId;

        // Validate matchId is UUID format
        if (!matchId || !UUID_REGEX.test(matchId)) {
          logger.warn('Invalid matchId format for message history', { userId, matchId });
          return res.status(400).json({
            success: false,
            error: 'Invalid match ID format',
          });
        }

        // Parse optional 'before' cursor for pagination
        const before = req.query.before as string | undefined;
        if (before && isNaN(Date.parse(before))) {
          return res.status(400).json({
            success: false,
            error: 'Invalid before timestamp. Use ISO 8601 format.',
          });
        }

        // Verify user is part of match
        const matchResult = await pool.query(
          `SELECT user_id_1, user_id_2, expires_at, declined_by
           FROM after_hours_matches
           WHERE id = $1`,
          [matchId]
        );

        if (matchResult.rows.length === 0) {
          logger.warn('Match not found for message history', { userId, matchId });
          return res.status(404).json({
            success: false,
            error: 'Match not found',
          });
        }

        const match = matchResult.rows[0];

        // Check user is user_id_1 or user_id_2
        if (match.user_id_1 !== userId && match.user_id_2 !== userId) {
          logger.warn('Unauthorized access to After Hours message history', {
            userId,
            matchId,
            reason: 'User not part of match',
          });
          return res.status(403).json({
            success: false,
            error: 'Forbidden: You are not part of this match',
          });
        }

        // Note: We return messages even if match is expired - allows viewing history
        // The match metadata is returned so client can show appropriate UI

        // Query messages with cursor pagination
        // $2::timestamptz IS NULL handles case where 'before' is not provided
        const messageResult = await pool.query(
          `SELECT id, match_id, sender_id, text, created_at
           FROM after_hours_messages
           WHERE match_id = $1
             AND ($2::timestamptz IS NULL OR created_at < $2)
           ORDER BY created_at DESC
           LIMIT 50`,
          [matchId, before || null]
        );

        // Format messages for response
        const messages = messageResult.rows.map((msg) => ({
          id: msg.id,
          matchId: msg.match_id,
          senderId: msg.sender_id,
          text: msg.text,
          timestamp: msg.created_at,
        }));

        // hasMore indicates if there are more messages to fetch
        const hasMore = messages.length === 50;

        logger.debug('Retrieved After Hours message history', {
          matchId,
          userId,
          messageCount: messages.length,
          hasMore,
        });

        res.json({
          success: true,
          messages,
          hasMore,
        });
      } catch (error) {
        logger.error('Failed to retrieve After Hours message history', {
          error: error instanceof Error ? error.message : 'Unknown error',
          matchId: req.params.matchId,
          userId: req.user?.userId,
        });
        res.status(500).json({
          success: false,
          error: 'Failed to retrieve message history',
        });
      }
    }
  );

  /**
   * POST /after-hours/matches/:matchId/save
   *
   * Vote to save an After Hours match as permanent.
   * When both users save, the match is converted to a permanent match
   * and all messages are copied to the permanent messages table.
   *
   * Returns:
   * - success: boolean
   * - mutualSave: boolean - true if both users have now saved
   * - permanentMatchId: string | null - ID of permanent match if mutual save occurred
   */
  router.post(
    '/after-hours/matches/:matchId/save',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { matchId } = req.params;
        const userId = req.user!.userId;

        // Validate matchId is UUID format
        if (!matchId || !UUID_REGEX.test(matchId)) {
          logger.warn('Invalid matchId format for save vote', { userId, matchId });
          return res.status(400).json({
            success: false,
            error: 'Invalid match ID format',
          });
        }

        // Record the save vote (atomic operation with conversion if mutual)
        const result = await recordSaveVote(pool, matchId, userId);

        if (!result.success) {
          // Handle specific errors
          if (result.error === 'Match not found') {
            return res.status(404).json({
              success: false,
              error: 'Match not found',
            });
          }
          if (result.error === 'Unauthorized') {
            return res.status(403).json({
              success: false,
              error: 'Forbidden: You are not part of this match',
            });
          }
          return res.status(500).json({
            success: false,
            error: result.error || 'Failed to save match',
          });
        }

        // If already voted, just return success without re-sending notifications
        if (result.alreadyVoted) {
          logger.debug('User already voted to save', { matchId, userId, mutualSave: result.mutualSave });
          return res.json({
            success: true,
            mutualSave: result.mutualSave,
            permanentMatchId: result.permanentMatchId || null,
          });
        }

        // Get match details for notifications
        const matchResult = await pool.query(
          `SELECT user_id_1, user_id_2 FROM after_hours_matches WHERE id = $1`,
          [matchId]
        );

        if (matchResult.rows.length > 0) {
          const match = matchResult.rows[0];
          const otherUserId = match.user_id_1 === userId ? match.user_id_2 : match.user_id_1;

          // Get names for push notifications
          const namesResult = await pool.query(
            `SELECT user_id, name FROM profiles WHERE user_id IN ($1, $2)`,
            [userId, otherUserId]
          );
          const namesMap = new Map(namesResult.rows.map((r) => [r.user_id, r.name]));
          const savingUserName = namesMap.get(userId) || 'Someone';
          const otherUserName = namesMap.get(otherUserId) || 'Someone';

          if (result.mutualSave && result.permanentMatchId) {
            // MUTUAL SAVE - notify both users
            if (io) {
              emitMatchSaved(io, matchId, result.permanentMatchId, match.user_id_1, match.user_id_2);
            }
            // Send push notifications to both users
            sendAfterHoursMutualSaveNotification(pool, userId, otherUserName, result.permanentMatchId);
            sendAfterHoursMutualSaveNotification(pool, otherUserId, savingUserName, result.permanentMatchId);

            logger.info('After Hours match saved as permanent', {
              afterHoursMatchId: matchId,
              permanentMatchId: result.permanentMatchId,
              userId1: match.user_id_1,
              userId2: match.user_id_2,
            });
          } else {
            // First save - notify partner
            if (io) {
              emitPartnerSaved(io, matchId, userId, otherUserId);
            }
            // Send push notification to partner
            sendAfterHoursPartnerSavedNotification(pool, otherUserId, savingUserName, matchId);

            logger.info('After Hours save vote recorded, waiting for partner', {
              afterHoursMatchId: matchId,
              savingUserId: userId,
              partnerUserId: otherUserId,
            });
          }
        }

        res.json({
          success: true,
          mutualSave: result.mutualSave,
          permanentMatchId: result.permanentMatchId || null,
        });
      } catch (error) {
        logger.error('Failed to save After Hours match', {
          error: error instanceof Error ? error.message : 'Unknown error',
          matchId: req.params.matchId,
          userId: req.user?.userId,
        });
        res.status(500).json({
          success: false,
          error: 'Failed to save match',
        });
      }
    }
  );

  /**
   * POST /after-hours/matches/:matchId/block
   *
   * Block a user from After Hours and decline the match.
   * The block is permanent (same as main app) - blocks affect both
   * After Hours and regular matching going forward.
   *
   * Body:
   * - reason (optional): string - Reason for blocking
   *
   * Returns:
   * - success: boolean
   * - message: string
   */
  router.post(
    '/after-hours/matches/:matchId/block',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { matchId } = req.params;
        const userId = req.user!.userId;
        const { reason } = req.body;

        // Validate matchId is UUID format
        if (!matchId || !UUID_REGEX.test(matchId)) {
          logger.warn('Invalid matchId format for block', { userId, matchId });
          return res.status(400).json({
            success: false,
            error: 'Invalid match ID format',
          });
        }

        // Verify user is part of match and get the other user
        const matchResult = await pool.query(
          `SELECT user_id_1, user_id_2
           FROM after_hours_matches
           WHERE id = $1`,
          [matchId]
        );

        if (matchResult.rows.length === 0) {
          logger.warn('Match not found for block', { userId, matchId });
          return res.status(404).json({
            success: false,
            error: 'Match not found',
          });
        }

        const match = matchResult.rows[0];

        // Check user is user_id_1 or user_id_2
        if (match.user_id_1 !== userId && match.user_id_2 !== userId) {
          logger.warn('Unauthorized block attempt', {
            userId,
            matchId,
            reason: 'User not part of match',
          });
          return res.status(403).json({
            success: false,
            error: 'Forbidden: You are not part of this match',
          });
        }

        // Determine who to block (the other user)
        const blockedUserId = match.user_id_1 === userId ? match.user_id_2 : match.user_id_1;

        // Perform the block
        const result = await blockAfterHoursUser(pool, userId, blockedUserId, matchId, reason);

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.error || 'Failed to block user',
          });
        }

        logger.info('After Hours user blocked via endpoint', {
          matchId,
          userId,
          blockedUserId,
          blockId: result.blockId,
        });

        res.json({
          success: true,
          message: 'User blocked',
        });
      } catch (error) {
        logger.error('Failed to block After Hours user', {
          error: error instanceof Error ? error.message : 'Unknown error',
          matchId: req.params.matchId,
          userId: req.user?.userId,
        });
        res.status(500).json({
          success: false,
          error: 'Failed to block user',
        });
      }
    }
  );

  /**
   * POST /after-hours/matches/:matchId/report
   *
   * Report a user from After Hours. This automatically blocks the user
   * and declines the match.
   *
   * Body:
   * - reason: string (required) - One of: 'inappropriate', 'harassment', 'spam', 'underage', 'other'
   * - details (optional): string - Additional details about the report
   *
   * Returns:
   * - success: boolean
   * - message: string
   */
  router.post(
    '/after-hours/matches/:matchId/report',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { matchId } = req.params;
        const userId = req.user!.userId;
        const { reason, details } = req.body;

        // Validate matchId is UUID format
        if (!matchId || !UUID_REGEX.test(matchId)) {
          logger.warn('Invalid matchId format for report', { userId, matchId });
          return res.status(400).json({
            success: false,
            error: 'Invalid match ID format',
          });
        }

        // Validate reason is required and valid
        if (!reason) {
          return res.status(400).json({
            success: false,
            error: 'Reason is required',
          });
        }

        if (!VALID_REPORT_REASONS.includes(reason as ReportReason)) {
          return res.status(400).json({
            success: false,
            error: `Invalid reason. Must be one of: ${VALID_REPORT_REASONS.join(', ')}`,
          });
        }

        // Verify user is part of match and get the other user
        const matchResult = await pool.query(
          `SELECT user_id_1, user_id_2
           FROM after_hours_matches
           WHERE id = $1`,
          [matchId]
        );

        if (matchResult.rows.length === 0) {
          logger.warn('Match not found for report', { userId, matchId });
          return res.status(404).json({
            success: false,
            error: 'Match not found',
          });
        }

        const match = matchResult.rows[0];

        // Check user is user_id_1 or user_id_2
        if (match.user_id_1 !== userId && match.user_id_2 !== userId) {
          logger.warn('Unauthorized report attempt', {
            userId,
            matchId,
            reason: 'User not part of match',
          });
          return res.status(403).json({
            success: false,
            error: 'Forbidden: You are not part of this match',
          });
        }

        // Determine who to report (the other user)
        const reportedUserId = match.user_id_1 === userId ? match.user_id_2 : match.user_id_1;

        // Perform the report (auto-blocks and auto-declines)
        const result = await reportAfterHoursUser(
          pool,
          userId,
          reportedUserId,
          matchId,
          reason as ReportReason,
          details
        );

        if (!result.success) {
          return res.status(500).json({
            success: false,
            error: result.error || 'Failed to submit report',
          });
        }

        logger.info('After Hours user reported via endpoint', {
          matchId,
          userId,
          reportedUserId,
          reportId: result.reportId,
          reason,
        });

        res.json({
          success: true,
          message: 'Report submitted',
        });
      } catch (error) {
        logger.error('Failed to report After Hours user', {
          error: error instanceof Error ? error.message : 'Unknown error',
          matchId: req.params.matchId,
          userId: req.user?.userId,
        });
        res.status(500).json({
          success: false,
          error: 'Failed to submit report',
        });
      }
    }
  );

  return router;
};

export default createAfterHoursChatRouter;
