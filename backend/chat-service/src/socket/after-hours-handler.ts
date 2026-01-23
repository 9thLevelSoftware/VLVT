/**
 * After Hours Socket.IO Event Handlers
 *
 * Bridges Redis pub/sub events from profile-service to Socket.IO clients.
 * - Subscribes to 'after_hours:events' Redis channel
 * - Delivers match events to connected users via Socket.IO
 * - Handles After Hours chat room join/leave events
 *
 * Event flow:
 * profile-service -> Redis pub/sub -> after-hours-handler -> Socket.IO -> client
 */

import { Server as SocketServer } from 'socket.io';
import { Pool } from 'pg';
import IORedis from 'ioredis';
import logger from '../utils/logger';
import { SocketWithAuth } from './auth-middleware';
import { SocketRateLimiter } from '@vlvt/shared';

// ============================================
// TYPES
// ============================================

/**
 * Redis event message format (published by profile-service)
 */
interface RedisEventMessage {
  type: string;           // Event type (e.g., 'after_hours:match')
  targetUserId: string;   // User to receive the event
  payload: Record<string, any>;
  timestamp: string;      // ISO timestamp
}

/**
 * Join chat room request data
 */
interface JoinChatData {
  matchId: string;
}

/**
 * Leave chat room request data
 */
interface LeaveChatData {
  matchId: string;
}

/**
 * Send message request data
 */
interface AfterHoursSendMessageData {
  matchId: string;
  text: string;
  tempId?: string;
}

/**
 * Typing indicator request data
 */
interface AfterHoursTypingData {
  matchId: string;
  isTyping: boolean;
}

/**
 * Mark read request data
 */
interface AfterHoursMarkReadData {
  matchId: string;
  messageIds?: string[];
}

/**
 * Message response format
 */
interface AfterHoursMessageResponse {
  id: string;
  matchId: string;
  senderId: string;
  text: string;
  timestamp: Date;
  tempId?: string;
}

// ============================================
// CONSTANTS
// ============================================

const REDIS_EVENTS_CHANNEL = 'after_hours:events';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Event types relayed from Redis to Socket.IO
const RELAY_EVENT_TYPES = [
  'after_hours:match',
  'after_hours:no_matches',
  'after_hours:match_expired',
];

// ============================================
// MODULE STATE
// ============================================

let redisSubscriber: IORedis | null = null;

// ============================================
// REDIS SUBSCRIBER
// ============================================

/**
 * Initialize Redis pub/sub subscriber for After Hours events.
 * Subscribes to 'after_hours:events' channel and relays messages to Socket.IO.
 *
 * Non-blocking: If Redis connection fails, logs warning and continues.
 * Server can still function; matching events won't be delivered in real-time.
 *
 * @param io - Socket.IO server instance
 */
export async function initializeAfterHoursRedisSubscriber(io: SocketServer): Promise<void> {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

  try {
    // Create Redis connection for subscribing
    const subscriber = new IORedis(redisUrl, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });

    // Wait for connection with timeout
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        subscriber.disconnect();
        reject(new Error('Redis subscriber connection timeout after 10 seconds'));
      }, 10000);

      subscriber.once('ready', () => {
        clearTimeout(timeout);
        logger.info('Redis subscriber connected for After Hours events', {
          url: redisUrl.replace(/:[^:@]+@/, ':***@'),
        });
        resolve();
      });

      subscriber.once('error', (err: Error) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    // Store reference after successful connection
    redisSubscriber = subscriber;

    // Subscribe to After Hours events channel
    await subscriber.subscribe(REDIS_EVENTS_CHANNEL);
    logger.info('Subscribed to After Hours events channel', { channel: REDIS_EVENTS_CHANNEL });

    // Handle incoming messages
    subscriber.on('message', (channel: string, message: string) => {
      if (channel !== REDIS_EVENTS_CHANNEL) {
        return;
      }

      try {
        const event: RedisEventMessage = JSON.parse(message);

        // Validate event structure
        if (!event.type || !event.targetUserId || !event.payload) {
          logger.warn('Invalid After Hours event structure', { event });
          return;
        }

        // Only relay known event types
        if (!RELAY_EVENT_TYPES.includes(event.type)) {
          logger.debug('Unknown After Hours event type, ignoring', { type: event.type });
          return;
        }

        // Emit to user's room via Socket.IO
        io.to(`user:${event.targetUserId}`).emit(event.type, event.payload);

        logger.debug('Relayed After Hours event to Socket.IO', {
          type: event.type,
          targetUserId: event.targetUserId,
        });
      } catch (error) {
        logger.error('Failed to parse After Hours Redis event', {
          error: error instanceof Error ? error.message : 'Unknown error',
          rawMessage: message.substring(0, 200),
        });
      }
    });

    // Handle connection errors (non-fatal, just log)
    subscriber.on('error', (err: Error) => {
      logger.error('Redis subscriber error', { error: err.message });
    });

    // Handle reconnection
    subscriber.on('reconnecting', () => {
      logger.info('Redis subscriber reconnecting...');
    });

  } catch (error) {
    logger.warn('Failed to initialize After Hours Redis subscriber', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    // Non-blocking: server continues without real-time matching events
    // Events can still be fetched via REST API (GET /match/current)
  }
}

