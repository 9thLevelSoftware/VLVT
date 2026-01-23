/**
 * Match Conversion Service
 *
 * Handles atomic save vote recording and After Hours match conversion.
 * When both users vote to save, the ephemeral After Hours match is
 * converted to a permanent match with all messages copied.
 *
 * Key features:
 * - SELECT...FOR UPDATE row locking prevents race conditions on simultaneous saves
 * - Atomic transaction ensures either complete conversion or no change
 * - Idempotent: re-saving returns existing result without double-conversion
 */

import { Pool, PoolClient } from 'pg';
import { generateMatchId, generateMessageId } from '../utils/id-generator';
import logger from '../utils/logger';

// ============================================
// TYPES
// ============================================

/**
 * Result of a save vote operation
 */
export interface SaveVoteResult {
  success: boolean;
  mutualSave: boolean;
  permanentMatchId?: string;
  alreadyVoted?: boolean;
  error?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert an After Hours match to a permanent match.
 * Creates the permanent match record and copies all messages.
 *
 * MUST be called within a transaction with the after_hours_match row locked.
 *
 * @param client - PostgreSQL client (in transaction)
 * @param afterHoursMatchId - UUID of the After Hours match
 * @param userId1 - First user ID
 * @param userId2 - Second user ID
 * @returns The new permanent match ID
 */
async function convertToPermanentMatch(
  client: PoolClient,
  afterHoursMatchId: string,
  userId1: string,
  userId2: string
): Promise<string> {
  // Generate permanent match ID using existing pattern
  const permanentMatchId = generateMatchId();

  // Insert into matches table with source='after_hours'
  await client.query(
    `INSERT INTO matches (id, user_id_1, user_id_2, source, created_at)
     VALUES ($1, $2, $3, 'after_hours', CURRENT_TIMESTAMP)`,
    [permanentMatchId, userId1, userId2]
  );

  logger.info('Created permanent match from After Hours conversion', {
    permanentMatchId,
    afterHoursMatchId,
    userId1,
    userId2,
  });

  // Copy messages from after_hours_messages to messages table
  // Generate new message IDs and preserve chronological order
  const messagesResult = await client.query(
    `SELECT id, sender_id, text, created_at
     FROM after_hours_messages
     WHERE match_id = $1
     ORDER BY created_at ASC`,
    [afterHoursMatchId]
  );

  if (messagesResult.rows.length > 0) {
    // Build batch insert for messages
    const values: any[] = [];
    const placeholders: string[] = [];

    messagesResult.rows.forEach((msg, index) => {
      const newMessageId = generateMessageId();
      const offset = index * 4;
      placeholders.push(
        `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`
      );
      values.push(newMessageId, permanentMatchId, msg.sender_id, msg.text);
    });

    await client.query(
      `INSERT INTO messages (id, match_id, sender_id, text)
       VALUES ${placeholders.join(', ')}`,
      values
    );

    logger.info('Copied After Hours messages to permanent match', {
      permanentMatchId,
      afterHoursMatchId,
      messageCount: messagesResult.rows.length,
    });
  }

  // Update after_hours_matches.converted_to_match_id
  await client.query(
    `UPDATE after_hours_matches
     SET converted_to_match_id = $1
     WHERE id = $2`,
    [permanentMatchId, afterHoursMatchId]
  );

  return permanentMatchId;
}

// ============================================
// MAIN EXPORT
// ============================================

/**
 * Record a save vote for an After Hours match.
 * If this creates a mutual save, converts the match to permanent.
 *
 * Uses SELECT...FOR UPDATE to lock the row and prevent race conditions
 * when both users save simultaneously.
 *
 * @param pool - PostgreSQL connection pool
 * @param afterHoursMatchId - UUID of the After Hours match
 * @param userId - User ID voting to save
 * @returns SaveVoteResult with success status and conversion info
 */
export async function recordSaveVote(
  pool: Pool,
  afterHoursMatchId: string,
  userId: string
): Promise<SaveVoteResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock the row for update to prevent race condition on simultaneous saves
    const matchResult = await client.query(
      `SELECT id, user_id_1, user_id_2, user1_save_vote, user2_save_vote,
              converted_to_match_id, declined_by, expires_at
       FROM after_hours_matches
       WHERE id = $1
       FOR UPDATE`,
      [afterHoursMatchId]
    );

    if (matchResult.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn('Match not found for save vote', { afterHoursMatchId, userId });
      return { success: false, mutualSave: false, error: 'Match not found' };
    }

    const match = matchResult.rows[0];

    // Authorization check: user must be part of match
    if (match.user_id_1 !== userId && match.user_id_2 !== userId) {
      await client.query('ROLLBACK');
      logger.warn('Unauthorized save vote attempt', {
        afterHoursMatchId,
        userId,
        matchUsers: [match.user_id_1, match.user_id_2],
      });
      return { success: false, mutualSave: false, error: 'Unauthorized' };
    }

    // Check if already converted
    if (match.converted_to_match_id) {
      await client.query('COMMIT');
      logger.debug('Match already converted, returning existing result', {
        afterHoursMatchId,
        permanentMatchId: match.converted_to_match_id,
      });
      return {
        success: true,
        mutualSave: true,
        permanentMatchId: match.converted_to_match_id,
        alreadyVoted: true,
      };
    }

    // Determine which user is voting (user1 or user2)
    const isUser1 = match.user_id_1 === userId;
    const voteColumn = isUser1 ? 'user1_save_vote' : 'user2_save_vote';
    const currentUserVote = isUser1 ? match.user1_save_vote : match.user2_save_vote;
    const otherUserVote = isUser1 ? match.user2_save_vote : match.user1_save_vote;

    // Check if user already voted
    if (currentUserVote) {
      // User already voted, check if mutual save occurred
      if (otherUserVote) {
        // Both voted but not converted (edge case - shouldn't happen normally)
        // Perform conversion now
        const permanentMatchId = await convertToPermanentMatch(
          client,
          afterHoursMatchId,
          match.user_id_1,
          match.user_id_2
        );
        await client.query('COMMIT');
        return {
          success: true,
          mutualSave: true,
          permanentMatchId,
          alreadyVoted: true,
        };
      }
      // User already voted but no mutual save yet
      await client.query('COMMIT');
      return { success: true, mutualSave: false, alreadyVoted: true };
    }

    // Record the vote
    await client.query(
      `UPDATE after_hours_matches
       SET ${voteColumn} = true
       WHERE id = $1`,
      [afterHoursMatchId]
    );

    logger.info('Save vote recorded', {
      afterHoursMatchId,
      userId,
      voteColumn,
      otherUserVote,
    });

    // Check if this creates a mutual save
    if (otherUserVote) {
      // MUTUAL SAVE! Convert to permanent match
      const permanentMatchId = await convertToPermanentMatch(
        client,
        afterHoursMatchId,
        match.user_id_1,
        match.user_id_2
      );

      await client.query('COMMIT');

      logger.info('Mutual save detected - converted to permanent match', {
        afterHoursMatchId,
        permanentMatchId,
        userId1: match.user_id_1,
        userId2: match.user_id_2,
      });

      return {
        success: true,
        mutualSave: true,
        permanentMatchId,
      };
    }

    // First vote recorded, waiting for other user
    await client.query('COMMIT');
    return { success: true, mutualSave: false };
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error recording save vote', {
      error: error instanceof Error ? error.message : 'Unknown error',
      afterHoursMatchId,
      userId,
    });
    return {
      success: false,
      mutualSave: false,
      error: 'Failed to record save vote',
    };
  } finally {
    client.release();
  }
}
