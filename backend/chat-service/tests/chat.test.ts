import jwt from 'jsonwebtoken';

// Mock dependencies before importing the app
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

import request from 'supertest';
import { Pool } from 'pg';

const JWT_SECRET = process.env.JWT_SECRET!;

describe('Chat Service', () => {
  let app: any;
  let mockPool: any;
  let validToken: string;
  let user2Token: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create valid JWT tokens
    validToken = jwt.sign(
      { userId: 'user_1', provider: 'google', email: 'user1@example.com' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    user2Token = jwt.sign(
      { userId: 'user_2', provider: 'google', email: 'user2@example.com' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Get mocked pool instance
    mockPool = new Pool();

    // Mock pool.query to return successful results by default
    mockPool.query.mockResolvedValue({
      rows: [{
        id: 'match_123',
        user_id_1: 'user_1',
        user_id_2: 'user_2',
        created_at: new Date(),
      }],
    });

    // Re-import app to get fresh instance with mocks
    jest.resetModules();
    delete require.cache[require.resolve('../src/index')];
  });

  describe('Health Check', () => {
    it('should return health status', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toEqual({
        status: 'ok',
        service: 'chat-service',
      });
    });
  });

  describe('GET /matches/:userId', () => {
    it('should retrieve own matches', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .get('/matches/user_1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.matches).toBeInstanceOf(Array);
    });

    it('should return 403 when accessing other user matches', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .get('/matches/user_2')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Forbidden');
    });

    it('should return 401 without authentication', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      await request(app)
        .get('/matches/user_1')
        .expect(401);
    });
  });

  describe('POST /matches', () => {
    it('should create match between two users', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock users exist, then no existing match, then create new match
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'user_1' }] }) // User 1 exists
        .mockResolvedValueOnce({ rows: [{ id: 'user_2' }] }) // User 2 exists
        .mockResolvedValueOnce({ rows: [] }) // Check for existing match
        .mockResolvedValueOnce({ // Create new match
          rows: [{
            id: 'match_123',
            user_id_1: 'user_1',
            user_id_2: 'user_2',
            created_at: new Date(),
          }],
        });

      const response = await request(app)
        .post('/matches')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ userId1: 'user_1', userId2: 'user_2' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.match).toHaveProperty('id');
      expect(response.body.match).toHaveProperty('userId1');
      expect(response.body.match).toHaveProperty('userId2');
    });

    it('should return 403 when creating match not involving self', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/matches')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ userId1: 'user_2', userId2: 'user_3' })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Forbidden');
    });

    it('should return existing match if already exists', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock users exist, then existing match found
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'user_1' }] }) // User 1 exists
        .mockResolvedValueOnce({ rows: [{ id: 'user_2' }] }) // User 2 exists
        .mockResolvedValueOnce({
          rows: [{
            id: 'match_existing',
            user_id_1: 'user_1',
            user_id_2: 'user_2',
            created_at: new Date(),
          }],
        });

      const response = await request(app)
        .post('/matches')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ userId1: 'user_1', userId2: 'user_2' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.alreadyExists).toBe(true);
    });

    it('should return 404 when a user does not exist', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // User 1 missing
        .mockResolvedValueOnce({ rows: [{ id: 'user_2' }] }); // User 2 exists

      const response = await request(app)
        .post('/matches')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ userId1: 'user_1', userId2: 'user_2' })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('User not found');
    });

    it('should validate required fields', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/matches')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ userId1: 'user_1' }) // Missing userId2
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /messages/:matchId', () => {
    it('should retrieve messages for own match', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock match verification
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify user is in match
        .mockResolvedValueOnce({ // Get messages
          rows: [
            {
              id: 'msg_1',
              match_id: 'match_123',
              sender_id: 'user_1',
              text: 'Hello',
              created_at: new Date(),
            },
          ],
        });

      const response = await request(app)
        .get('/messages/match_123')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messages).toBeInstanceOf(Array);
      // Verify pagination structure is present
      expect(response.body).toHaveProperty('pagination');
    });

    it('should return 403 when accessing messages for match not part of', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock no match found for this user
      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .get('/messages/match_456')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Forbidden');
    });
  });

  describe('POST /messages', () => {
    it('should send message in own match', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock match verification and message creation
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ // Create message
          rows: [{
            id: 'msg_1',
            match_id: 'match_123',
            sender_id: 'user_1',
            text: 'Hello',
            created_at: new Date(),
          }],
        });

      const response = await request(app)
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          matchId: 'match_123',
          senderId: 'user_1',
          text: 'Hello',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toHaveProperty('text', 'Hello');
    });

    it('should return 403 when senderId does not match authenticated user', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          matchId: 'match_123',
          senderId: 'user_2', // Different from token
          text: 'Hacker message',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Forbidden');
    });

    it('should validate required fields', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ matchId: 'match_123', senderId: 'user_1' }) // Missing text
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should validate text is not empty', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          matchId: 'match_123',
          senderId: 'user_1',
          text: '',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should reject messages when sender is blocked by recipient', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock sequence:
      // 1. Match check with user details
      // 2. Block check - block exists (recipient blocked sender)
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123', user_id_1: 'user_1', user_id_2: 'user_2' }] }) // Match check
        .mockResolvedValueOnce({ rows: [{ id: 'block_1' }] }); // Block exists

      const response = await request(app)
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          matchId: 'match_123',
          senderId: 'user_1',
          text: 'Hello!',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('blocked');
    });

    it('should reject messages when recipient is blocked by sender', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Block check should be bidirectional - even if sender blocked recipient,
      // messaging should be prevented
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123', user_id_1: 'user_1', user_id_2: 'user_2' }] }) // Match check
        .mockResolvedValueOnce({ rows: [{ id: 'block_2' }] }); // Block exists (bidirectional check)

      const response = await request(app)
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          matchId: 'match_123',
          senderId: 'user_1',
          text: 'Hello!',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('blocked');
    });

    it('should allow messages when no block exists', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock sequence - no block exists, profile complete, insert succeeds
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123', user_id_1: 'user_1', user_id_2: 'user_2' }] }) // Match check
        .mockResolvedValueOnce({ rows: [] }) // Block check - no blocks
        .mockResolvedValueOnce({ // Profile check - complete profile
          rows: [{
            name: 'Test User',
            age: 25,
            bio: 'Test bio',
            photos: ['photo1.jpg'],
            id_verified: true,
          }],
        })
        .mockResolvedValueOnce({ // Insert message
          rows: [{
            id: 'msg_1',
            match_id: 'match_123',
            sender_id: 'user_1',
            text: 'Hello!',
            created_at: new Date(),
          }],
        });

      const response = await request(app)
        .post('/messages')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          matchId: 'match_123',
          senderId: 'user_1',
          text: 'Hello!',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toHaveProperty('text', 'Hello!');
    });
  });

  describe('DELETE /matches/:matchId', () => {
    it('should delete own match', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock match verification and deletion
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Delete match
        .mockResolvedValueOnce({ rows: [] }); // Delete messages

      const response = await request(app)
        .delete('/matches/match_123')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 403 when deleting match not part of', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .delete('/matches/match_456')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /blocks', () => {
    it('should block a user', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Mock no existing block, then create block, then delete matches
      mockPool.query
        .mockResolvedValueOnce({ rows: [] }) // Check existing block
        .mockResolvedValueOnce({ rows: [] }) // Create block
        .mockResolvedValueOnce({ rows: [] }); // Delete matches

      const response = await request(app)
        .post('/blocks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          userId: 'user_1',
          blockedUserId: 'user_2',
          reason: 'Inappropriate behavior',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 403 when userId does not match authenticated user', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/blocks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          userId: 'user_2',
          blockedUserId: 'user_3',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 when trying to block self', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/blocks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          userId: 'user_1',
          blockedUserId: 'user_1',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot block yourself');
    });

    it('should validate required fields', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/blocks')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ userId: 'user_1' }) // Missing blockedUserId
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /reports', () => {
    it('should submit a report', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      mockPool.query.mockResolvedValue({ rows: [] });

      const response = await request(app)
        .post('/reports')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          reporterId: 'user_1',
          reportedUserId: 'user_2',
          reason: 'inappropriate_content',
          details: 'Sent offensive messages',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Report submitted');
    });

    it('should return 403 when reporterId does not match authenticated user', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/reports')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          reporterId: 'user_2',
          reportedUserId: 'user_3',
          reason: 'spam',
        })
        .expect(403);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 when trying to report self', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/reports')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          reporterId: 'user_1',
          reportedUserId: 'user_1',
          reason: 'spam',
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Cannot report yourself');
    });

    it('should validate required fields', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/reports')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          reporterId: 'user_1',
          reportedUserId: 'user_2',
        }) // Missing reason
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Message Pagination', () => {
    it('should limit results to specified page size', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Generate 25 messages
      const messages = Array.from({ length: 25 }, (_, i) => ({
        id: `msg_${i}`,
        match_id: 'match_123',
        sender_id: i % 2 === 0 ? 'user_1' : 'user_2',
        text: `Message ${i}`,
        created_at: new Date(Date.now() - (25 - i) * 1000), // Oldest first
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ rows: messages.slice(0, 21) }); // Return 21 messages (limit + 1)

      const response = await request(app)
        .get('/messages/match_123?limit=20')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messages.length).toBeLessThanOrEqual(20);
      expect(response.body).toHaveProperty('pagination');
    });

    it('should support cursor-based pagination with before param', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const beforeDate = '2024-01-15T12:00:00Z';
      const messages = Array.from({ length: 10 }, (_, i) => ({
        id: `msg_${i}`,
        match_id: 'match_123',
        sender_id: 'user_1',
        text: `Message ${i}`,
        created_at: new Date('2024-01-10T12:00:00Z'),
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ rows: messages });

      const response = await request(app)
        .get(`/messages/match_123?limit=20&before=${beforeDate}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messages.length).toBeLessThanOrEqual(20);
    });

    it('should return hasMore indicator', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Return 11 messages when asking for 10 (to indicate hasMore)
      const messages = Array.from({ length: 11 }, (_, i) => ({
        id: `msg_${i}`,
        match_id: 'match_123',
        sender_id: 'user_1',
        text: `Message ${i}`,
        created_at: new Date(Date.now() - (11 - i) * 1000),
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ rows: messages });

      const response = await request(app)
        .get('/messages/match_123?limit=10')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toHaveProperty('hasMore');
      expect(response.body.pagination.hasMore).toBe(true);
    });

    it('should default limit to 50 when not specified', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Return 30 messages (less than default limit)
      const messages = Array.from({ length: 30 }, (_, i) => ({
        id: `msg_${i}`,
        match_id: 'match_123',
        sender_id: 'user_1',
        text: `Message ${i}`,
        created_at: new Date(Date.now() - (30 - i) * 1000),
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ rows: messages });

      const response = await request(app)
        .get('/messages/match_123')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messages.length).toBeLessThanOrEqual(50);
      expect(response.body.pagination.limit).toBe(50);
    });

    it('should cap limit at 100 maximum', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      // Return 101 messages
      const messages = Array.from({ length: 101 }, (_, i) => ({
        id: `msg_${i}`,
        match_id: 'match_123',
        sender_id: 'user_1',
        text: `Message ${i}`,
        created_at: new Date(Date.now() - (101 - i) * 1000),
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ rows: messages });

      const response = await request(app)
        .get('/messages/match_123?limit=500')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messages.length).toBeLessThanOrEqual(100);
      expect(response.body.pagination.limit).toBe(100);
    });

    it('should return pagination timestamps', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const oldestTime = new Date('2024-01-01T10:00:00Z');
      const newestTime = new Date('2024-01-01T12:00:00Z');

      const messages = [
        {
          id: 'msg_1',
          match_id: 'match_123',
          sender_id: 'user_1',
          text: 'First message',
          created_at: oldestTime,
        },
        {
          id: 'msg_2',
          match_id: 'match_123',
          sender_id: 'user_2',
          text: 'Second message',
          created_at: newestTime,
        },
      ];

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ rows: messages.slice().reverse() }); // DB returns DESC

      const response = await request(app)
        .get('/messages/match_123?limit=10')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.pagination).toHaveProperty('oldestTimestamp');
      expect(response.body.pagination).toHaveProperty('newestTimestamp');
    });

    it('should support after param for newer messages', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const afterDate = '2024-01-01T00:00:00Z';
      const messages = Array.from({ length: 5 }, (_, i) => ({
        id: `msg_${i}`,
        match_id: 'match_123',
        sender_id: 'user_1',
        text: `Message ${i}`,
        created_at: new Date('2024-01-02T12:00:00Z'),
      }));

      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: 'match_123' }] }) // Verify match
        .mockResolvedValueOnce({ rows: messages });

      const response = await request(app)
        .get(`/messages/match_123?limit=20&after=${afterDate}`)
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.messages.length).toBeLessThanOrEqual(20);
    });
  });

  describe('GET /blocks/:userId', () => {
    it('should retrieve own blocked users', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      mockPool.query.mockResolvedValue({
        rows: [{
          id: 'block_1',
          user_id: 'user_1',
          blocked_user_id: 'user_2',
          reason: 'spam',
          created_at: new Date(),
        }],
      });

      const response = await request(app)
        .get('/blocks/user_1')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.blockedUsers).toBeInstanceOf(Array);
    });

    it('should return 403 when accessing other user blocks', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .get('/blocks/user_2')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(403);

      expect(response.body.success).toBe(false);
    });
  });
});
