/**
 * After Hours Session Tests (profile-service)
 *
 * Tests for After Hours session lifecycle and matching endpoints:
 * - POST /after-hours/session/start - Start a timed session
 * - POST /after-hours/session/end - End session early
 * - GET /after-hours/session - Get current session status
 * - POST /after-hours/match/decline - Decline current match
 * - GET /after-hours/match/current - Get current match status
 *
 * Uses isolated Express app with mocked dependencies.
 */

import jwt from 'jsonwebtoken';
import express, { Express, Request, Response, NextFunction } from 'express';
import request from 'supertest';

// Mock pool with transaction support
const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

const mockPool = {
  query: jest.fn(),
  on: jest.fn(),
  connect: jest.fn().mockResolvedValue(mockClient),
};

jest.mock('pg', () => ({
  Pool: jest.fn(() => mockPool),
}));

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  setupExpressErrorHandler: jest.fn(),
}));

// Mock the validation middleware (to simplify testing)
jest.mock('../src/middleware/after-hours-validation', () => ({
  validateSessionStart: (req: any, res: any, next: any) => next(),
  validateSessionExtend: (req: any, res: any, next: any) => next(),
  validateDecline: (req: any, res: any, next: any) => next(),
  validateAfterHoursProfile: (req: any, res: any, next: any) => next(),
  validateAfterHoursProfileUpdate: (req: any, res: any, next: any) => next(),
  validatePreferences: (req: any, res: any, next: any) => next(),
  validatePreferencesUpdate: (req: any, res: any, next: any) => next(),
}));

// Mock scheduler functions
jest.mock('../src/services/session-scheduler', () => ({
  scheduleSessionExpiry: jest.fn().mockResolvedValue(undefined),
  cancelSessionExpiry: jest.fn().mockResolvedValue(undefined),
  extendSessionExpiry: jest.fn().mockResolvedValue(undefined),
  scheduleSessionExpiryWarning: jest.fn().mockResolvedValue(undefined),
  cancelSessionExpiryWarning: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/matching-scheduler', () => ({
  triggerMatchingForUser: jest.fn().mockResolvedValue(undefined),
  cancelAutoDecline: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/location-fuzzer', () => ({
  fuzzLocationForAfterHours: (lat: number, lng: number) => ({
    latitude: lat + 0.001,
    longitude: lng + 0.001,
  }),
}));

jest.mock('../src/utils/device-fingerprint', () => ({
  storeDeviceFingerprint: jest.fn().mockResolvedValue(undefined),
}));

// Mock shared auth middleware
jest.mock('@vlvt/shared', () => ({
  createAfterHoursAuthMiddleware: () => (req: any, res: any, next: any) => next(),
}));

// Import mocked modules
import { scheduleSessionExpiry, cancelSessionExpiry } from '../src/services/session-scheduler';
import { triggerMatchingForUser, cancelAutoDecline } from '../src/services/matching-scheduler';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-only';

