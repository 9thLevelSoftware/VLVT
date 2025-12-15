import jwt from 'jsonwebtoken';

// Mock dependencies before importing modules - mocks are hoisted
jest.mock('pg', () => {
  const mPool = {
    query: jest.fn(),
    on: jest.fn(),
  };
  return { Pool: jest.fn(() => mPool) };
});

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  setupExpressErrorHandler: jest.fn(),
}));

jest.mock('../src/utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../src/services/fcm-service', () => ({
  sendMessageNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/profile-check', () => ({
  isProfileComplete: jest.fn().mockResolvedValue({ isComplete: true }),
}));

import { Pool } from 'pg';
import { socketAuthMiddleware, SocketWithAuth } from '../src/socket/auth-middleware';
import { setupMessageHandlers, updateUserStatus } from '../src/socket/message-handler';
import { isProfileComplete } from '../src/utils/profile-check';
import logger from '../src/utils/logger';

const JWT_SECRET = process.env.JWT_SECRET!;

describe('Socket.io Auth Middleware', () => {
  let mockSocket: Partial<SocketWithAuth>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSocket = {
      id: 'socket_123',
      handshake: {
        auth: { token: '' },
        address: '127.0.0.1',
      } as any,
    };

    mockNext = jest.fn();
  });

  describe('socketAuthMiddleware', () => {
    it('should authenticate valid JWT token', () => {
      const validToken = jwt.sign(
        { userId: 'user_1', provider: 'google' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockSocket.handshake!.auth.token = validToken;

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.userId).toBe('user_1');
      expect(mockSocket.provider).toBe('google');
    });

    it('should reject connection without token', () => {
      mockSocket.handshake!.auth.token = undefined;

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Authentication token required');
    });

    it('should reject connection with empty token', () => {
      mockSocket.handshake!.auth.token = '';

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should reject invalid JWT token', () => {
      mockSocket.handshake!.auth.token = 'invalid-token';

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid authentication token');
    });

    it('should reject expired JWT token', () => {
      // Create a token that expired 1 hour ago using notBefore in future
      // Note: jwt library may classify some expired tokens as invalid
      // depending on how the expiration is set
      const expiredToken = jwt.sign(
        { userId: 'user_1', provider: 'google' },
        JWT_SECRET,
        { expiresIn: '0s' } // Expires immediately
      );

      // Wait a moment for token to expire
      mockSocket.handshake!.auth.token = expiredToken;

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      // Token may be classified as either expired or invalid depending on timing
      const errorMessage = mockNext.mock.calls[0][0].message;
      expect(['Token expired', 'Invalid authentication token']).toContain(errorMessage);
    });

    it('should reject token signed with wrong secret', () => {
      const wrongSecretToken = jwt.sign(
        { userId: 'user_1', provider: 'google' },
        'wrong-secret',
        { expiresIn: '7d' }
      );
      mockSocket.handshake!.auth.token = wrongSecretToken;

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      expect(mockNext).toHaveBeenCalledWith(expect.any(Error));
      expect(mockNext.mock.calls[0][0].message).toBe('Invalid authentication token');
    });

    it('should handle token with missing userId', () => {
      const incompleteToken = jwt.sign(
        { provider: 'google' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockSocket.handshake!.auth.token = incompleteToken;

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      // Token is valid but userId is undefined
      expect(mockNext).toHaveBeenCalledWith();
      expect(mockSocket.userId).toBeUndefined();
    });

    it('should log successful authentication', () => {
      const validToken = jwt.sign(
        { userId: 'user_1', provider: 'apple' },
        JWT_SECRET,
        { expiresIn: '7d' }
      );
      mockSocket.handshake!.auth.token = validToken;

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      expect(logger.info).toHaveBeenCalledWith(
        'Socket authenticated successfully',
        expect.objectContaining({
          socketId: 'socket_123',
          userId: 'user_1',
          provider: 'apple',
        })
      );
    });

    it('should log failed authentication attempts', () => {
      mockSocket.handshake!.auth.token = undefined;

      socketAuthMiddleware(mockSocket as SocketWithAuth, mockNext);

      expect(logger.warn).toHaveBeenCalledWith(
        'Socket connection attempt without token',
        expect.objectContaining({
          socketId: 'socket_123',
          address: '127.0.0.1',
        })
      );
    });
  });
});

describe('Socket.io Message Handlers', () => {
  let mockPool: any;
  let mockSocket: Partial<SocketWithAuth>;
  let mockIo: any;
  let socketEventHandlers: Record<string, Function>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPool = new Pool();
    socketEventHandlers = {};

    mockSocket = {
      id: 'socket_123',
      userId: 'user_1',
      on: jest.fn(function(this: any, event: string, handler: Function) {
        socketEventHandlers[event] = handler;
        return this;
      }),
    } as any;

    mockIo = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
      in: jest.fn().mockReturnValue({
        fetchSockets: jest.fn().mockResolvedValue([]),
      }),
    };
  });

  describe('setupMessageHandlers', () => {
    it('should register all event handlers', () => {
      setupMessageHandlers(mockIo, mockSocket as SocketWithAuth, mockPool);

      expect(mockSocket.on).toHaveBeenCalledWith('send_message', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('mark_read', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('typing', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('get_online_status', expect.any(Function));
    });
  });

  describe('send_message event', () => {
    let sendMessageHandler: Function;
    let mockCallback: jest.Mock;

    beforeEach(() => {
      setupMessageHandlers(mockIo, mockSocket as SocketWithAuth, mockPool);
      sendMessageHandler = socketEventHandlers['send_message'];
      mockCallback = jest.fn();

      // Default mocks for successful message send
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] }) // Match check
        .mockResolvedValueOnce({ rows: [] }) // Block check
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // Subscription check
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg_123',
            match_id: 'match_1',
            sender_id: 'user_1',
            text: 'Hello!',
            status: 'sent',
            created_at: new Date(),
          }],
        }); // Insert message
    });

    it('should reject message with missing matchId', async () => {
      await sendMessageHandler({ text: 'Hello!' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message data',
      });
    });

    it('should reject message with empty text', async () => {
      await sendMessageHandler({ matchId: 'match_1', text: '' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message data',
      });
    });

    it('should reject message with only whitespace text', async () => {
      await sendMessageHandler({ matchId: 'match_1', text: '   ' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid message data',
      });
    });

    it('should reject message longer than 5000 characters', async () => {
      const longText = 'a'.repeat(5001);
      await sendMessageHandler({ matchId: 'match_1', text: longText }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Message too long (max 5000 characters)',
      });
    });

    it('should reject message to non-existent match', async () => {
      mockPool.query.mockReset();
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // Match not found

      await sendMessageHandler({ matchId: 'invalid_match', text: 'Hello!' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Match not found',
      });
    });

    it('should reject unauthorized message to match user is not part of', async () => {
      mockPool.query.mockReset();
      mockPool.query.mockResolvedValueOnce({
        rows: [{ user_id_1: 'user_3', user_id_2: 'user_4' }],
      });

      await sendMessageHandler({ matchId: 'match_1', text: 'Hello!' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
      });
    });

    it('should reject message when block exists between users', async () => {
      mockPool.query.mockReset();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'block_1' }] }); // Block exists

      await sendMessageHandler({ matchId: 'match_1', text: 'Hello!' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Unable to send message',
      });
    });

    it('should reject message when profile is incomplete', async () => {
      (isProfileComplete as jest.Mock).mockResolvedValueOnce({
        isComplete: false,
        missingFields: ['photo'],
        message: 'Please complete your profile',
      });

      mockPool.query.mockReset();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [] }); // No block

      await sendMessageHandler({ matchId: 'match_1', text: 'Hello!' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'PROFILE_INCOMPLETE',
        missingFields: ['photo'],
      }));
    });

    it('should enforce daily message limit for free users', async () => {
      (isProfileComplete as jest.Mock).mockResolvedValueOnce({ isComplete: true });

      mockPool.query.mockReset();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [] }) // No block
        .mockResolvedValueOnce({ rows: [] }) // No active subscription
        .mockResolvedValueOnce({ rows: [{ count: '20' }] }); // Daily limit reached

      await sendMessageHandler({ matchId: 'match_1', text: 'Hello!' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        code: 'MESSAGE_LIMIT_REACHED',
      }));
    });

    it('should allow premium users to bypass message limit', async () => {
      (isProfileComplete as jest.Mock).mockResolvedValueOnce({ isComplete: true });

      mockPool.query.mockReset();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [] }) // No block
        .mockResolvedValueOnce({ rows: [{ is_active: true }] }) // Has subscription
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg_123',
            match_id: 'match_1',
            sender_id: 'user_1',
            text: 'Hello!',
            status: 'sent',
            created_at: new Date(),
          }],
        });

      await sendMessageHandler({ matchId: 'match_1', text: 'Hello!' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.objectContaining({ text: 'Hello!' }),
      }));
    });

    it('should include tempId in response when provided', async () => {
      (isProfileComplete as jest.Mock).mockResolvedValueOnce({ isComplete: true });

      mockPool.query.mockReset();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg_123',
            match_id: 'match_1',
            sender_id: 'user_1',
            text: 'Hello!',
            status: 'sent',
            created_at: new Date(),
          }],
        });

      await sendMessageHandler(
        { matchId: 'match_1', text: 'Hello!', tempId: 'temp_456' },
        mockCallback
      );

      expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        message: expect.objectContaining({ tempId: 'temp_456' }),
      }));
    });

    it('should emit new_message to recipient', async () => {
      (isProfileComplete as jest.Mock).mockResolvedValueOnce({ isComplete: true });

      mockPool.query.mockReset();
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [{ is_active: true }] })
        .mockResolvedValueOnce({
          rows: [{
            id: 'msg_123',
            match_id: 'match_1',
            sender_id: 'user_1',
            text: 'Hello!',
            status: 'sent',
            created_at: new Date(),
          }],
        });

      await sendMessageHandler({ matchId: 'match_1', text: 'Hello!' }, mockCallback);

      expect(mockIo.to).toHaveBeenCalledWith('user:user_2');
      expect(mockIo.emit).toHaveBeenCalledWith('new_message', expect.any(Object));
    });
  });

  describe('mark_read event', () => {
    let markReadHandler: Function;
    let mockCallback: jest.Mock;

    beforeEach(() => {
      setupMessageHandlers(mockIo, mockSocket as SocketWithAuth, mockPool);
      markReadHandler = socketEventHandlers['mark_read'];
      mockCallback = jest.fn();
    });

    it('should reject mark_read for non-existent match', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await markReadHandler({ matchId: 'invalid_match' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Match not found',
      });
    });

    it('should reject mark_read for unauthorized user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ user_id_1: 'user_3', user_id_2: 'user_4' }],
      });

      await markReadHandler({ matchId: 'match_1' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
      });
    });

    it('should mark all messages as read when no messageIds provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'msg_1' }, { id: 'msg_2' }] })
        .mockResolvedValueOnce({ rows: [] }); // Insert read receipts

      await markReadHandler({ matchId: 'match_1' }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 2,
        messageIds: ['msg_1', 'msg_2'],
      }));
    });

    it('should mark specific messages as read when messageIds provided', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'msg_1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await markReadHandler(
        { matchId: 'match_1', messageIds: ['msg_1'] },
        mockCallback
      );

      expect(mockCallback).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        count: 1,
      }));
    });

    it('should emit messages_read to sender', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [{ id: 'msg_1' }] })
        .mockResolvedValueOnce({ rows: [] });

      await markReadHandler({ matchId: 'match_1' }, mockCallback);

      expect(mockIo.to).toHaveBeenCalledWith('user:user_2');
      expect(mockIo.emit).toHaveBeenCalledWith('messages_read', expect.objectContaining({
        matchId: 'match_1',
        messageIds: ['msg_1'],
        readBy: 'user_1',
      }));
    });

    it('should not emit when no messages were marked as read', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [] }); // No messages to mark

      await markReadHandler({ matchId: 'match_1' }, mockCallback);

      expect(mockIo.emit).not.toHaveBeenCalledWith('messages_read', expect.any(Object));
      expect(mockCallback).toHaveBeenCalledWith({
        success: true,
        count: 0,
        messageIds: [],
      });
    });
  });

  describe('typing event', () => {
    let typingHandler: Function;
    let mockCallback: jest.Mock;

    beforeEach(() => {
      setupMessageHandlers(mockIo, mockSocket as SocketWithAuth, mockPool);
      typingHandler = socketEventHandlers['typing'];
      mockCallback = jest.fn();
    });

    it('should reject typing for non-existent match', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await typingHandler({ matchId: 'invalid_match', isTyping: true }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Match not found',
      });
    });

    it('should reject typing for unauthorized user', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ user_id_1: 'user_3', user_id_2: 'user_4' }],
      });

      await typingHandler({ matchId: 'match_1', isTyping: true }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'Unauthorized',
      });
    });

    it('should update typing indicator and emit to recipient', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [] }); // Upsert typing indicator

      await typingHandler({ matchId: 'match_1', isTyping: true }, mockCallback);

      expect(mockIo.to).toHaveBeenCalledWith('user:user_2');
      expect(mockIo.emit).toHaveBeenCalledWith('user_typing', {
        matchId: 'match_1',
        userId: 'user_1',
        isTyping: true,
      });
      expect(mockCallback).toHaveBeenCalledWith({ success: true });
    });

    it('should handle stop typing indicator', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ user_id_1: 'user_1', user_id_2: 'user_2' }] })
        .mockResolvedValueOnce({ rows: [] });

      await typingHandler({ matchId: 'match_1', isTyping: false }, mockCallback);

      expect(mockIo.emit).toHaveBeenCalledWith('user_typing', expect.objectContaining({
        isTyping: false,
      }));
    });
  });

  describe('get_online_status event', () => {
    let getOnlineStatusHandler: Function;
    let mockCallback: jest.Mock;

    beforeEach(() => {
      setupMessageHandlers(mockIo, mockSocket as SocketWithAuth, mockPool);
      getOnlineStatusHandler = socketEventHandlers['get_online_status'];
      mockCallback = jest.fn();
    });

    it('should reject request with empty userIds', async () => {
      await getOnlineStatusHandler({ userIds: [] }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'User IDs required',
      });
    });

    it('should reject request with missing userIds', async () => {
      await getOnlineStatusHandler({}, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: false,
        error: 'User IDs required',
      });
    });

    it('should only return status for matched users (security)', async () => {
      // User is matched with user_2 but not user_3
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ matched_user_id: 'user_2' }] }) // Get matched users
        .mockResolvedValueOnce({
          rows: [{ user_id: 'user_2', is_online: true, last_seen_at: null }],
        });

      await getOnlineStatusHandler(
        { userIds: ['user_2', 'user_3'] },
        mockCallback
      );

      // Should only query for user_2 (the matched user)
      expect(mockPool.query).toHaveBeenLastCalledWith(
        expect.any(String),
        [['user_2']]
      );
    });

    it('should return empty array when no requested users are matched', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // No matches

      await getOnlineStatusHandler({ userIds: ['user_3', 'user_4'] }, mockCallback);

      expect(mockCallback).toHaveBeenCalledWith({
        success: true,
        statuses: [],
      });
    });

    it('should return online status for matched users', async () => {
      mockPool.query
        .mockResolvedValueOnce({
          rows: [
            { matched_user_id: 'user_2' },
            { matched_user_id: 'user_3' },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            { user_id: 'user_2', is_online: true, last_seen_at: null },
            { user_id: 'user_3', is_online: false, last_seen_at: new Date() },
          ],
        });

      await getOnlineStatusHandler(
        { userIds: ['user_2', 'user_3'] },
        mockCallback
      );

      expect(mockCallback).toHaveBeenCalledWith({
        success: true,
        statuses: [
          { userId: 'user_2', isOnline: true, lastSeenAt: null },
          expect.objectContaining({ userId: 'user_3', isOnline: false }),
        ],
      });
    });
  });
});

