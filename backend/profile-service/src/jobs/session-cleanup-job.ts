/**
 * Session Cleanup Job
 *
 * Scheduled BullMQ job that runs daily at 4 AM UTC to clean up:
 * 1. Expired sessions that weren't properly ended (ended_at still NULL)
 * 2. Session decline records older than 7 days
 * 3. Device fingerprints for sessions that no longer exist
 *
 * Runs 1 hour after message cleanup to ensure messages are cleaned first.
 */

import { Queue, Worker, Job } from 'bullmq';
import IORedis from 'ioredis';
import { Pool } from 'pg';
import logger from '../utils/logger';

const CLEANUP_QUEUE_NAME = 'after-hours-session-cleanup';
const SESSION_RETENTION_DAYS = 7;  // Keep ended sessions for 7 days

let cleanupQueue: Queue | null = null;
let cleanupWorker: Worker | null = null;
let redisConnection: IORedis | null = null;

/**
 * Initialize the session cleanup job scheduler (call on app startup)
 *
 * Non-blocking: If Redis connection fails, logs warning and continues.
 * Server can still function; cleanup job won't run automatically.
 *
 * @param pool - PostgreSQL connection pool
 */
export async function initializeSessionCleanupJob(pool: Pool): Promise<void> {
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
        logger.info('Redis connected for session cleanup job', {
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
      logger.error('Redis connection error (session cleanup)', { error: err.message });
    });

    cleanupQueue = new Queue(CLEANUP_QUEUE_NAME, { connection: redisConnection });

    // Schedule daily cleanup at 4 AM UTC (1 hour after message cleanup)
    await cleanupQueue.upsertJobScheduler(
      'daily-session-cleanup',
      { pattern: '0 4 * * *' },
      { name: 'cleanup-expired-sessions', data: {} }
    );

    cleanupWorker = new Worker(
      CLEANUP_QUEUE_NAME,
      async (job: Job) => {
        if (job.name === 'cleanup-expired-sessions') {
          await cleanupExpiredSessions(pool);
        }
      },
      { connection: redisConnection }
    );

    cleanupWorker.on('failed', (job, err) => {
      logger.error('Session cleanup job failed', { jobId: job?.id, error: err.message });
    });

    cleanupWorker.on('completed', (job) => {
      logger.info('Session cleanup job completed', { jobId: job.id });
    });

    logger.info('Session cleanup job scheduled', {
      schedule: '4 AM UTC daily',
      retentionDays: SESSION_RETENTION_DAYS,
    });
  } catch (error: any) {
    logger.warn('Failed to initialize session cleanup job', { error: error.message });
    // Non-blocking: server continues without cleanup job
  }
}

/**
 * Clean up expired After Hours sessions and related data
 *
 * Cleans:
 * 1. Sessions that expired but were never ended (sets ended_at = expires_at)
 * 2. Decline records older than retention period
 * 3. Orphaned device fingerprints (session no longer exists)
 */
async function cleanupExpiredSessions(pool: Pool): Promise<void> {
  try {
    // 1. Clean up sessions that expired but were never ended
    const expiredSessions = await pool.query(
      `UPDATE after_hours_sessions
       SET ended_at = expires_at
       WHERE ended_at IS NULL
         AND expires_at < NOW()
       RETURNING id`
    );

    // 2. Delete old decline records (older than 7 days)
    const oldDeclines = await pool.query(
      `DELETE FROM after_hours_declines
       WHERE created_at < NOW() - INTERVAL '${SESSION_RETENTION_DAYS} days'
       RETURNING id`
    );

    // 3. Delete orphaned device fingerprints (session no longer exists)
    const orphanedFingerprints = await pool.query(
      `DELETE FROM device_fingerprints
       WHERE session_id IS NOT NULL
         AND session_id NOT IN (SELECT id FROM after_hours_sessions)
       RETURNING id`
    );

    logger.info('Session cleanup completed', {
      expiredSessionsClosed: expiredSessions.rows.length,
      oldDeclinesDeleted: oldDeclines.rows.length,
      orphanedFingerprintsDeleted: orphanedFingerprints.rows.length,
    });
  } catch (error: any) {
    logger.error('Failed to cleanup sessions', { error: error.message });
    throw error;
  }
}

/**
 * Close the session cleanup job (call on app shutdown)
 */
export async function closeSessionCleanupJob(): Promise<void> {
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

  logger.info('Session cleanup job closed');
}
