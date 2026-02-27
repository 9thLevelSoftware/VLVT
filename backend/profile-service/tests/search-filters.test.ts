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

// Mock @vlvt/shared so tests focus on search-count behavior
jest.mock('@vlvt/shared', () => ({
  createCsrfMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  createCsrfTokenHandler: jest.fn(() => (req: any, res: any) => res.json({ token: 'mock-token' })),
  correlationMiddleware: (req: any, res: any, next: any) => next(),
  createRequestLoggerMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  addVersionToHealth: jest.fn((obj: any) => ({
    ...obj,
    api: {
      currentVersion: 1,
      minimumVersion: 1,
      supportedVersions: [1, 2],
      deprecatedVersions: [],
    },
  })),
  API_VERSIONS: { V1: 'v1' },
  CURRENT_API_VERSION: 1,
  createInternalServiceAuthMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  createAfterHoursAuthMiddleware: jest.fn(() => (req: any, res: any, next: any) => next()),
  createPool: jest.fn(() => ({
    query: mockQuery,
    on: mockOn,
  })),
}));

// Keep this suite isolated from rate limiter and background infra behavior
jest.mock('../src/middleware/rate-limiter', () => ({
  generalLimiter: (req: any, res: any, next: any) => next(),
  profileCreationLimiter: (req: any, res: any, next: any) => next(),
  discoveryLimiter: (req: any, res: any, next: any) => next(),
  profileUpdateLimiter: (req: any, res: any, next: any) => next(),
  photoUploadLimiter: (req: any, res: any, next: any) => next(),
  swipeLimiter: (req: any, res: any, next: any) => next(),
  sensitiveActionLimiter: (req: any, res: any, next: any) => next(),
  initializeRateLimiting: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/fcm-service', () => ({
  initializeFirebase: jest.fn(),
  isFirebaseReady: jest.fn().mockReturnValue(false),
  sendMatchNotification: jest.fn().mockResolvedValue(undefined),
  sendMessageNotification: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/session-scheduler', () => ({
  initializeSessionWorker: jest.fn().mockResolvedValue(undefined),
  closeSessionScheduler: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/services/matching-scheduler', () => ({
  initializeMatchingScheduler: jest.fn().mockResolvedValue(undefined),
  closeMatchingScheduler: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/jobs/session-cleanup-job', () => ({
  initializeSessionCleanupJob: jest.fn().mockResolvedValue(undefined),
  closeSessionCleanupJob: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../src/utils/image-handler', () => ({
  initializeUploadDirectory: jest.fn().mockResolvedValue(undefined),
  validateImage: jest.fn().mockReturnValue({ valid: true }),
  validateImageMagicBytes: jest.fn().mockResolvedValue({ valid: true }),
  processImage: jest.fn().mockResolvedValue({
    key: 'photos/test_user_123/photo.webp',
    thumbnailKey: 'photos/test_user_123/photo_thumb.webp',
  }),
  deleteImage: jest.fn().mockResolvedValue(undefined),
  getPhotoIdFromUrl: jest.fn().mockReturnValue('photo-id'),
  canUploadMorePhotos: jest.fn().mockReturnValue(true),
  MAX_PHOTOS_PER_PROFILE: 6,
}));

jest.mock('../src/utils/r2-client', () => ({
  resolvePhotoUrls: jest.fn().mockImplementation((photos: string[]) =>
    Promise.resolve(photos.map((p) => `https://mock-presigned-url.example.com/${p}`))
  ),
  resolvePhotoUrl: jest.fn().mockImplementation((photo: string) =>
    Promise.resolve(`https://mock-presigned-url.example.com/${photo}`)
  ),
  uploadToR2: jest.fn().mockResolvedValue('uploaded-key'),
  getPresignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url.example.com/photo.jpg'),
  deleteUserPhotos: jest.fn().mockResolvedValue({ deleted: 0, failed: 0 }),
  R2_BUCKET_NAME: 'vlvt-images',
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

      // In this isolated suite, auth middleware handles missing tokens first
      expect(response.status).toBe(401);
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
