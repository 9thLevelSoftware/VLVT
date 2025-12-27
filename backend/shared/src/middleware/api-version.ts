/**
 * API Version Middleware
 *
 * Provides API versioning support for VLVT microservices.
 * Enables safe API evolution without breaking existing clients.
 *
 * Features:
 * - Extract version from URL prefix (/api/v1/..., /api/v2/...)
 * - Add version to request object (req.apiVersion)
 * - Support default version for legacy unversioned routes
 * - Log deprecation warnings for old versions
 * - Versioned router helper for creating version-specific routes
 */

import { Router, Request, Response, NextFunction, RequestHandler } from 'express';

/**
 * Supported API versions
 */
export const API_VERSIONS = {
  V1: 1,
  V2: 2,
} as const;

export type ApiVersion = (typeof API_VERSIONS)[keyof typeof API_VERSIONS];

/**
 * Current/latest API version
 */
export const CURRENT_API_VERSION = API_VERSIONS.V1;

/**
 * Default version for legacy routes (unversioned)
 */
export const DEFAULT_API_VERSION = API_VERSIONS.V1;

/**
 * Deprecated versions that will trigger warnings
 */
export const DEPRECATED_VERSIONS: ApiVersion[] = [];

/**
 * Minimum supported version
 */
export const MINIMUM_SUPPORTED_VERSION = API_VERSIONS.V1;

/**
 * Options for version middleware
 */
export interface VersionMiddlewareOptions {
  /** Default version for unversioned routes */
  defaultVersion?: ApiVersion;
  /** Logger function for deprecation warnings */
  logger?: {
    warn: (message: string, meta?: Record<string, unknown>) => void;
    info: (message: string, meta?: Record<string, unknown>) => void;
  };
  /** Whether to allow legacy unversioned routes */
  allowLegacyRoutes?: boolean;
  /** Custom deprecation message */
  deprecationMessage?: string;
}

/**
 * Result of version extraction
 */
export interface VersionExtractionResult {
  version: ApiVersion;
  isLegacy: boolean;
  isDeprecated: boolean;
  remainingPath: string;
}

/**
 * Extract API version from URL path
 *
 * @param path - The request path (e.g., /api/v1/auth/login)
 * @param defaultVersion - Default version for unversioned routes
 * @returns Extraction result with version info and remaining path
 */
export function extractVersion(
  path: string,
  defaultVersion: ApiVersion = DEFAULT_API_VERSION
): VersionExtractionResult {
  // Match /api/v{N}/... pattern
  const versionMatch = path.match(/^\/api\/v(\d+)(\/.*)?$/);

  if (versionMatch) {
    const version = parseInt(versionMatch[1], 10) as ApiVersion;
    const remainingPath = versionMatch[2] || '/';

    return {
      version,
      isLegacy: false,
      isDeprecated: DEPRECATED_VERSIONS.includes(version),
      remainingPath,
    };
  }

  // Legacy route (no version prefix)
  return {
    version: defaultVersion,
    isLegacy: true,
    isDeprecated: false,
    remainingPath: path,
  };
}

/**
 * Check if a version is supported
 */
export function isVersionSupported(version: ApiVersion): boolean {
  return version >= MINIMUM_SUPPORTED_VERSION && version <= CURRENT_API_VERSION;
}

/**
 * Create API version middleware
 *
 * Extracts version from URL and adds it to request object.
 * Logs deprecation warnings for old versions.
 *
 * @param options - Configuration options
 * @returns Express middleware function
 */
