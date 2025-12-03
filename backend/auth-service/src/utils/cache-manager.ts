import { createClient, RedisClientType } from 'redis';
import logger from './logger';

/**
 * Advanced Redis caching manager for performance optimization
 * Implements comprehensive caching strategy with TTL management
 */

class CacheManager {
  private client: RedisClientType;
  private connected: boolean = false;
  private connectionRetries: number = 0;
  private maxRetries: number = 5;
  private retryDelay: number = 1000; // 1 second initial delay

  constructor() {
    this.client = {} as RedisClientType;
  }

  /**
   * Initialize Redis connection with exponential backoff
   */
  public async initialize(): Promise<void> {
    if (!process.env.REDIS_URL) {
      logger.warn('REDIS_URL not configured, caching will be disabled');
      return;
    }

    try {
      this.client = createClient({
        url: process.env.REDIS_URL,
        socket: {
          reconnectStrategy: (retries) => {
            const delay = Math.min(this.retryDelay * Math.pow(2, retries), 30000); // Max 30s
            logger.warn(`Redis connection attempt ${retries + 1}, retrying in ${delay}ms`);
            return delay;
          }
        }
      });

      this.client.on('error', (err) => {
        logger.error('Redis client error', { error: err });
        this.connected = false;
      });

      this.client.on('connect', () => {
        logger.info('Redis client connected successfully');
        this.connected = true;
        this.connectionRetries = 0;
      });

      this.client.on('reconnecting', () => {
        logger.info('Redis client reconnecting...');
      });

      await this.client.connect();
      this.connected = true;
      logger.info('Redis cache manager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize Redis cache manager', { error });
      this.connected = false;
      throw error;
    }
  }

  /**
   * Check if cache is available
   */
  public isAvailable(): boolean {
    return this.connected;
  }

  /**
   * Set cache with TTL (Time To Live)
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds
   */
  public async set(key: string, value: any, ttl: number = 300): Promise<void> {
    if (!this.connected) return;

    try {
      const data = JSON.stringify(value);
      await this.client.set(key, data, { EX: ttl });
      logger.debug('Cache set successfully', { key, ttl });
    } catch (error) {
      logger.error('Failed to set cache', { key, error });
      throw error;
    }
  }

  /**
   * Get cached value
   * @param key Cache key
   * @returns Cached value or null if not found
   */
  public async get<T>(key: string): Promise<T | null> {
    if (!this.connected) return null;

    try {
      const data = await this.client.get(key);
      if (!data) return null;

      logger.debug('Cache hit', { key });
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error('Failed to get cache', { key, error });
      return null;
    }
  }

  /**
   * Delete cache entry
   * @param key Cache key to delete
   */
  public async delete(key: string): Promise<void> {
    if (!this.connected) return;

    try {
      await this.client.del(key);
      logger.debug('Cache deleted', { key });
    } catch (error) {
      logger.error('Failed to delete cache', { key, error });
      throw error;
    }
  }

  /**
   * Clear all cache entries (use with caution)
   */
  public async clear(): Promise<void> {
    if (!this.connected) return;

    try {
      // Note: In production, consider using FLUSHDB with care
      // For safety, we'll use a more targeted approach
      const keys = await this.client.keys('*');
      if (keys.length > 0) {
        await this.client.del(keys);
        logger.info('Cache cleared', { count: keys.length });
      }
    } catch (error) {
      logger.error('Failed to clear cache', { error });
      throw error;
    }
  }

  /**
   * Set cache with sliding expiration (resets TTL on access)
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds
   */
  public async setSliding(key: string, value: any, ttl: number = 300): Promise<void> {
    if (!this.connected) return;

    try {
      const data = JSON.stringify(value);
      await this.client.set(key, data, { EX: ttl, XX: true }); // XX: Only set the key if it already exists
      logger.debug('Sliding cache set successfully', { key, ttl });
    } catch (error) {
      logger.error('Failed to set sliding cache', { key, error });
      throw error;
    }
  }

  /**
   * Get cached value with sliding expiration
   * @param key Cache key
   * @param ttl Time to live in seconds (for renewal)
   * @returns Cached value or null if not found
   */
  public async getSliding<T>(key: string, ttl: number = 300): Promise<T | null> {
    if (!this.connected) return null;

    try {
      const data = await this.client.get(key);
      if (!data) return null;

      // Renew the TTL
      await this.client.expire(key, ttl);

      logger.debug('Sliding cache hit', { key, ttl });
      return JSON.parse(data) as T;
    } catch (error) {
      logger.error('Failed to get sliding cache', { key, error });
      return null;
    }
  }

  /**
   * Cache middleware for Express routes
   * @param ttl Cache TTL in seconds
   * @returns Express middleware function
   */
  public cacheMiddleware(ttl: number = 300) {
    return async (req: any, res: any, next: any) => {
      if (!this.connected) return next();

      try {
        const cacheKey = `route:${req.method}:${req.path}`;
        const cachedResponse = await this.get(cacheKey);

        if (cachedResponse) {
          logger.debug('Serving from cache', { key: cacheKey });
          return res.status(200).json(cachedResponse);
        }

        // Override res.json to cache the response
        const originalJson = res.json;
        res.json = (body: any) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            this.set(cacheKey, body, ttl).catch(error =>
              logger.error('Failed to cache response', { error })
            );
          }
          originalJson.call(res, body);
        };

        next();
      } catch (error) {
        logger.error('Cache middleware error', { error });
        next();
      }
    };
  }

  /**
   * Health check for cache
   */
  public async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.connected) {
      return { healthy: false, message: 'Cache not connected' };
    }

    try {
      await this.client.ping();
      return { healthy: true, message: 'Cache is healthy' };
    } catch (error) {
      return { healthy: false, message: 'Cache ping failed' };
    }
  }
}

// Singleton instance
const cacheManager = new CacheManager();

export default cacheManager;