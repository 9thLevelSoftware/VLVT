/**
 * Message Cleanup Job
 *
 * Scheduled BullMQ job that runs daily at 3 AM UTC to clean up
 * After Hours messages that are older than 30 days for matches
 * that were NOT saved (converted_to_match_id IS NULL).
 *
 * Safety: Messages are retained 30 days server-side even if
 * the UI shows them as "deleted" - for moderation/report purposes.
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import logger from '../utils/logger';

const CLEANUP_QUEUE_NAME = 'after-hours-message-cleanup';
const RETENTION_DAYS = 30;

let cleanupQueue: Queue | null = null;
let cleanupWorker: Worker | null = null;
let redisConnection: IORedis | null = null;

/**
 * Initialize the message cleanup job scheduler (call on app startup)
 *
 * Non-blocking: If Redis connection fails, logs warning and continues.
 * Server can still function; cleanup job won't run automatically.
 *
 * @param pool - PostgreSQL connection pool
 */
export async function initializeMessageCleanupJob(pool: Pool): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    redisConnection = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Wait for connection with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        redisConnection?.disconnect();
        reject(new Error('Redis connection timeout after 10 seconds'));
      }, 10000);

      redisConnection!.once('ready', () => {
        clearTimeout(timeout);
        logger.info('Redis connected for message cleanup job', {
          url: redisUrl.replace(/:[^:@]+@/, ':***@'),
        });
        resolve();
      });

      redisConnection!.once('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    redisConnection.on('error', (err) => {
      logger.error('Redis connection error (message cleanup)', { error: err.message });
    });

    cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, { connection: redisConnection });

    // Schedule daily cleanup at 3 AM UTC
    await cleanupQueue.upsertJobScheduler(
      'daily-cleanup',
      { pattern: '0 3 * * *' }, // Cron: 3 AM daily
      { name: 'cleanup-expired-messages', data: {} }
    );

    cleanupWorker = new Worker(
      CLEANUP_QUEUE_NAME,
      async (job: Job) => {
        if (job.name === 'cleanup-expired-messages') {
          await cleanupExpiredMessages(pool);
        }
      },
      { connection: redisConnection }
    );

    cleanupWorker.on('failed', (job, err) => {
      logger.error('Message cleanup job failed', { jobId: job?.id, error: err.message });
    });

    cleanupWorker.on('completed', (job) => {
      logger.info('Message cleanup job completed', { jobId: job.id });
    });

    logger.info('Message cleanup job scheduled', {
      schedule: '3 AM UTC daily',
      retentionDays: RETENTION_DAYS,
    });
  } catch (error: any) {
    logger.warn('Failed to initialize message cleanup job', {
      error: error.message,
    });
    // Non-blocking: server continues without cleanup job
    // Messages will accumulate but can be cleaned up manually later
  }
}

/**
 * Clean up expired After Hours messages and matches
 *
 * Deletes:
 * 1. Messages where match expired more than 30 days ago AND was NOT saved
 * 2. Matches themselves after their messages are deleted
 */
async function cleanupExpiredMessages(pool: Pool): Promise<void> {
  try {
    // Delete messages where:
    // 1. Match expired more than 30 days ago
    // 2. Match was NOT saved (converted_to_match_id IS NULL)
    const messagesResult = await pool.query(
      `DELETE FROM after_hours_messages
       WHERE match_id IN (
         SELECT id FROM after_hours_matches
         WHERE expires_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
           AND converted_to_match_id IS NULL
       )
       RETURNING id`
    );

    const deletedMessageCount = messagesResult.rows.length;

    // Also clean up the expired matches themselves
    const matchesResult = await pool.query(
      `DELETE FROM after_hours_matches
       WHERE expires_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
         AND converted_to_match_id IS NULL
       RETURNING id`
    );

    const deletedMatchCount = matchesResult.rows.length;

    if (deletedMessageCount > 0 || deletedMatchCount > 0) {
      logger.info('Cleaned up expired After Hours data', {
        deletedMessages: deletedMessageCount,
        deletedMatches: deletedMatchCount,
        retentionDays: RETENTION_DAYS,
      });
    } else {
      logger.debug('No expired After Hours data to clean up', {
        retentionDays: RETENTION_DAYS,
      });
    }
  } catch (error: any) {
    logger.error('Failed to cleanup expired messages', { error: error.message });
    throw error;
  }
}

/**
 * Close the message cleanup job (call on app shutdown)
 */
export async function closeMessageCleanupJob(): Promise<void> {
  if (cleanupWorker) {
    await cleanupWorker.close();
    cleanupWorker = null;
  }

  if (cleanupQueue) {
    await cleanupQueue.close();
    cleanupQueue = null;
  }

  if (redisConnection) {
    redisConnection.disconnect();
    redisConnection = null;
  }

  logger.info('Message cleanup job closed');
}
