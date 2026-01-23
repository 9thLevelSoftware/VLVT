/**
 * Matching Engine Service
 *
 * Core logic for finding and creating After Hours matches.
 * Uses Haversine formula for distance calculation, mutual preference filtering,
 * and exclusion of blocked/declined/already-matched users.
 *
 * Key features:
 * - findMatchCandidate: Find best candidate based on proximity and preferences
 * - createAfterHoursMatch: Atomic match creation with SKIP LOCKED for concurrency
 * - getActiveUserCountNearby: Count active users for social proof display
 */

import { Pool, PoolClient } from 'pg';
import logger from '../utils/logger';

// ============================================
// INTERFACES
// ============================================

export interface MatchCandidate {
  userId: string;
  sessionId: string;
  name: string;
  age: number;
  photoUrl: string;
  description: string | null;
  distance: number; // km
  gender: string;
}

export interface UserPreferences {
  seekingGender: string;
  maxDistanceKm: number;
  minAge: number;
  maxAge: number;
}

export interface UserLocation {
  lat: number;
  lng: number;
}

export interface AfterHoursMatch {
  id: string;
  sessionId: string;
  userId1: string;
  userId2: string;
  createdAt: Date;
  expiresAt: Date;
  declinedBy: string | null;
  declinedAt: Date | null;
}

// ============================================
// CONSTANTS
// ============================================

// Minimum session time remaining to be eligible for matching (in minutes)
const MIN_SESSION_REMAINING_MINUTES = 2;

// Maximum number of declines before user reappears in matching pool
const MAX_DECLINE_COUNT = 3;

// ============================================
// FIND MATCH CANDIDATE
// ============================================

/**
 * Find the best match candidate for a user based on proximity and preferences.
 *
 * Query logic:
 * 1. Find active sessions (not ended, not expired)
 * 2. Calculate distance using Haversine formula
 * 3. Apply filters:
 *    - Within max distance
 *    - Mutual gender preferences
 *    - Age within range
 *    - Not blocked (bidirectional)
 *    - Not already matched this session
 *    - Not declined (respecting 3-session memory)
 *    - Session has >2 minutes remaining
 * 4. Order by distance, return closest candidate
 *
 * @param pool - Database connection pool
 * @param userId - ID of user seeking a match
 * @param sessionId - User's current session ID
 * @param userLocation - User's fuzzed location {lat, lng}
 * @param userGender - User's gender
 * @param preferences - User's matching preferences
 * @returns Best match candidate or null if none found
 */
export async function findMatchCandidate(
  pool: Pool,
  userId: string,
  sessionId: string,
  userLocation: UserLocation,
  userGender: string,
  preferences: UserPreferences
): Promise<MatchCandidate | null> {
  try {
    // Main matching query with CTEs for clarity
    const query = `
      WITH user_session AS (
        -- Get requesting user's session for reference
        SELECT id, fuzzed_latitude, fuzzed_longitude
        FROM after_hours_sessions
        WHERE user_id = $1 AND ended_at IS NULL
      ),
      active_sessions AS (
        -- Find all other active sessions with profile data
        SELECT
          s.id as session_id,
          s.user_id,
          s.fuzzed_latitude,
          s.fuzzed_longitude,
          s.expires_at,
          ahp.photo_url,
          ahp.description,
          p.name,
          p.age,
          p.gender,
          pref.seeking_gender as their_seeking_gender,
          pref.min_age as their_min_age,
          pref.max_age as their_max_age,
          -- Haversine distance calculation (km)
          -- 6371 = Earth radius in km
          (
            6371 * acos(
              LEAST(1.0, GREATEST(-1.0,
                cos(radians($2)) * cos(radians(s.fuzzed_latitude)) *
                cos(radians(s.fuzzed_longitude) - radians($3)) +
                sin(radians($2)) * sin(radians(s.fuzzed_latitude))
              ))
            )
          ) AS distance
        FROM after_hours_sessions s
        JOIN after_hours_profiles ahp ON ahp.user_id = s.user_id
        JOIN profiles p ON p.user_id = s.user_id
        JOIN after_hours_preferences pref ON pref.user_id = s.user_id
        WHERE s.ended_at IS NULL
          AND s.expires_at > NOW() + INTERVAL '${MIN_SESSION_REMAINING_MINUTES} minutes'
          AND s.user_id != $1
      )
      SELECT
        a.user_id as "userId",
        a.session_id as "sessionId",
        a.name,
        a.age,
        a.photo_url as "photoUrl",
        a.description,
        a.distance,
        a.gender
      FROM active_sessions a
      WHERE
        -- Distance filter
        a.distance <= $4

        -- Mutual gender preference matching
        -- My seeking matches their gender AND their seeking matches my gender
        AND (a.their_seeking_gender = 'Any' OR a.their_seeking_gender = $5)
        AND ($6 = 'Any' OR $6 = a.gender)

        -- Age range: their age within my range
        AND a.age >= $7 AND a.age <= $8

        -- Exclude blocked users (bidirectional)
        AND a.user_id NOT IN (
          SELECT blocked_user_id FROM blocks WHERE user_id = $1
          UNION
          SELECT user_id FROM blocks WHERE blocked_user_id = $1
        )

        -- Exclude already matched this session (non-declined matches only)
        AND a.user_id NOT IN (
          SELECT user_id_2 FROM after_hours_matches
          WHERE session_id = $9 AND user_id_1 = $1 AND declined_by IS NULL
          UNION
          SELECT user_id_1 FROM after_hours_matches
          WHERE session_id = $9 AND user_id_2 = $1 AND declined_by IS NULL
        )

        -- Exclude users I declined (3-decline memory)
        AND a.user_id NOT IN (
          SELECT declined_user_id FROM after_hours_declines
          WHERE user_id = $1 AND decline_count < ${MAX_DECLINE_COUNT}
        )

        -- Exclude users who declined me (3-decline memory)
        AND $1 NOT IN (
          SELECT declined_user_id FROM after_hours_declines
          WHERE user_id = a.user_id AND decline_count < ${MAX_DECLINE_COUNT}
        )

      ORDER BY a.distance ASC
      LIMIT 1
    `;

    const result = await pool.query(query, [
      userId,
      userLocation.lat,
      userLocation.lng,
      preferences.maxDistanceKm,
      userGender,
      preferences.seekingGender,
      preferences.minAge,
      preferences.maxAge,
      sessionId,
    ]);

    if (result.rows.length === 0) {
      logger.debug('No match candidates found', { userId, sessionId });
      return null;
    }

    const candidate = result.rows[0];
    logger.info('Match candidate found', {
      userId,
      candidateId: candidate.userId,
      distance: candidate.distance.toFixed(2),
    });

    return candidate;
  } catch (error: any) {
    logger.error('Failed to find match candidate', {
      error: error.message,
      userId,
      sessionId,
    });
    throw error;
  }
}

