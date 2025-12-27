/**
 * API Version Middleware Tests
 */

import {
  extractVersion,
  isVersionSupported,
  createVersionMiddleware,
  createVersionedRouter,
  getVersionedPath,
  addVersionToHealth,
  addVersionHeaders,
  API_VERSIONS,
  CURRENT_API_VERSION,
  DEFAULT_API_VERSION,
  MINIMUM_SUPPORTED_VERSION,
} from '../src/middleware/api-version';
import express, { Request, Response, NextFunction } from 'express';
import request from 'supertest';

describe('API Version Middleware', () => {
  describe('extractVersion', () => {
    it('should extract version from /api/v1/ path', () => {
      const result = extractVersion('/api/v1/auth/login');
      expect(result.version).toBe(1);
      expect(result.isLegacy).toBe(false);
      expect(result.remainingPath).toBe('/auth/login');
    });

    it('should extract version from /api/v2/ path', () => {
      const result = extractVersion('/api/v2/profile');
      expect(result.version).toBe(2);
      expect(result.isLegacy).toBe(false);
      expect(result.remainingPath).toBe('/profile');
    });

    it('should handle root path after version', () => {
      const result = extractVersion('/api/v1');
      expect(result.version).toBe(1);
      expect(result.remainingPath).toBe('/');
    });

    it('should handle root path with trailing slash', () => {
      const result = extractVersion('/api/v1/');
      expect(result.version).toBe(1);
      expect(result.remainingPath).toBe('/');
    });

    it('should return default version for legacy unversioned routes', () => {
      const result = extractVersion('/auth/login');
      expect(result.version).toBe(DEFAULT_API_VERSION);
      expect(result.isLegacy).toBe(true);
      expect(result.remainingPath).toBe('/auth/login');
    });

    it('should return default version for root path', () => {
      const result = extractVersion('/');
      expect(result.version).toBe(DEFAULT_API_VERSION);
      expect(result.isLegacy).toBe(true);
      expect(result.remainingPath).toBe('/');
    });

    it('should respect custom default version', () => {
      const result = extractVersion('/health', 2);
      expect(result.version).toBe(2);
      expect(result.isLegacy).toBe(true);
    });
  });

  describe('isVersionSupported', () => {
    it('should return true for current version', () => {
      expect(isVersionSupported(CURRENT_API_VERSION)).toBe(true);
    });

    it('should return true for minimum supported version', () => {
      expect(isVersionSupported(MINIMUM_SUPPORTED_VERSION)).toBe(true);
    });

    it('should return false for version below minimum', () => {
      expect(isVersionSupported(0 as any)).toBe(false);
    });

    it('should return false for version above current', () => {
      expect(isVersionSupported((CURRENT_API_VERSION + 1) as any)).toBe(false);
    });
  });

  describe('getVersionedPath', () => {
    it('should build versioned path correctly', () => {
      const path = getVersionedPath(1, '/auth', '/login');
      expect(path).toBe('/api/v1/auth/login');
    });

    it('should handle paths without leading slashes', () => {
      const path = getVersionedPath(1, 'profile', 'update');
      expect(path).toBe('/api/v1/profile/update');
    });

    it('should handle empty route path', () => {
      const path = getVersionedPath(1, '/auth', '');
      expect(path).toBe('/api/v1/auth');
    });

    it('should handle empty base path', () => {
      const path = getVersionedPath(1, '', '/health');
      expect(path).toBe('/api/v1/health');
    });

    it('should normalize multiple slashes', () => {
      const path = getVersionedPath(1, '//auth/', '//login//');
      expect(path).toMatch(/^\/api\/v1\/auth\/login/);
    });
  });

  describe('addVersionToHealth', () => {
    it('should add version info to health check response', () => {
      const health = addVersionToHealth({ status: 'ok', service: 'test' });

      expect(health.status).toBe('ok');
      expect(health.service).toBe('test');
      expect(health.api).toBeDefined();
      expect((health.api as any).currentVersion).toBe(CURRENT_API_VERSION);
      expect((health.api as any).minimumVersion).toBe(MINIMUM_SUPPORTED_VERSION);
      expect((health.api as any).supportedVersions).toContain(API_VERSIONS.V1);
    });
  });

  describe('createVersionedRouter', () => {
    it('should create an Express router', () => {
      const router = createVersionedRouter({ version: 1 });
      expect(router).toBeDefined();
      expect(typeof router.get).toBe('function');
      expect(typeof router.post).toBe('function');
    });
  });

  describe('createVersionMiddleware', () => {
    let app: express.Application;

    beforeEach(() => {
      app = express();

      // Add the version middleware
      app.use(createVersionMiddleware({ allowLegacyRoutes: true }));

      // Test routes - registered at both versioned and legacy paths
      // In real usage, the middleware extracts info but services define their own routes
      app.get('/health', (req: Request, res: Response) => {
        res.json({ version: req.apiVersion, path: req.path });
      });

      app.get('/api/v1/health', (req: Request, res: Response) => {
        res.json({ version: req.apiVersion, path: req.path });
      });

      app.get('/auth/test', (req: Request, res: Response) => {
        res.json({ version: req.apiVersion, path: req.path });
      });

      app.get('/api/v1/auth/test', (req: Request, res: Response) => {
        res.json({ version: req.apiVersion, path: req.path });
      });
    });

    it('should set apiVersion on request for versioned routes', async () => {
      const response = await request(app)
        .get('/api/v1/auth/test')
        .expect(200);

      expect(response.body.version).toBe(1);
    });

    it('should set apiVersion for legacy routes', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.version).toBe(DEFAULT_API_VERSION);
    });

    it('should add X-API-Version header for versioned routes', async () => {
      const response = await request(app)
        .get('/api/v1/health')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v1');
    });

    it('should add X-API-Legacy-Route header for legacy routes', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.headers['x-api-legacy-route']).toBe('true');
    });

    it('should reject unsupported versions', async () => {
      const response = await request(app)
        .get('/api/v99/health')
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('not supported');
    });
  });

  describe('addVersionHeaders middleware', () => {
    it('should add version headers to response', async () => {
      const app = express();
      app.use(addVersionHeaders(1));
      app.get('/test', (req, res) => res.json({ ok: true }));

      const response = await request(app)
        .get('/test')
        .expect(200);

      expect(response.headers['x-api-version']).toBe('v1');
      expect(response.headers['x-api-current-version']).toBe(`v${CURRENT_API_VERSION}`);
    });
  });

  describe('API_VERSIONS constants', () => {
    it('should have V1 defined', () => {
      expect(API_VERSIONS.V1).toBe(1);
    });

    it('should have V2 defined for future use', () => {
      expect(API_VERSIONS.V2).toBe(2);
    });

    it('should have current version set to V1', () => {
      expect(CURRENT_API_VERSION).toBe(1);
    });
  });
});
