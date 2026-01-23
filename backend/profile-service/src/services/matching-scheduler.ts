/**
 * Matching Scheduler Service
 *
 * Uses BullMQ for periodic and event-driven matching in After Hours mode.
 * - Periodic job runs every 30 seconds to catch users who might have been missed
 * - Event-driven triggers fire on session start (15s delay) or decline (30s cooldown)
 * - Match events are published to Redis pub/sub for chat-service to deliver via Socket.IO
 *
 * IMPORTANT: This service uses Redis pub/sub to communicate match events.
 * chat-service subscribes to 'after_hours:events' channel and delivers to clients.
 * profile-service does NOT have Socket.IO - all real-time delivery goes through chat-service.
 *
 * Requires REDIS_URL environment variable.
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import logger from '../utils/logger';
import {
  findMatchCandidate,
  createAfterHoursMatch,
  getActiveUserCountNearby,
  UserPreferences,
  UserLocation,
  AfterHoursMatch,
} from './matching-engine';
import { resolvePhotoUrl } from '../utils/r2-client';

// ============================================
// CONSTANTS
// ============================================

const QUEUE_NAME = 'after-hours-matching';
const REDIS_EVENTS_CHANNEL = 'after_hours:events';

// Auto-decline timer duration (5 minutes)
const AUTO_DECLINE_MINUTES = 5;

// ============================================
// MODULE STATE
// ============================================

let matchingQueue: Queue | null = null;
let matchingWorker: Worker | null = null;
let redisConnection: IORedis | null = null;
let redisPublisher: IORedis | null = null; // Separate Redis client for pub/sub

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize the matching scheduler (call on app startup)
 *
 * Creates:
 * - BullMQ queue for job scheduling
 * - Worker to process matching jobs
 * - Periodic job that runs every 30 seconds
 * - Separate Redis client for pub/sub event publishing
 *
 * @param pool - PostgreSQL connection pool
 */
export async function initializeMatchingScheduler(pool: Pool): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  // Create Redis connection for BullMQ
  redisConnection = new IORedis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
    enableReadyCheck: false,
  });

  // Wait for connection or error
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Redis connection timeout after 10 seconds'));
    }, 10000);

    redisConnection!.once('ready', () => {
      clearTimeout(timeout);
      logger.info('Redis connected for matching scheduler', {
        url: redisUrl.replace(/:[^:@]+@/, ':***@'),
      });
      resolve();
    });

    redisConnection!.once('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Redis connection failed: ${err.message}`));
    });
  });

  redisConnection.on('error', (err) => {
    logger.error('Redis connection error (matching scheduler)', { error: err.message });
  });

  // Create separate Redis client for pub/sub publishing
  // BullMQ uses its own connection, so we need a separate one for publish
  redisPublisher = new IORedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error('Redis publisher connection timeout'));
    }, 10000);

    redisPublisher!.once('ready', () => {
      clearTimeout(timeout);
      logger.info('Redis publisher connected for match events');
      resolve();
    });

    redisPublisher!.once('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Redis publisher connection failed: ${err.message}`));
    });
  });

  redisPublisher.on('error', (err) => {
    logger.error('Redis publisher error', { error: err.message });
  });

  // Create BullMQ queue
  matchingQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

  // Set up periodic matching job (every 30 seconds)
  await matchingQueue.upsertJobScheduler(
    'periodic-matching',
    { every: 30000 }, // 30 seconds
    { name: 'run-matching-cycle', data: {} }
  );

  logger.info('Periodic matching job scheduled', { interval: '30 seconds' });

  // Create worker to process matching jobs
  matchingWorker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      switch (job.name) {
        case 'run-matching-cycle':
          await runMatchingCycleForAllSessions(pool);
          break;

        case 'match-single-user':
          await runMatchingForUser(pool, job.data.userId, job.data.sessionId);
          break;

        default:
          logger.warn('Unknown matching job type', { jobName: job.name });
      }
    },
    { connection: redisConnection }
  );

  // Worker event handlers
  matchingWorker.on('failed', (job, err) => {
    logger.error('Matching job failed', {
      jobId: job?.id,
      jobName: job?.name,
      error: err.message,
    });
  });

  matchingWorker.on('completed', (job) => {
    logger.debug('Matching job completed', {
      jobId: job.id,
      jobName: job.name,
    });
  });

  logger.info('Matching scheduler initialized', { queue: QUEUE_NAME });
}

