/**
 * After Hours Chat REST API Routes
 *
 * Provides HTTP endpoints for After Hours chat functionality.
 * Primary use case: Message history retrieval when app reopens mid-session.
 *
 * Endpoints:
 * - GET /after-hours/messages/:matchId - Retrieve message history for an After Hours match
 */

import { Router, Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import logger from '../utils/logger';

// UUID validation regex
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Creates the After Hours chat router with database connection.
 *
 * @param pool - PostgreSQL connection pool
 * @returns Express Router with After Hours chat endpoints
 */
export const createAfterHoursChatRouter = (pool: Pool): Router => {
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

  return router;
};

export default createAfterHoursChatRouter;