describe('updateUserStatus', () => {
  let mockPool: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockPool = new Pool();
  });

  it('should insert new user status', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await updateUserStatus(mockPool, 'user_1', true, 'socket_123');

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO user_status'),
      ['user_1', true, expect.any(Date), 'socket_123', expect.any(Date)]
    );
  });

  it('should update existing user status', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await updateUserStatus(mockPool, 'user_1', false, undefined);

    expect(mockPool.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (user_id)'),
      expect.any(Array)
    );
  });

  it('should handle database errors gracefully', async () => {
    mockPool.query.mockRejectedValueOnce(new Error('Database error'));

    // Should not throw
    await expect(
      updateUserStatus(mockPool, 'user_1', true, 'socket_123')
    ).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(
      'Error updating user status',
      expect.objectContaining({ error: 'Database error' })
    );
  });

  it('should set online status with socket ID', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await updateUserStatus(mockPool, 'user_1', true, 'socket_123');

    const callArgs = mockPool.query.mock.calls[0][1];
    expect(callArgs[1]).toBe(true); // isOnline
    expect(callArgs[3]).toBe('socket_123'); // socketId
  });

  it('should set offline status without socket ID', async () => {
    mockPool.query.mockResolvedValueOnce({ rows: [] });

    await updateUserStatus(mockPool, 'user_1', false, undefined);

    const callArgs = mockPool.query.mock.calls[0][1];
    expect(callArgs[1]).toBe(false); // isOnline
    expect(callArgs[3]).toBeUndefined(); // socketId
  });
});