export function createVersionMiddleware(
  options: VersionMiddlewareOptions = {}
): RequestHandler {
  const {
    defaultVersion = DEFAULT_API_VERSION,
    logger,
    allowLegacyRoutes = true,
    deprecationMessage = 'This API version is deprecated. Please upgrade to the latest version.',
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const result = extractVersion(req.path, defaultVersion);

    // Add version info to request
    req.apiVersion = result.version;

    // Check if version is supported
    if (!isVersionSupported(result.version)) {
      res.status(400).json({
        success: false,
        error: `API version v${result.version} is not supported. Minimum supported version is v${MINIMUM_SUPPORTED_VERSION}.`,
        supportedVersions: Object.values(API_VERSIONS),
      });
      return;
    }

    // Always add version header
    res.setHeader('X-API-Version', `v${result.version}`);

    // Log deprecation warning
    if (result.isDeprecated && logger) {
      logger.warn('Deprecated API version used', {
        version: result.version,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      // Add deprecation header
      res.setHeader('X-API-Deprecated', 'true');
      res.setHeader('X-API-Deprecation-Message', deprecationMessage);
    }

    // Handle legacy route
    if (result.isLegacy) {
      // Add header indicating legacy route
      res.setHeader('X-API-Legacy-Route', 'true');

      // Log legacy route usage if logger available
      if (logger) {
        logger.info('Legacy unversioned route accessed', {
          path: req.path,
          method: req.method,
          defaultVersion,
          ip: req.ip,
        });
      }
    }

    // Block legacy routes if not allowed
    if (result.isLegacy && !allowLegacyRoutes) {
      res.status(400).json({
        success: false,
        error: 'Unversioned routes are not supported. Please use /api/v1/... format.',
        latestVersion: CURRENT_API_VERSION,
      });
      return;
    }

    next();
  };
}

/**
 * Options for versioned router
 */
export interface VersionedRouterOptions {
  /** API version for this router */
  version: ApiVersion;
  /** Base path prefix (e.g., '/auth', '/profile') */
  basePath?: string;
}

/**
 * Create a versioned Express router
 *
 * Creates a router that will be mounted at /api/v{version}/{basePath}
 *
 * @param options - Router configuration
 * @returns Express Router instance
 */
export function createVersionedRouter(options: VersionedRouterOptions): Router {
  const router = Router();
  return router;
}

/**
 * Get the full versioned path for a route
 *
 * @param version - API version number
 * @param basePath - Service base path (e.g., '/auth', '/profile')
 * @param routePath - Individual route path (e.g., '/login', '/register')
 * @returns Full path (e.g., '/api/v1/auth/login')
 */
export function getVersionedPath(
  version: ApiVersion,
  basePath: string = '',
  routePath: string = ''
): string {
  const normalizedBase = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const normalizedRoute = routePath.startsWith('/') ? routePath : `/${routePath}`;

  return `/api/v${version}${normalizedBase}${normalizedRoute}`.replace(/\/+/g, '/').replace(/\/$/, '');
}

/**
 * Create versioned routes for a service
 *
 * Helper to mount existing routes under versioned path prefixes.
 *
 * @param app - Express application instance
 * @param version - API version
 * @param basePath - Service base path (e.g., 'auth', 'profile', 'chat')
 * @param router - Router containing the service routes
 */
export function mountVersionedRoutes(
  app: { use: (path: string, router: Router) => void },
  version: ApiVersion,
  basePath: string,
  router: Router
): void {
  const versionPrefix = `/api/v${version}`;
  const normalizedBase = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const fullPath = `${versionPrefix}${normalizedBase}`;

  app.use(fullPath, router);
}

/**
 * Add version info to health check response
 *
 * @param baseHealth - Base health check data
 * @returns Health check data with version info
 */
export function addVersionToHealth(baseHealth: Record<string, unknown>): Record<string, unknown> {
  return {
    ...baseHealth,
    api: {
      currentVersion: CURRENT_API_VERSION,
      minimumVersion: MINIMUM_SUPPORTED_VERSION,
      supportedVersions: Object.values(API_VERSIONS),
      deprecatedVersions: DEPRECATED_VERSIONS,
    },
  };
}

/**
 * Middleware to add version to response headers
 */
export function addVersionHeaders(version: ApiVersion = CURRENT_API_VERSION): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-API-Version', `v${version}`);
    res.setHeader('X-API-Current-Version', `v${CURRENT_API_VERSION}`);
    next();
  };
}

// Declare module augmentation for Express Request
declare global {
  namespace Express {
    interface Request {
      /** API version number (1, 2, etc.) */
      apiVersion?: number;
    }
  }
}