// ============================================
// MATCHING CYCLE (PERIODIC)
// ============================================

/**
 * Run matching for all active sessions without current matches.
 * Called periodically (every 30 seconds) to catch missed users.
 */
async function runMatchingCycleForAllSessions(pool: Pool): Promise<void> {
  try {
    // Find all active sessions with sufficient time remaining
    // Only include sessions that don't have an active (non-declined) match
    const sessionsResult = await pool.query(
      `SELECT s.id, s.user_id, s.fuzzed_latitude, s.fuzzed_longitude
       FROM after_hours_sessions s
       WHERE s.ended_at IS NULL
         AND s.expires_at > NOW() + INTERVAL '2 minutes'
         AND NOT EXISTS (
           SELECT 1 FROM after_hours_matches m
           WHERE (m.user_id_1 = s.user_id OR m.user_id_2 = s.user_id)
             AND m.declined_by IS NULL
             AND m.expires_at > NOW()
         )`
    );

    if (sessionsResult.rows.length === 0) {
      logger.debug('No sessions needing matching in this cycle');
      return;
    }

    logger.info('Running matching cycle', { sessionCount: sessionsResult.rows.length });

    // Process each session
    for (const session of sessionsResult.rows) {
      try {
        await runMatchingForUser(pool, session.user_id, session.id);
      } catch (error: any) {
        // Log but continue with other sessions
        logger.error('Matching failed for user in cycle', {
          userId: session.user_id,
          sessionId: session.id,
          error: error.message,
        });
      }
    }
  } catch (error: any) {
    logger.error('Matching cycle failed', { error: error.message });
    throw error;
  }
}

// ============================================
// SINGLE USER MATCHING
// ============================================

/**
 * Run matching for a single user.
 * Called by periodic cycle or event-driven trigger.
 */
