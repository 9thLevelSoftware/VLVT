import jwt from 'jsonwebtoken';

// Create a shared mock pool that persists across module reloads
const mockQuery = jest.fn();
const mockOn = jest.fn();

// Mock dependencies before importing the app
jest.mock('pg', () => {
  return {
    Pool: jest.fn(() => ({
      query: mockQuery,
      on: mockOn,
    })),
  };
});

jest.mock('@sentry/node', () => ({
  init: jest.fn(),
  setupExpressErrorHandler: jest.fn(),
}));

import request from 'supertest';

const JWT_SECRET = process.env.JWT_SECRET!;

describe('POST /profiles/search/count', () => {
  let app: any;
  let validToken: string;

  beforeEach(() => {
    // Clear mock call history
    mockQuery.mockClear();
    mockOn.mockClear();

    // Create valid JWT token
    validToken = jwt.sign(
      { userId: 'test_user_123', provider: 'google', email: 'test@example.com' },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Re-import app to get fresh instance with mocks
    jest.resetModules();
    delete require.cache[require.resolve('../src/index')];
  });

  describe('Basic functionality', () => {
    it('should return count without filters', async () => {
      // Mock user location query
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        // Mock count query
        .mockResolvedValueOnce({
          rows: [{ count: '10' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(10);
    });

    it('should require authentication', async () => {
      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .send({
          maxDistance: 50,
        });

      // Without Bearer token, CSRF middleware triggers first (returns 403)
      // This is expected behavior - CSRF protection before auth
      expect(response.status).toBe(403);
      expect(response.body.success).toBe(false);
    });
  });

  describe('Gender filtering', () => {
    it('should filter by single gender', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '5' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          genders: ['Female'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBeDefined();

      // Verify the SQL query includes gender filter
      const countQueryCall = mockQuery.mock.calls[1];
      expect(countQueryCall[0]).toContain('gender = ANY');
      expect(countQueryCall[1]).toContainEqual(['Female']);
    });

    it('should filter by multiple genders', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '8' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          genders: ['Male', 'Non-Binary'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the SQL query includes gender filter with multiple values
      const countQueryCall = mockQuery.mock.calls[1];
      expect(countQueryCall[0]).toContain('gender = ANY');
      expect(countQueryCall[1]).toContainEqual(['Male', 'Non-Binary']);
    });
  });

  describe('Sexual preference filtering', () => {
    it('should filter by sexual preference', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '3' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          sexualPreferences: ['Bisexual'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the SQL query includes sexual_preference filter
      const countQueryCall = mockQuery.mock.calls[1];
      expect(countQueryCall[0]).toContain('sexual_preference = ANY');
      expect(countQueryCall[1]).toContainEqual(['Bisexual']);
    });

    it('should filter by multiple sexual preferences', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '7' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          sexualPreferences: ['Straight', 'Gay', 'Bisexual'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const countQueryCall = mockQuery.mock.calls[1];
      expect(countQueryCall[0]).toContain('sexual_preference = ANY');
    });
  });

  describe('Intent filtering', () => {
    it('should filter by intent', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '4' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          intents: ['Dating'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify the SQL query includes intent filter
      const countQueryCall = mockQuery.mock.calls[1];
      expect(countQueryCall[0]).toContain('intent = ANY');
      expect(countQueryCall[1]).toContainEqual(['Dating']);
    });

    it('should filter by multiple intents', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '6' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          intents: ['Dating', 'Relationship'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const countQueryCall = mockQuery.mock.calls[1];
      expect(countQueryCall[0]).toContain('intent = ANY');
    });
  });

  describe('Combined filtering', () => {
    it('should combine all filters', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '2' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          genders: ['Female'],
          sexualPreferences: ['Straight', 'Bisexual'],
          intents: ['Dating', 'Relationship'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);

      // Verify all filters are applied
      const countQueryCall = mockQuery.mock.calls[1];
      const query = countQueryCall[0];
      expect(query).toContain('gender = ANY');
      expect(query).toContain('sexual_preference = ANY');
      expect(query).toContain('intent = ANY');
    });

    it('should work with empty arrays (no filtering)', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: 40.7128, longitude: -74.006 }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '15' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          genders: [],
          sexualPreferences: [],
          intents: [],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify no filter conditions are added for empty arrays
      const countQueryCall = mockQuery.mock.calls[1];
      const query = countQueryCall[0];
      expect(query).not.toContain('gender = ANY');
      expect(query).not.toContain('sexual_preference = ANY');
      expect(query).not.toContain('intent = ANY');
    });
  });

  describe('Edge cases', () => {
    it('should work without user location', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{ latitude: null, longitude: null }],
        })
        .mockResolvedValueOnce({
          rows: [{ count: '20' }],
        });

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          genders: ['Female'],
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify gender filter is still applied even without location
      const countQueryCall = mockQuery.mock.calls[1];
      expect(countQueryCall[0]).toContain('gender = ANY');
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const appModule = require('../src/index');
      app = appModule.default || appModule;

      const response = await request(app)
        .post('/profiles/search/count')
        .set('Authorization', `Bearer ${validToken}`)
        .send({
          maxDistance: 50,
          genders: ['Female'],
        });

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Failed to search');
    });
  });
});
