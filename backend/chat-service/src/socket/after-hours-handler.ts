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
  'after_hours:session_expiring',
  'after_hours:session_expired',
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

  /**
   * Handle sending a message in After Hours chat.
   * Messages are stored in after_hours_messages table (ephemeral storage).
   * Rate limited: 30 messages per minute
   */
  const handleAfterHoursSendMessage = async (
    data: AfterHoursSendMessageData,
    callback?: Function
  ): Promise<void> => {
    try {
      const { matchId, text, tempId } = data;

      // Validate input: matchId required
      if (!matchId || !UUID_REGEX.test(matchId)) {
        logger.warn('Invalid matchId for after_hours:send_message', { userId, matchId });
        return callback?.({ success: false, error: 'Invalid match ID' });
      }

      // Validate input: text required and non-empty
      if (!text || text.trim().length === 0) {
        logger.warn('Empty message text', { userId, matchId });
        return callback?.({ success: false, error: 'Message text required' });
      }

      // Validate input: max 2000 chars
      if (text.length > 2000) {
        logger.warn('Message too long', { userId, matchId, length: text.length });
        return callback?.({ success: false, error: 'Message too long (max 2000 characters)' });
      }

      // Query after_hours_matches to verify user and check active status
      const matchCheck = await pool.query(
        `SELECT user_id_1, user_id_2, expires_at, declined_by
         FROM after_hours_matches
         WHERE id = $1`,
        [matchId]
      );

      if (matchCheck.rows.length === 0) {
        logger.warn('Match not found for after_hours:send_message', { userId, matchId });
        return callback?.({ success: false, error: 'Match not found' });
      }

      const match = matchCheck.rows[0];

      // Authorization check: user must be part of match
      if (match.user_id_1 !== userId && match.user_id_2 !== userId) {
        logger.warn('Socket authorization failure', {
          event: 'after_hours:send_message',
          userId,
          matchId,
          reason: 'User not part of match',
          ip: socket.handshake.address,
        });
        return callback?.({ success: false, error: 'Unauthorized' });
      }

      // Check match is active: declined_by IS NULL AND expires_at > NOW()
      if (match.declined_by) {
        logger.info('Message blocked - match declined', { userId, matchId, declinedBy: match.declined_by });
        return callback?.({
          success: false,
          error: 'Match has expired',
          code: 'MATCH_EXPIRED',
        });
      }

      if (new Date(match.expires_at) < new Date()) {
        logger.info('Message blocked - match expired', { userId, matchId, expiresAt: match.expires_at });
        return callback?.({
          success: false,
          error: 'Match has expired',
          code: 'MATCH_EXPIRED',
        });
      }

      // Insert message into after_hours_messages (UUID auto-generated)
      const messageResult = await pool.query(
        `INSERT INTO after_hours_messages (match_id, sender_id, text)
         VALUES ($1, $2, $3)
         RETURNING id, match_id, sender_id, text, created_at`,
        [matchId, userId, text.trim()]
      );

      const message = messageResult.rows[0];

      // Calculate recipientId (other user in match)
      const recipientId = match.user_id_1 === userId ? match.user_id_2 : match.user_id_1;

      const messageResponse: AfterHoursMessageResponse = {
        id: message.id,
        matchId: message.match_id,
        senderId: message.sender_id,
        text: message.text,
        timestamp: message.created_at,
        tempId,
      };

      // Acknowledge to sender immediately after insert succeeds
      callback?.({ success: true, message: messageResponse });

      // Emit to recipient via user room
      io.to(`user:${recipientId}`).emit('after_hours:new_message', messageResponse);

      // Also emit to match room for multi-device support
      io.to(`after_hours:match:${matchId}`).emit('after_hours:new_message', messageResponse);

      logger.info('After Hours message sent', {
        messageId: message.id,
        matchId,
        senderId: userId,
        recipientId,
      });
    } catch (error) {
      logger.error('Error sending After Hours message', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        matchId: data.matchId,
      });
      callback?.({ success: false, error: 'Failed to send message' });
    }
  };

  /**
   * Handle typing indicator for After Hours chat.
   * Ephemeral - no database storage (typing is ephemeral within ephemeral chat).
   * Rate limited: 10 per 10 seconds
   */
  const handleAfterHoursTyping = async (
    data: AfterHoursTypingData,
    callback?: Function
  ): Promise<void> => {
    try {
      const { matchId, isTyping } = data;

      // Validate matchId
      if (!matchId || !UUID_REGEX.test(matchId)) {
        logger.warn('Invalid matchId for after_hours:typing', { userId, matchId });
        return callback?.({ success: false, error: 'Invalid match ID' });
      }

      // Verify user is part of match
      const matchCheck = await pool.query(
        `SELECT user_id_1, user_id_2
         FROM after_hours_matches
         WHERE id = $1`,
        [matchId]
      );

      if (matchCheck.rows.length === 0) {
        return callback?.({ success: false, error: 'Match not found' });
      }

      const match = matchCheck.rows[0];

      if (match.user_id_1 !== userId && match.user_id_2 !== userId) {
        logger.warn('Socket authorization failure', {
          event: 'after_hours:typing',
          userId,
          matchId,
          reason: 'User not part of match',
          ip: socket.handshake.address,
        });
        return callback?.({ success: false, error: 'Unauthorized' });
      }

      // Calculate recipientId
      const recipientId = match.user_id_1 === userId ? match.user_id_2 : match.user_id_1;

      // Emit to recipient (no database storage - typing is ephemeral)
      io.to(`user:${recipientId}`).emit('after_hours:user_typing', {
        matchId,
        userId,
        isTyping,
      });

      callback?.({ success: true });
    } catch (error) {
      logger.error('Error handling After Hours typing indicator', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        matchId: data.matchId,
      });
      callback?.({ success: false, error: 'Failed to update typing status' });
    }
  };

  /**
   * Handle marking messages as read in After Hours chat.
   * Ephemeral - emit read receipt without storing (ephemeral messages don't need persistent read state).
   * Rate limited: 60 per minute
   */
  const handleAfterHoursMarkRead = async (
    data: AfterHoursMarkReadData,
    callback?: Function
  ): Promise<void> => {
    try {
      const { matchId, messageIds } = data;

      // Validate matchId
      if (!matchId || !UUID_REGEX.test(matchId)) {
        logger.warn('Invalid matchId for after_hours:mark_read', { userId, matchId });
        return callback?.({ success: false, error: 'Invalid match ID' });
      }

      // Verify user is part of match
      const matchCheck = await pool.query(
        `SELECT user_id_1, user_id_2
         FROM after_hours_matches
         WHERE id = $1`,
        [matchId]
      );

      if (matchCheck.rows.length === 0) {
        logger.warn('Match not found for after_hours:mark_read', { userId, matchId });
        return callback?.({ success: false, error: 'Match not found' });
      }

      const match = matchCheck.rows[0];

      if (match.user_id_1 !== userId && match.user_id_2 !== userId) {
        logger.warn('Socket authorization failure', {
          event: 'after_hours:mark_read',
          userId,
          matchId,
          reason: 'User not part of match',
          ip: socket.handshake.address,
        });
        return callback?.({ success: false, error: 'Unauthorized' });
      }

      // Calculate senderId (other user who sent the messages)
      const senderId = match.user_id_1 === userId ? match.user_id_2 : match.user_id_1;

      const now = new Date();

      // Emit read receipt to sender without storing (ephemeral messages don't need persistent read state)
      io.to(`user:${senderId}`).emit('after_hours:messages_read', {
        matchId,
        messageIds: messageIds || [],
        readBy: userId,
        readAt: now,
      });

      logger.debug('After Hours messages marked as read', {
        matchId,
        readBy: userId,
        messageCount: messageIds?.length || 'all',
      });

      callback?.({ success: true, readAt: now });
    } catch (error) {
      logger.error('Error marking After Hours messages as read', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        matchId: data.matchId,
      });
      callback?.({ success: false, error: 'Failed to mark messages as read' });
    }
  };

  // Register event handlers
  // Room management handlers (no rate limiting needed)
  socket.on('after_hours:join_chat', handleJoinChat);
  socket.on('after_hours:leave_chat', handleLeaveChat);

  // Message handlers with rate limiting
  if (rateLimiter) {
    socket.on(
      'after_hours:send_message',
      rateLimiter.wrapHandler('after_hours:send_message', handleAfterHoursSendMessage)
    );
    socket.on(
      'after_hours:typing',
      rateLimiter.wrapHandler('after_hours:typing', handleAfterHoursTyping)
    );
    socket.on(
      'after_hours:mark_read',
      rateLimiter.wrapHandler('after_hours:mark_read', handleAfterHoursMarkRead)
    );

    logger.debug('After Hours handlers registered with rate limiting', {
      socketId: socket.id,
      userId,
    });
  } else {
    // Fallback without rate limiting (e.g., for tests)
    socket.on('after_hours:send_message', handleAfterHoursSendMessage);
    socket.on('after_hours:typing', handleAfterHoursTyping);
    socket.on('after_hours:mark_read', handleAfterHoursMarkRead);

    logger.debug('After Hours handlers registered without rate limiting', {
      socketId: socket.id,
      userId,
    });
  }
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

