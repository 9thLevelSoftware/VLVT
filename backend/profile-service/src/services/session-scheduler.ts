/**
 * Session Scheduler Service
 *
 * Uses BullMQ for reliable delayed job execution.
 * Handles session expiry, cancellation (early termination), extension, and expiry warnings.
 *
 * Session expiry notifications:
 * - 2 minutes before expiry: Publishes `after_hours:session_expiring` event
 * - At expiry: Publishes `after_hours:session_expired` event
 *
 * Events are published to Redis pub/sub for chat-service to deliver via Socket.IO.
 *
 * IMPORTANT: Requires REDIS_URL environment variable.
 * In development: redis://localhost:6379
 * In production: Railway Redis connection URL
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import logger from '../utils/logger';

// Queue name constant
const QUEUE_NAME = 'after-hours-session-expiry';
const REDIS_EVENTS_CHANNEL = 'after_hours:events';

// Warning time before expiry (2 minutes)
const WARNING_MINUTES_BEFORE_EXPIRY = 2;

// Module-level references for cleanup
let sessionExpiryQueue: Queue | null = null;
let sessionExpiryWorker: Worker | null = null;
let redisConnection: IORedis | null = null;
let redisPublisher: IORedis | null = null;

/**
 * Initialize the session scheduler (call on app startup)
 *
 * IMPORTANT: This function throws if Redis connection fails.
 * The calling code should handle this appropriately - either:
 * 1. Fail startup (recommended for production)
 * 2. Log and continue with degraded functionality (sessions won't auto-expire)
 */
export async function initializeSessionWorker(pool: Pool): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  // Create Redis connection
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
      logger.info('Redis connected for session scheduler', { url: redisUrl.replace(/:[^:@]+@/, ':***@') });
      resolve();
    });

    redisConnection!.once('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Redis connection failed: ${err.message}`));
    });
  });

  redisConnection.on('error', (err) => {
    logger.error('Redis connection error (after initial connect)', { error: err.message });
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
      logger.info('Redis publisher connected for session events');
      resolve();
    });

    redisPublisher!.once('error', (err) => {
      clearTimeout(timeout);
      reject(new Error(`Redis publisher connection failed: ${err.message}`));
    });
  });

  redisPublisher.on('error', (err) => {
    logger.error('Redis publisher error (session scheduler)', { error: err.message });
  });

  // Create queue
  sessionExpiryQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

  // Create worker to process expiry and warning jobs
  sessionExpiryWorker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { sessionId, userId } = job.data;

      switch (job.name) {
        case 'expire': {
          logger.info('Processing session expiry job', { sessionId, userId, jobId: job.id });

          // End the session (set ended_at if not already ended)
          const result = await pool.query(
            `UPDATE after_hours_sessions
             SET ended_at = CURRENT_TIMESTAMP
             WHERE id = $1 AND ended_at IS NULL
             RETURNING id`,
            [sessionId]
          );

          if (result.rows.length > 0) {
            logger.info('Session expired by scheduler', { sessionId, userId });

            // Publish session expired event via Redis pub/sub
            await publishSessionEvent('after_hours:session_expired', userId, {
              sessionId,
              reason: 'timeout',
            });
          } else {
            logger.info('Session already ended, no action needed', { sessionId, userId });
          }
          break;
        }

        case 'session-expiring-warning': {
          logger.info('Processing session expiry warning', { sessionId, userId, jobId: job.id });

          // Check if session is still active before sending warning
          const sessionCheck = await pool.query(
            `SELECT id FROM after_hours_sessions
             WHERE id = $1 AND ended_at IS NULL`,
            [sessionId]
          );

          if (sessionCheck.rows.length > 0) {
            // Publish session expiring warning via Redis pub/sub
            await publishSessionEvent('after_hours:session_expiring', userId, {
              sessionId,
              expiresAt: job.data.expiresAt,
              minutesRemaining: WARNING_MINUTES_BEFORE_EXPIRY,
            });

            logger.info('Session expiry warning sent', {
              sessionId,
              userId,
              minutesRemaining: WARNING_MINUTES_BEFORE_EXPIRY,
            });
          } else {
            logger.info('Session already ended, skipping warning', { sessionId, userId });
          }
          break;
        }

        default:
          logger.warn('Unknown session scheduler job type', { jobName: job.name, jobId: job.id });
      }
    },
    { connection: redisConnection }
  );

  sessionExpiryWorker.on('failed', (job, err) => {
    logger.error('Session expiry job failed', {
      jobId: job?.id,
      sessionId: job?.data?.sessionId,
      error: err.message,
    });
  });

  sessionExpiryWorker.on('completed', (job) => {
    logger.info('Session expiry job completed', {
      jobId: job.id,
      sessionId: job.data.sessionId,
    });
  });

  logger.info('Session scheduler initialized', { queue: QUEUE_NAME });
}

/**
 * Schedule a session to expire after the given delay
 */