async function runMatchingForUser(
  pool: Pool,
  userId: string,
  sessionId: string
): Promise<void> {
  try {
    // Check if user already has an active match
    const existingMatchCheck = await pool.query(
      `SELECT id FROM after_hours_matches
       WHERE (user_id_1 = $1 OR user_id_2 = $1)
         AND declined_by IS NULL
         AND expires_at > NOW()
       LIMIT 1`,
      [userId]
    );

    if (existingMatchCheck.rows.length > 0) {
      logger.debug('User already has active match, skipping', {
        userId,
        matchId: existingMatchCheck.rows[0].id,
      });
      return;
    }

    // Get user's session location
    const sessionResult = await pool.query(
      `SELECT fuzzed_latitude, fuzzed_longitude
       FROM after_hours_sessions
       WHERE id = $1 AND user_id = $2`,
      [sessionId, userId]
    );

    if (sessionResult.rows.length === 0) {
      logger.warn('Session not found for matching', { userId, sessionId });
      return;
    }

    const session = sessionResult.rows[0];
    const userLocation: UserLocation = {
      lat: parseFloat(session.fuzzed_latitude),
      lng: parseFloat(session.fuzzed_longitude),
    };

    // Get user's preferences
    const prefsResult = await pool.query(
      `SELECT seeking_gender, max_distance_km, min_age, max_age
       FROM after_hours_preferences
       WHERE user_id = $1`,
      [userId]
    );

    if (prefsResult.rows.length === 0) {
      logger.warn('Preferences not found for matching', { userId });
      return;
    }

    const prefs = prefsResult.rows[0];
    const preferences: UserPreferences = {
      seekingGender: prefs.seeking_gender,
      maxDistanceKm: parseFloat(prefs.max_distance_km),
      minAge: prefs.min_age,
      maxAge: prefs.max_age,
    };

    // Get user's gender from main profile
    const profileResult = await pool.query(
      `SELECT gender FROM profiles WHERE user_id = $1`,
      [userId]
    );

    if (profileResult.rows.length === 0) {
      logger.warn('Profile not found for matching', { userId });
      return;
    }

    const userGender = profileResult.rows[0].gender || 'Other';

    // Find a match candidate
    const candidate = await findMatchCandidate(
      pool,
      userId,
      sessionId,
      userLocation,
      userGender,
      preferences
    );

    if (!candidate) {
      // No candidate found - publish "no matches" event for UI feedback
      const activeCount = await getActiveUserCountNearby(
        pool,
        userLocation,
        preferences.maxDistanceKm
      );

      await publishMatchEvent('after_hours:no_matches', userId, {
        activeUsersNearby: activeCount,
        message: 'No matches available right now. Stay active!',
      });

      logger.debug('No match candidate found', { userId, activeCount });
      return;
    }

    // Try to create the match atomically
    const match = await createAfterHoursMatch(
      pool,
      userId,
      sessionId,
      candidate.userId,
      candidate.sessionId
    );

    if (!match) {
      // Lock failed - candidate was matched by another process
      logger.info('Match creation failed (concurrent matching)', {
        userId,
        candidateId: candidate.userId,
      });
      return;
    }

    // Match created successfully - publish to both users
    await publishMatchToBothUsers(pool, match, userId, candidate);

    logger.info('Match created and published', {
      matchId: match.id,
      user1: userId,
      user2: candidate.userId,
    });
  } catch (error: any) {
    logger.error('Matching failed for user', {
      userId,
      sessionId,
      error: error.message,
    });
    throw error;
  }
}

// ============================================
// MATCH EVENT PUBLISHING
// ============================================

/**
 * Publish match event to both users in the match.
 * Resolves profile photos to presigned URLs and calculates auto-decline timer.
 */
async function publishMatchToBothUsers(
  pool: Pool,
  match: AfterHoursMatch,
  initiatorId: string,
  initiatorCandidate: { userId: string; name: string; age: number; photoUrl: string; description: string | null; distance: number }
): Promise<void> {
  // Calculate auto-decline time (5 minutes from now)
  const autoDeclineAt = new Date(Date.now() + AUTO_DECLINE_MINUTES * 60 * 1000);

  // Get initiator's profile info for the other user
  const initiatorProfileResult = await pool.query(
    `SELECT ah.photo_url, ah.description, p.name, p.age
     FROM after_hours_profiles ah
     JOIN profiles p ON ah.user_id = p.user_id
     WHERE ah.user_id = $1`,
    [initiatorId]
  );

  if (initiatorProfileResult.rows.length === 0) {
    logger.error('Initiator profile not found for match publishing', { initiatorId });
    return;
  }

  const initiatorProfile = initiatorProfileResult.rows[0];

  // Resolve photo URLs to presigned URLs
  let initiatorPhotoUrl: string | null = null;
  let candidatePhotoUrl: string | null = null;

  try {
    if (initiatorProfile.photo_url && initiatorProfile.photo_url !== '') {
      initiatorPhotoUrl = await resolvePhotoUrl(initiatorProfile.photo_url);
    }
    if (initiatorCandidate.photoUrl && initiatorCandidate.photoUrl !== '') {
      candidatePhotoUrl = await resolvePhotoUrl(initiatorCandidate.photoUrl);
    }
  } catch (error) {
    logger.warn('Failed to resolve photo URLs for match', { error });
  }

  // Calculate distance from candidate's perspective (should be same)
  // We already have distance from findMatchCandidate

  // Publish to the initiator (user who triggered matching)
  await publishMatchEvent('after_hours:match', initiatorId, {
    matchId: match.id,
    expiresAt: match.expiresAt.toISOString(),
    autoDeclineAt: autoDeclineAt.toISOString(),
    profile: {
      userId: initiatorCandidate.userId,
      name: initiatorCandidate.name,
      age: initiatorCandidate.age,
      photoUrl: candidatePhotoUrl,
      description: initiatorCandidate.description,
      distance: Math.round(initiatorCandidate.distance * 10) / 10, // Round to 1 decimal
    },
  });

  // Publish to the candidate (other user in the match)
  await publishMatchEvent('after_hours:match', initiatorCandidate.userId, {
    matchId: match.id,
    expiresAt: match.expiresAt.toISOString(),
    autoDeclineAt: autoDeclineAt.toISOString(),
    profile: {
      userId: initiatorId,
      name: initiatorProfile.name,
      age: initiatorProfile.age,
      photoUrl: initiatorPhotoUrl,
      description: initiatorProfile.description,
      distance: Math.round(initiatorCandidate.distance * 10) / 10, // Same distance
    },
  });

  logger.info('Match events published to both users', {
    matchId: match.id,
    user1: initiatorId,
    user2: initiatorCandidate.userId,
  });
}

