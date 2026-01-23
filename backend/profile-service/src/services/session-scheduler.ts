/**
 * Session Scheduler Service
 *
 * Uses BullMQ for reliable delayed job execution.
 * Handles session expiry, cancellation (early termination), and extension.
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

// Module-level references for cleanup
let sessionExpiryQueue: Queue | null = null;
let sessionExpiryWorker: Worker | null = null;
let redisConnection: IORedis | null = null;

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

  // Create queue
  sessionExpiryQueue = new Queue(QUEUE_NAME, { connection: redisConnection });

  // Create worker to process expiry jobs
  sessionExpiryWorker = new Worker(
    QUEUE_NAME,
    async (job: Job) => {
      const { sessionId, userId } = job.data;

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
        // TODO Phase 4: Emit Socket.IO event to notify user
      } else {
        logger.info('Session already ended, no action needed', { sessionId, userId });
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

  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }

  logger.info('Session scheduler closed');
}
