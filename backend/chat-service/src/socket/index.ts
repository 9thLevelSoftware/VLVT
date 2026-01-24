/**
 * Socket.IO Server Setup
 * Configures and initializes Socket.IO for real-time messaging
 */

import { Server as HttpServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import { Pool } from 'pg';
import { createAdapter } from '@socket.io/redis-adapter';
import IORedis from 'ioredis';
import logger from '../utils/logger';
import { socketAuthMiddleware, SocketWithAuth } from './auth-middleware';
import { setupMessageHandlers, updateUserStatus } from './message-handler';
import { initializeAfterHoursRedisSubscriber, setupAfterHoursHandlers } from './after-hours-handler';
import { createSocketRateLimiter, SocketRateLimiter } from '@vlvt/shared';

/**
 * Socket.IO rate limiter with chat-specific configuration
 * - send_message: 30 per minute (normal conversation pace)
 * - typing: 10 per 10 seconds (prevent typing indicator spam)
 * - mark_read: 60 per minute (batch reads are common)
 * - get_online_status: 30 per minute (prevents DB query flooding)
 * - After Hours events: same limits as regular chat
 */
const socketRateLimiter: SocketRateLimiter = createSocketRateLimiter({
  limits: {
    // Regular chat limits
    send_message: { maxEvents: 30, windowMs: 60000 },
    typing: { maxEvents: 10, windowMs: 10000 },
    mark_read: { maxEvents: 60, windowMs: 60000 },
    get_online_status: { maxEvents: 30, windowMs: 60000 },
    // After Hours limits (same as regular chat)
    'after_hours:send_message': { maxEvents: 30, windowMs: 60000 },
    'after_hours:typing': { maxEvents: 10, windowMs: 10000 },
    'after_hours:mark_read': { maxEvents: 60, windowMs: 60000 },
  },
  logViolations: true,
  errorEventName: 'rate_limit_error',
  logger: {
    warn: (message, meta) => logger.warn(message, meta),
    debug: (message, meta) => logger.debug(message, meta),
  },
  onRateLimitExceeded: (socket, eventName, userId) => {
    logger.info('Socket rate limit exceeded for user', {
      socketId: socket.id,
      userId,
      eventName,
    });
  },
});

/**
 * Initialize and configure Socket.IO server
 */
export const initializeSocketIO = (httpServer: HttpServer, pool: Pool): SocketServer => {
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:19006';

  // Create Socket.IO server with configuration
  const io = new SocketServer(httpServer, {
    cors: {
      origin: corsOrigin,
      methods: ['GET', 'POST'],
      credentials: true
    },
    pingTimeout: 60000, // 60 seconds
    pingInterval: 25000, // 25 seconds
    transports: ['websocket'], // WebSocket only - polling disabled for CSRF protection
    allowEIO3: false // Disable legacy protocol support for security
  });

  logger.info('Socket.IO server initialized', { corsOrigin });

  // Configure Redis adapter for horizontal scaling (optional, non-blocking)
  // If Redis is unavailable, Socket.IO works in single-instance mode
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    (async () => {
      try {
        const pubClient = new IORedis(redisUrl);
        const subClient = pubClient.duplicate();

        // Wait for both clients to connect
        await Promise.all([
          new Promise<void>((resolve, reject) => {
            pubClient.once('ready', resolve);
            pubClient.once('error', reject);
          }),
          new Promise<void>((resolve, reject) => {
            subClient.once('ready', resolve);
            subClient.once('error', reject);
          }),
        ]);

        io.adapter(createAdapter(pubClient, subClient));
        logger.info('Socket.IO Redis adapter configured for horizontal scaling');
      } catch (error) {
        logger.warn('Failed to configure Redis adapter, running in single-instance mode', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    })();
  } else {
    logger.info('REDIS_URL not set, Socket.IO running in single-instance mode');
  }

  // Initialize After Hours Redis subscriber (non-blocking)
  // Server continues if Redis unavailable - match events won't be delivered in real-time
  // but can still be fetched via REST API (GET /match/current)
  initializeAfterHoursRedisSubscriber(io).catch((err) => {
    logger.warn('Failed to initialize After Hours Redis subscriber', {
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  });

  // Apply authentication middleware
  io.use(socketAuthMiddleware);

  // Handle new connections
  io.on('connection', async (socket: SocketWithAuth) => {
    const userId = socket.userId!;

    logger.info('Client connected', {
      socketId: socket.id,
      userId,
      transport: socket.conn.transport.name
    });

    // Initialize rate limiting for this socket
    socketRateLimiter.applyToSocket(socket, userId);

    // Join user-specific room for direct messaging
    socket.join(`user:${userId}`);

    // Update user status to online
    await updateUserStatus(pool, userId, true, socket.id);

    // Broadcast online status to user's matches
    await broadcastOnlineStatus(io, pool, userId, true);

    // Setup message event handlers with rate limiting
    setupMessageHandlers(io, socket, pool, socketRateLimiter);

    // Setup After Hours event handlers with rate limiting
    setupAfterHoursHandlers(io, socket, pool, socketRateLimiter);

    // Handle disconnection
    socket.on('disconnect', async (reason) => {
      logger.info('Client disconnected', {
        socketId: socket.id,
        userId,
        reason
      });

      // Update user status to offline
      await updateUserStatus(pool, userId, false, undefined);

      // Broadcast offline status to user's matches
      await broadcastOnlineStatus(io, pool, userId, false);
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error', {
        socketId: socket.id,
        userId,
        error: error.message
      });
    });

    // Ping/pong for connection health monitoring
    socket.on('ping', (callback) => {
      callback?.({ timestamp: Date.now() });
    });
  });

  // Handle server-level errors
  io.engine.on('connection_error', (err) => {
    logger.error('Socket.IO connection error', {
      code: err.code,
      message: err.message,
      context: err.context
    });
  });

  return io;
};

/**
 * Broadcast user's online status to their matches
 */
async function broadcastOnlineStatus(
  io: SocketServer,
  pool: Pool,
  userId: string,
  isOnline: boolean
) {
  try {
    // Get all matches for this user
    const result = await pool.query(
      `SELECT
        CASE
          WHEN user_id_1 = $1 THEN user_id_2
          ELSE user_id_1
        END as match_user_id
       FROM matches
       WHERE user_id_1 = $1 OR user_id_2 = $1`,
      [userId]
    );

    const matchUserIds = result.rows.map(row => row.match_user_id);

    // Emit status update to each match
    matchUserIds.forEach(matchUserId => {
      io.to(`user:${matchUserId}`).emit('user_status_changed', {
        userId,
        isOnline,
        timestamp: new Date()
      });
    });

    logger.debug('Broadcasted online status', {
      userId,
      isOnline,
      recipientCount: matchUserIds.length
    });
  } catch (error) {
    logger.error('Error broadcasting online status', {
      error: error instanceof Error ? error.message : 'Unknown error',
      userId,
      isOnline
    });
  }
}

/**
 * Send push notification for new message (if user is offline)
 * Note: This function is deprecated and kept for backward compatibility.
 * The actual FCM notification is now sent directly from message-handler.ts
 * using the fcm-service module.
 */
export async function sendMessageNotification(
  pool: Pool,
  recipientId: string,
  senderId: string,
  matchId: string,
  messageText: string
) {
  logger.warn('Deprecated sendMessageNotification called - use fcm-service directly', {
    recipientId,
    senderId,
    matchId
  });
  // This function is kept for compatibility but doesn't do anything
  // FCM notifications are now handled in message-handler.ts
}

export type { SocketServer };