export async function scheduleSessionExpiry(
  sessionId: string,
  userId: string,
  delayMs: number
): Promise<void> {
  if (!sessionExpiryQueue) {
    throw new Error('Session scheduler not initialized. Call initializeSessionWorker first.');
  }

  await sessionExpiryQueue.add(
    'expire',
    { sessionId, userId },
    {
      delay: delayMs,
      jobId: `session:expire:${sessionId}`, // Idempotency key
      removeOnComplete: true,
      removeOnFail: 100, // Keep last 100 failed for debugging
    }
  );

  logger.info('Scheduled session expiry', {
    sessionId,
    userId,
    delayMs,
    expiresIn: `${Math.round(delayMs / 60000)} minutes`,
  });
}

/**
 * Schedule a session expiry warning (2 minutes before expiry)
 *
 * Called after session start to schedule the warning notification.
 * If session duration is less than 2 minutes, warning is skipped.
 *
 * @param userId - User to notify
 * @param sessionId - Session ID
 * @param expiresAt - Session expiry time
 */
export async function scheduleSessionExpiryWarning(
  userId: string,
  sessionId: string,
  expiresAt: Date
): Promise<void> {
  if (!sessionExpiryQueue) {
    logger.warn('Cannot schedule warning: session scheduler not initialized');
    return;
  }

  // Calculate warning time (2 minutes before expiry)
  const warningTime = new Date(expiresAt.getTime() - WARNING_MINUTES_BEFORE_EXPIRY * 60 * 1000);
  const delayMs = Math.max(0, warningTime.getTime() - Date.now());

  // Don't schedule if warning would be in the past or less than 10 seconds away
  if (delayMs < 10000) {
    logger.info('Session too short for expiry warning, skipping', {
      sessionId,
      expiresAt: expiresAt.toISOString(),
    });
    return;
  }

  await sessionExpiryQueue.add(
    'session-expiring-warning',
    { userId, sessionId, expiresAt: expiresAt.toISOString() },
    {
      delay: delayMs,
      jobId: `session:warning:${sessionId}`,
      removeOnComplete: true,
      removeOnFail: 10,
    }
  );

  logger.info('Scheduled session expiry warning', {
    sessionId,
    warningAt: warningTime.toISOString(),
    minutesBefore: WARNING_MINUTES_BEFORE_EXPIRY,
  });
}

/**
 * Cancel a scheduled session expiry warning (for early termination)
 */
export async function cancelSessionExpiryWarning(sessionId: string): Promise<void> {
  if (!sessionExpiryQueue) {
    return;
  }

  const jobId = `session:warning:${sessionId}`;
  const job = await sessionExpiryQueue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info('Cancelled session expiry warning job', { sessionId, jobId });
  }
}

/**
 * Publish a session event to Redis pub/sub channel.
 * chat-service subscribes to this channel and delivers to connected clients via Socket.IO.
 *
 * @param eventType - Event type (e.g., 'after_hours:session_expiring')
 * @param targetUserId - User to receive the event
 * @param payload - Event payload data
 */
async function publishSessionEvent(
  eventType: string,
  targetUserId: string,
  payload: Record<string, any>
): Promise<void> {
  if (!redisPublisher) {
    logger.warn('Cannot publish session event: Redis publisher not initialized');
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
    logger.debug('Session event published', { eventType, targetUserId });
  } catch (error: any) {
    logger.error('Failed to publish session event', {
      eventType,
      targetUserId,
      error: error.message,
    });
  }
}

/**
 * Cancel a scheduled session expiry (for early termination)
 */
export async function cancelSessionExpiry(sessionId: string): Promise<void> {
  if (!sessionExpiryQueue) {
    logger.warn('Cannot cancel expiry: scheduler not initialized');
    return;
  }

  const jobId = `session:expire:${sessionId}`;
  const job = await sessionExpiryQueue.getJob(jobId);

  if (job) {
    await job.remove();
    logger.info('Cancelled session expiry job', { sessionId, jobId });
  } else {
    logger.info('No expiry job found to cancel', { sessionId, jobId });
  }
}

/**
 * Extend a session by rescheduling the expiry job
 */
export async function extendSessionExpiry(
  sessionId: string,
  userId: string,
  newDelayMs: number
): Promise<void> {
  // Cancel existing job and create new one
  await cancelSessionExpiry(sessionId);
  await scheduleSessionExpiry(sessionId, userId, newDelayMs);

  logger.info('Extended session expiry', {
    sessionId,
    userId,
    newDelayMs,
    newExpiresIn: `${Math.round(newDelayMs / 60000)} minutes`,
  });
}

/**
 * Gracefully close the scheduler (call on app shutdown)
 */
export async function closeSessionScheduler(): Promise<void> {
  if (sessionExpiryWorker) {
    await sessionExpiryWorker.close();
    sessionExpiryWorker = null;
  }

  if (sessionExpiryQueue) {
    await sessionExpiryQueue.close();
    sessionExpiryQueue = null;
  }

  if (redisPublisher) {
    redisPublisher.disconnect();
    redisPublisher = null;
  }

  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }

  logger.info('Session scheduler closed');
}