/**
 * Publish a match event to Redis pub/sub channel.
 * chat-service subscribes to this channel and delivers to connected clients via Socket.IO.
 *
 * @param eventType - Event type (e.g., 'after_hours:match', 'after_hours:no_matches')
 * @param targetUserId - User to receive the event
 * @param payload - Event payload data
 */
export async function publishMatchEvent(
  eventType: string,
  targetUserId: string,
  payload: Record<string, any>
): Promise<void> {
  if (!redisPublisher) {
    logger.warn('Cannot publish event: Redis publisher not initialized');
    return;
  }

  const event = {
    type: eventType,
    targetUserId,
    payload,
    timestamp: new Date().toISOString(),
  };

  try {
    await redisPublisher.publish(REDIS_EVENTS_CHANNEL, JSON.stringify(event));
    logger.debug('Match event published', { eventType, targetUserId });
  } catch (error: any) {
    logger.error('Failed to publish match event', {
      eventType,
      targetUserId,
      error: error.message,
    });
  }
}

// ============================================
// EVENT-DRIVEN TRIGGERS
// ============================================

/**
 * Trigger matching for a user after a delay.
 * Used for session start (15s delay) or decline (30s cooldown).
 *
 * @param userId - User to trigger matching for
 * @param sessionId - User's current session ID
 * @param delayMs - Delay before matching runs (default 15000 for session start)
 */
export async function triggerMatchingForUser(
  userId: string,
  sessionId: string,
  delayMs: number = 15000
): Promise<void> {
  if (!matchingQueue) {
    logger.warn('Cannot trigger matching: queue not initialized');
    return;
  }

  // Job ID includes timestamp to allow multiple triggers
  const jobId = `match:user:${userId}:${Date.now()}`;

  await matchingQueue.add(
    'match-single-user',
    { userId, sessionId },
    {
      delay: delayMs,
      jobId,
      removeOnComplete: true,
      removeOnFail: 10, // Keep last 10 failed jobs for debugging
    }
  );

  logger.info('Matching triggered for user', {
    userId,
    sessionId,
    delayMs,
    jobId,
  });
}

// ============================================
// SHUTDOWN
// ============================================

/**
 * Gracefully close the matching scheduler (call on app shutdown)
 */
export async function closeMatchingScheduler(): Promise<void> {
  if (matchingWorker) {
    await matchingWorker.close();
    matchingWorker = null;
  }

  if (matchingQueue) {
    await matchingQueue.close();
    matchingQueue = null;
  }

  if (redisPublisher) {
    redisPublisher.disconnect();
    redisPublisher = null;
  }

  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }

  logger.info('Matching scheduler closed');
}