// ============================================
// CREATE AFTER HOURS MATCH
// ============================================

/**
 * Atomically create a match between two users.
 *
 * Uses SELECT FOR UPDATE SKIP LOCKED to prevent race conditions:
 * - If another process is matching either user, this returns null
 * - If we can lock both users, we create the match atomically
 *
 * @param pool - Database connection pool
 * @param user1Id - First user's ID
 * @param session1Id - First user's session ID
 * @param user2Id - Second user's ID
 * @param session2Id - Second user's session ID
 * @returns Created match or null if users couldn't be locked
 */
export async function createAfterHoursMatch(
  pool: Pool,
  user1Id: string,
  session1Id: string,
  user2Id: string,
  session2Id: string
): Promise<AfterHoursMatch | null> {
  const client: PoolClient = await pool.connect();

  try {
    await client.query('BEGIN');

    // Lock both users' active sessions to prevent concurrent matching
    // SKIP LOCKED ensures we don't wait - if locked, return null immediately
    const lockCheck = await client.query(
      `SELECT id, user_id, expires_at
       FROM after_hours_sessions
       WHERE user_id IN ($1, $2)
         AND ended_at IS NULL
         AND expires_at > NOW() + INTERVAL '${MIN_SESSION_REMAINING_MINUTES} minutes'
       FOR UPDATE SKIP LOCKED`,
      [user1Id, user2Id]
    );

    // If we couldn't lock both sessions, someone else is matching them
    if (lockCheck.rows.length < 2) {
      await client.query('ROLLBACK');
      logger.info('Could not lock both sessions for matching', {
        user1Id,
        user2Id,
        lockedCount: lockCheck.rows.length,
      });
      return null;
    }

    // Verify neither user already has an active match (double-check within transaction)
    const existingMatchCheck = await client.query(
      `SELECT id FROM after_hours_matches
       WHERE ((user_id_1 = $1 OR user_id_2 = $1) OR (user_id_1 = $2 OR user_id_2 = $2))
         AND declined_by IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [user1Id, user2Id]
    );

    if (existingMatchCheck.rows.length > 0) {
      await client.query('ROLLBACK');
      logger.info('User already has active match', {
        user1Id,
        user2Id,
        existingMatchId: existingMatchCheck.rows[0].id,
      });
      return null;
    }

    // Calculate match expiry: MIN(session1.expires_at, session2.expires_at, NOW + 10 minutes)
    const expiryResult = await client.query(
      `SELECT LEAST(
        (SELECT expires_at FROM after_hours_sessions WHERE id = $1),
        (SELECT expires_at FROM after_hours_sessions WHERE id = $2),
        NOW() + INTERVAL '10 minutes'
      ) as expires_at`,
      [session1Id, session2Id]
    );

    const expiresAt = expiryResult.rows[0].expires_at;

    // Create the match
    const matchResult = await client.query(
      `INSERT INTO after_hours_matches
       (session_id, user_id_1, user_id_2, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING
         id,
         session_id as "sessionId",
         user_id_1 as "userId1",
         user_id_2 as "userId2",
         created_at as "createdAt",
         expires_at as "expiresAt",
         declined_by as "declinedBy",
         declined_at as "declinedAt"`,
      [session1Id, user1Id, user2Id, expiresAt]
    );

    await client.query('COMMIT');

    const match = matchResult.rows[0];
    logger.info('After Hours match created', {
      matchId: match.id,
      user1Id,
      user2Id,
      expiresAt,
    });

    return match;
  } catch (error: any) {
    await client.query('ROLLBACK');
    logger.error('Failed to create After Hours match', {
      error: error.message,
      user1Id,
      user2Id,
    });
    throw error;
  } finally {
    client.release();
  }
}

// ============================================
// GET ACTIVE USER COUNT NEARBY
// ============================================

/**
 * Count active After Hours users near a location.
 * Used for social proof display ("12 people nearby in After Hours").
 *
 * @param pool - Database connection pool
 * @param userLocation - Location to center the search {lat, lng}
 * @param maxDistanceKm - Maximum distance in kilometers
 * @returns Number of active users within distance
 */
export async function getActiveUserCountNearby(
  pool: Pool,
  userLocation: UserLocation,
  maxDistanceKm: number
): Promise<number> {
  try {
    const result = await pool.query(
      `SELECT COUNT(DISTINCT s.user_id) as count
       FROM after_hours_sessions s
       WHERE s.ended_at IS NULL
         AND s.expires_at > NOW()
         AND (
           6371 * acos(
             LEAST(1.0, GREATEST(-1.0,
               cos(radians($1)) * cos(radians(s.fuzzed_latitude)) *
               cos(radians(s.fuzzed_longitude) - radians($2)) +
               sin(radians($1)) * sin(radians(s.fuzzed_latitude))
             ))
           )
         ) <= $3`,
      [userLocation.lat, userLocation.lng, maxDistanceKm]
    );

    const count = parseInt(result.rows[0].count, 10) || 0;

    logger.debug('Active user count nearby', {
      lat: userLocation.lat,
      lng: userLocation.lng,
      maxDistanceKm,
      count,
    });

    return count;
  } catch (error: any) {
    logger.error('Failed to get active user count', {
      error: error.message,
      userLocation,
      maxDistanceKm,
    });
    throw error;
  }
}

// ============================================
// RECORD DECLINE
// ============================================

/**
 * Record a decline and update the decline counter.
 * Uses UPSERT to increment counter if exists, create if new.
 *
 * @param pool - Database connection pool
 * @param userId - User who is declining
 * @param sessionId - Current session ID
 * @param declinedUserId - User being declined
 */
export async function recordDecline(
  pool: Pool,
  userId: string,
  sessionId: string,
  declinedUserId: string
): Promise<void> {
  try {
    // Upsert: increment counter if exists, create if new
    await pool.query(
      `INSERT INTO after_hours_declines
       (user_id, declined_user_id, session_id, decline_count, first_declined_at, last_session_id)
       VALUES ($1, $2, $3, 1, NOW(), $3)
       ON CONFLICT (user_id, declined_user_id)
       DO UPDATE SET
         decline_count = after_hours_declines.decline_count + 1,
         last_session_id = $3`,
      [userId, declinedUserId, sessionId]
    );

    logger.info('Decline recorded', { userId, declinedUserId, sessionId });
  } catch (error: any) {
    logger.error('Failed to record decline', {
      error: error.message,
      userId,
      declinedUserId,
      sessionId,
    });
    throw error;
  }
}

// ============================================
// RESET DECLINE COUNTERS
// ============================================

/**
 * Reset decline counters that have reached the threshold.
 * Called periodically or as part of session cleanup.
 *
 * Users who have declined each other MAX_DECLINE_COUNT times
 * will have their counter reset, allowing them to be matched again.
 *
 * @param pool - Database connection pool
 * @returns Number of decline records reset
 */
export async function resetDeclineCounters(pool: Pool): Promise<number> {
  try {
    // Delete records that have reached the threshold
    // This allows the users to be matched again in future sessions
    const result = await pool.query(
      `DELETE FROM after_hours_declines
       WHERE decline_count >= $1
       RETURNING id`,
      [MAX_DECLINE_COUNT]
    );

    const resetCount = result.rows.length;

    if (resetCount > 0) {
      logger.info('Decline counters reset', { resetCount });
    }

    return resetCount;
  } catch (error: any) {
    logger.error('Failed to reset decline counters', { error: error.message });
    throw error;
  }
}