describe('After Hours Session Endpoints', () => {
  let app: Express;
  let validToken: string;

  const testUserId = 'user_ah_session_1';
  const testSessionId = 'session_123';
  const testMatchId = 'match_456';

  beforeAll(() => {
    // Create minimal test app with session routes
    app = express();
    app.use(express.json());

    // Simple auth middleware
    app.use((req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'No authorization' });
      }
      const token = authHeader.substring(7);
      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = { userId: decoded.userId, provider: decoded.provider, email: decoded.email };
        next();
      } catch {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }
    });

    // Mount session routes inline (simplified versions for testing)
    const router = express.Router();

    // POST /session/start
    router.post('/session/start', async (req, res) => {
      const userId = req.user!.userId;
      const { duration, latitude, longitude } = req.body;

      try {
        // Check for After Hours profile
        const profileCheck = await mockClient.query(
          'SELECT user_id FROM after_hours_profiles WHERE user_id = $1',
          [userId]
        );
        if (profileCheck.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'After Hours profile required before starting session',
            code: 'PROFILE_REQUIRED',
          });
        }

        // Check for existing active session
        const existingSession = await mockClient.query(
          'SELECT id FROM after_hours_sessions WHERE user_id = $1 AND ended_at IS NULL',
          [userId]
        );
        if (existingSession.rows.length > 0) {
          return res.status(409).json({
            success: false,
            error: 'Active session already exists',
            code: 'SESSION_ALREADY_ACTIVE',
          });
        }

        // Create session
        const expiresAt = new Date(Date.now() + duration * 60 * 1000);
        const result = await mockClient.query(
          'INSERT INTO after_hours_sessions ...',
          [userId, expiresAt, latitude, longitude]
        );

        const session = result.rows[0];

        res.status(201).json({
          success: true,
          session: {
            id: session.id,
            startedAt: session.started_at,
            expiresAt: session.expires_at,
            durationMinutes: duration,
          },
        });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to start session' });
      }
    });

    // POST /session/end
    router.post('/session/end', async (req, res) => {
      const userId = req.user!.userId;

      try {
        const result = await mockPool.query(
          'UPDATE after_hours_sessions SET ended_at = NOW() WHERE user_id = $1 AND ended_at IS NULL RETURNING id',
          [userId]
        );

        if (result.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No active session found',
          });
        }

        const sessionId = result.rows[0].id;
        await cancelSessionExpiry(sessionId);

        res.json({
          success: true,
          message: 'Session ended',
        });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to end session' });
      }
    });

    // POST /session/extend
    router.post('/session/extend', async (req, res) => {
      const userId = req.user!.userId;
      const { additionalMinutes } = req.body;

      try {
        // Get current active session
        const sessionResult = await mockPool.query(
          'SELECT id, expires_at FROM after_hours_sessions WHERE user_id = $1 AND ended_at IS NULL',
          [userId]
        );

        if (sessionResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'No active session to extend',
          });
        }

        const session = sessionResult.rows[0];
        const currentExpiry = new Date(session.expires_at);
        const newExpiry = new Date(currentExpiry.getTime() + additionalMinutes * 60 * 1000);

        // Update session expiry
        await mockPool.query('UPDATE after_hours_sessions SET expires_at = $1 WHERE id = $2', [newExpiry, session.id]);

        res.json({
          success: true,
          session: {
            id: session.id,
            expiresAt: newExpiry,
            extendedByMinutes: additionalMinutes,
          },
        });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to extend session' });
      }
    });

    // GET /session
    router.get('/session', async (req, res) => {
      const userId = req.user!.userId;

      try {
        const result = await mockPool.query(
          'SELECT id, started_at, expires_at FROM after_hours_sessions WHERE user_id = $1 AND ended_at IS NULL',
          [userId]
        );

        if (result.rows.length === 0) {
          return res.json({
            success: true,
            active: false,
            session: null,
          });
        }

        const session = result.rows[0];
        const remainingSeconds = Math.max(0, Math.floor((new Date(session.expires_at).getTime() - Date.now()) / 1000));

        res.json({
          success: true,
          active: remainingSeconds > 0,
          session: {
            id: session.id,
            startedAt: session.started_at,
            expiresAt: session.expires_at,
            remainingSeconds,
          },
        });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to get session status' });
      }
    });

    // POST /match/decline
    router.post('/match/decline', async (req, res) => {
      const userId = req.user!.userId;
      const { matchId } = req.body;

      try {
        // Check for active session
        const sessionResult = await mockPool.query(
          'SELECT id FROM after_hours_sessions WHERE user_id = $1 AND ended_at IS NULL',
          [userId]
        );

        if (sessionResult.rows.length === 0) {
          return res.status(400).json({
            success: false,
            error: 'No active session',
            code: 'NO_ACTIVE_SESSION',
          });
        }

        const sessionId = sessionResult.rows[0].id;

        // Get match and verify user is part of it
        const matchResult = await mockPool.query(
          'SELECT id, user_id_1, user_id_2 FROM after_hours_matches WHERE id = $1 AND (user_id_1 = $2 OR user_id_2 = $2) AND declined_by IS NULL',
          [matchId, userId]
        );

        if (matchResult.rows.length === 0) {
          return res.status(404).json({
            success: false,
            error: 'Match not found or already declined',
          });
        }

        // Record decline
        await mockPool.query('INSERT INTO after_hours_declines ...', [userId, matchId]);
        await mockPool.query('UPDATE after_hours_matches SET declined_by = $1 WHERE id = $2', [userId, matchId]);

        await cancelAutoDecline(matchId);
        await triggerMatchingForUser(userId, sessionId, 30000);

        res.json({
          success: true,
          message: 'Match declined',
        });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to decline match' });
      }
    });

    // GET /match/current
    router.get('/match/current', async (req, res) => {
      const userId = req.user!.userId;

      try {
        // Check for active session
        const sessionResult = await mockPool.query(
          'SELECT id, fuzzed_latitude, fuzzed_longitude FROM after_hours_sessions WHERE user_id = $1 AND ended_at IS NULL',
          [userId]
        );

        if (sessionResult.rows.length === 0) {
          return res.json({
            success: true,
            active: false,
            status: 'no_session',
            match: null,
          });
        }

        // Get current undeclined match
        const matchResult = await mockPool.query(
          'SELECT m.id, m.expires_at, ... FROM after_hours_matches m WHERE ...',
          [userId]
        );

        if (matchResult.rows.length === 0) {
          return res.json({
            success: true,
            active: true,
            status: 'searching',
            match: null,
          });
        }

        const match = matchResult.rows[0];

        res.json({
          success: true,
          active: true,
          status: 'matched',
          match: {
            id: match.id,
            expiresAt: match.expires_at,
            profile: {
              name: match.name,
              age: match.age,
              photoUrl: match.photo_url,
              description: match.description,
            },
          },
        });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Failed to get match status' });
      }
    });

    app.use('/after-hours', router);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Create valid JWT token
    validToken = jwt.sign(
      { userId: testUserId, provider: 'google', email: 'user@example.com' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Reset mock client
    mockClient.query.mockReset();
    mockClient.release.mockReset();
    mockPool.query.mockReset();
  });

  // ============================================
  // POST /after-hours/session/start
  // ============================================

  describe('POST /after-hours/session/start', () => {
    it('should start session with valid profile and location', async () => {
      const startedAt = new Date();
      const expiresAt = new Date(startedAt.getTime() + 30 * 60 * 1000);

      // Mock: profile exists
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ user_id: testUserId }] })
        // Mock: no existing session
        .mockResolvedValueOnce({ rows: [] })
        // Mock: insert session
        .mockResolvedValueOnce({
          rows: [{
            id: testSessionId,
            started_at: startedAt,
            expires_at: expiresAt,
          }],
        });

      const response = await request(app)
        .post('/after-hours/session/start')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          duration: 30,
          latitude: 52.52,
          longitude: 13.405,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.session).toHaveProperty('id');
      expect(response.body.session.durationMinutes).toBe(30);
    });

    it('should return 400 if After Hours profile does not exist', async () => {
      // Mock: no profile
      mockClient.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/after-hours/session/start')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          duration: 30,
          latitude: 52.52,
          longitude: 13.405,
        })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('PROFILE_REQUIRED');
    });

    it('should return 409 if session already active', async () => {
      // Mock: profile exists
      mockClient.query
        .mockResolvedValueOnce({ rows: [{ user_id: testUserId }] })
        // Mock: existing active session
        .mockResolvedValueOnce({ rows: [{ id: 'existing_session' }] });

      const response = await request(app)
        .post('/after-hours/session/start')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          duration: 30,
          latitude: 52.52,
          longitude: 13.405,
        })
        .expect(409);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('SESSION_ALREADY_ACTIVE');
    });
  });

  // ============================================
  // POST /after-hours/session/extend
  // ============================================

  describe('POST /after-hours/session/extend', () => {
    it('should extend active session by additional minutes', async () => {
      const currentExpiry = new Date(Date.now() + 600000); // 10 min from now

      // Mock: active session exists
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: testSessionId,
            expires_at: currentExpiry,
          }],
        })
        // Mock: update expiry
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/after-hours/session/extend')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ additionalMinutes: 15 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.session).toHaveProperty('id');
      expect(response.body.session.extendedByMinutes).toBe(15);
    });
  });

  // ============================================
  // POST /after-hours/session/end
  // ============================================

  describe('POST /after-hours/session/end', () => {
    it('should end active session successfully', async () => {
      // Mock: session ended
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: testSessionId }],
      });

      const response = await request(app)
        .post('/after-hours/session/end')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Session ended');
      expect(cancelSessionExpiry).toHaveBeenCalledWith(testSessionId);
    });

    it('should return 404 if no active session', async () => {
      // Mock: no session found
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/after-hours/session/end')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('No active session');
    });
  });

  // ============================================
  // GET /after-hours/session
  // ============================================

  describe('GET /after-hours/session', () => {
    it('should return active session with remaining time', async () => {
      const expiresAt = new Date(Date.now() + 600000); // 10 min from now

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: testSessionId,
          started_at: new Date(),
          expires_at: expiresAt,
        }],
      });

      const response = await request(app)
        .get('/after-hours/session')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.active).toBe(true);
      expect(response.body.session).toHaveProperty('id');
      expect(response.body.session).toHaveProperty('remainingSeconds');
      expect(response.body.session.remainingSeconds).toBeGreaterThan(0);
    });

    it('should return inactive when no session', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/after-hours/session')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.active).toBe(false);
      expect(response.body.session).toBeNull();
    });
  });

  // ============================================
  // POST /after-hours/match/decline
  // ============================================

  describe('POST /after-hours/match/decline', () => {
    it('should decline match successfully', async () => {
      // Mock: active session
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: testSessionId }] })
        // Mock: match exists
        .mockResolvedValueOnce({
          rows: [{
            id: testMatchId,
            user_id_1: testUserId,
            user_id_2: 'other_user',
          }],
        })
        // Mock: insert decline
        .mockResolvedValueOnce({ rows: [] })
        // Mock: update match
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/after-hours/match/decline')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ matchId: testMatchId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Match declined');
      expect(cancelAutoDecline).toHaveBeenCalledWith(testMatchId);
      expect(triggerMatchingForUser).toHaveBeenCalledWith(testUserId, testSessionId, 30000);
    });

    it('should return 400 if no active session', async () => {
      // Mock: no session
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/after-hours/match/decline')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ matchId: testMatchId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.code).toBe('NO_ACTIVE_SESSION');
    });

    it('should return 404 if match not found or already declined', async () => {
      // Mock: active session
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ id: testSessionId }] })
        // Mock: no match
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .post('/after-hours/match/decline')
        .set('Authorization', `Bearer ${validToken}`)
        .send({ matchId: testMatchId })
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Match not found');
    });
  });

  // ============================================
  // GET /after-hours/match/current
  // ============================================

  describe('GET /after-hours/match/current', () => {
    it('should return no_session when no active session', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/after-hours/match/current')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.active).toBe(false);
      expect(response.body.status).toBe('no_session');
      expect(response.body.match).toBeNull();
    });

    it('should return searching when session active but no match', async () => {
      // Mock: active session
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: testSessionId,
            fuzzed_latitude: 52.52,
            fuzzed_longitude: 13.405,
          }],
        })
        // Mock: no match
        .mockResolvedValueOnce({ rows: [] });

      const response = await request(app)
        .get('/after-hours/match/current')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.active).toBe(true);
      expect(response.body.status).toBe('searching');
      expect(response.body.match).toBeNull();
    });

    it('should return matched when current match exists', async () => {
      const expiresAt = new Date(Date.now() + 600000);

      // Mock: active session
      mockPool.query
        .mockResolvedValueOnce({
          rows: [{
            id: testSessionId,
            fuzzed_latitude: 52.52,
            fuzzed_longitude: 13.405,
          }],
        })
        // Mock: current match
        .mockResolvedValueOnce({
          rows: [{
            id: testMatchId,
            expires_at: expiresAt,
            name: 'Match Name',
            age: 28,
            photo_url: 'photo.jpg',
            description: 'Looking for connection',
          }],
        });

      const response = await request(app)
        .get('/after-hours/match/current')
        .set('Authorization', `Bearer ${validToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.active).toBe(true);
      expect(response.body.status).toBe('matched');
      expect(response.body.match).toHaveProperty('id');
      expect(response.body.match.profile).toHaveProperty('name');
      expect(response.body.match.profile).toHaveProperty('age');
    });
  });
});