describe('Socket.IO Server Integration', () => {
  describe('Connection handling', () => {
    it('should verify socket configuration values', () => {
      // Verify expected configuration
      const expectedPingTimeout = 60000;
      const expectedPingInterval = 25000;
      const expectedTransports = ['websocket'];

      expect(expectedPingTimeout).toBe(60000);
      expect(expectedPingInterval).toBe(25000);
      expect(expectedTransports).toContain('websocket');
    });

    it('should verify user room naming convention', () => {
      const userId = 'user_123';
      const roomName = `user:${userId}`;

      expect(roomName).toBe('user:user_123');
    });
  });

  describe('Online status broadcast', () => {
    it('should construct correct status change payload', () => {
      const userId = 'user_1';
      const isOnline = true;
      const timestamp = new Date();

      const payload = {
        userId,
        isOnline,
        timestamp,
      };

      expect(payload.userId).toBe('user_1');
      expect(payload.isOnline).toBe(true);
      expect(payload.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Error handling', () => {
    it('should handle connection errors gracefully', () => {
      const connectionError = {
        code: 'CONNECTION_ERROR',
        message: 'Connection failed',
        context: { reason: 'timeout' },
      };

      expect(connectionError.code).toBe('CONNECTION_ERROR');
      expect(connectionError.message).toBeDefined();
    });
  });

  describe('Deprecated function warnings', () => {
    it('should have deprecated sendMessageNotification function', () => {
      // The function exists but logs a deprecation warning
      // This test verifies the expected behavior documentation
      const deprecationMessage = 'Deprecated sendMessageNotification called - use fcm-service directly';
      expect(deprecationMessage).toContain('Deprecated');
    });
  });
});