// ============================================
// SOCKET.IO EVENT HANDLERS
// ============================================

/**
 * Setup After Hours Socket.IO event handlers for a connection.
 * Handles chat room join/leave for After Hours matches.
 *
 * @param io - Socket.IO server instance
 * @param socket - Authenticated socket connection
 * @param pool - PostgreSQL connection pool
 * @param rateLimiter - Socket rate limiter
 */
export function setupAfterHoursHandlers(
  io: SocketServer,
  socket: SocketWithAuth,
  pool: Pool,
  rateLimiter?: SocketRateLimiter
): void {
  const userId = socket.userId!;

  logger.info('Setting up After Hours handlers', { socketId: socket.id, userId });

  /**
   * Handle joining an After Hours match chat room.
   * Validates user is part of the match before allowing join.
   */
  const handleJoinChat = async (data: JoinChatData, callback?: Function): Promise<void> => {
    try {
      const { matchId } = data;

      // Validate matchId format (UUID)
      if (!matchId || !UUID_REGEX.test(matchId)) {
        logger.warn('Invalid matchId format for after_hours:join_chat', {
          userId,
          matchId,
        });
        return callback?.({ success: false, error: 'Invalid match ID format' });
      }

      // Verify user is part of this match
      const matchCheck = await pool.query(
        `SELECT user_id_1, user_id_2
         FROM after_hours_matches
         WHERE id = $1 AND (user_id_1 = $2 OR user_id_2 = $2)`,
        [matchId, userId]
      );

      if (matchCheck.rows.length === 0) {
        logger.warn('Socket authorization failure for After Hours join', {
          event: 'after_hours:join_chat',
          userId,
          matchId,
          reason: 'User not part of match',
          ip: socket.handshake.address,
        });
        return callback?.({ success: false, error: 'Unauthorized' });
      }

      // Join the match room
      const roomName = `after_hours:match:${matchId}`;
      socket.join(roomName);

      logger.info('User joined After Hours chat room', {
        userId,
        matchId,
        roomName,
      });

      callback?.({ success: true, matchId });
    } catch (error) {
      logger.error('Error joining After Hours chat room', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        matchId: data.matchId,
      });
      callback?.({ success: false, error: 'Failed to join chat room' });
    }
  };

  /**
   * Handle leaving an After Hours match chat room.
   */
  const handleLeaveChat = async (data: LeaveChatData, callback?: Function): Promise<void> => {
    try {
      const { matchId } = data;

      // Validate matchId format (UUID)
      if (!matchId || !UUID_REGEX.test(matchId)) {
        logger.warn('Invalid matchId format for after_hours:leave_chat', {
          userId,
          matchId,
        });
        return callback?.({ success: false, error: 'Invalid match ID format' });
      }

      // Leave the match room (no DB check needed - just leave if in room)
      const roomName = `after_hours:match:${matchId}`;
      socket.leave(roomName);

      logger.info('User left After Hours chat room', {
        userId,
        matchId,
        roomName,
      });

      callback?.({ success: true, matchId });
    } catch (error) {
      logger.error('Error leaving After Hours chat room', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        matchId: data.matchId,
      });
      callback?.({ success: false, error: 'Failed to leave chat room' });
    }
  };

  // Register event handlers
  // Note: Rate limiting for After Hours events is configured in socket/index.ts
  // Currently only join/leave are registered; send_message/typing/mark_read
  // will be added in subsequent plans when After Hours messaging is implemented
  socket.on('after_hours:join_chat', handleJoinChat);
  socket.on('after_hours:leave_chat', handleLeaveChat);

  logger.debug('After Hours handlers registered', { socketId: socket.id, userId });
}

// ============================================
// CLEANUP
// ============================================

/**
 * Close Redis subscriber connection (call on shutdown)
 */
export async function closeAfterHoursRedisSubscriber(): Promise<void> {
  if (redisSubscriber) {
    await redisSubscriber.unsubscribe(REDIS_EVENTS_CHANNEL);
    redisSubscriber.disconnect();
    redisSubscriber = null;
    logger.info('After Hours Redis subscriber closed');
  }
}

