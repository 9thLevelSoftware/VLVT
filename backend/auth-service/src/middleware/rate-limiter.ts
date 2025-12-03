import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import logger from '../utils/logger';

// Performance optimization: Implement Redis-based rate limiting for production
let rateLimitStore: any;

// Initialize Redis client for rate limiting
if (process.env.REDIS_URL && process.env.NODE_ENV === 'production') {
  try {
    const redisClient = createClient({
      url: process.env.REDIS_URL,
      socket: {
        reconnectStrategy: (retries) => Math.min(retries * 100, 5000) // Exponential backoff
      }
    });

    redisClient.on('error', (err) => {
      logger.error('Redis rate limiting client error', { error: err });
    });

    redisClient.on('connect', () => {
      logger.info('Redis rate limiting client connected');
    });

    // Use Redis store for production
    rateLimitStore = new RedisStore({
      sendCommand: (...args: string[]) => redisClient.sendCommand(args),
      prefix: 'rl:'
    });

    logger.info('Using Redis store for rate limiting (production)');
  } catch (err) {
    logger.error('Failed to initialize Redis rate limiting', { error: err });
    logger.warn('Falling back to memory store for rate limiting');
    rateLimitStore = undefined;
  }
} else {
  logger.info('Using memory store for rate limiting (development/single-instance)');
  rateLimitStore = undefined;
}

// General API rate limiter (100 requests per 15 minutes per IP)
export const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  store: rateLimitStore, // Use Redis store if available
  handler: (req, res) => {
    logger.warn('Rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limiter: 'general'
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later'
    });
  }
});

// Authentication rate limiter (10 requests per 15 minutes per IP)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: 'Too many authentication attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore, // Use Redis store if available
  handler: (req, res) => {
    logger.warn('Auth rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limiter: 'auth'
    });
    res.status(429).json({
      success: false,
      error: 'Too many authentication attempts, please try again later'
    });
  }
});

// Token verification rate limiter (100 requests per 15 minutes per IP)
export const verifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many verification requests, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore, // Use Redis store if available
  handler: (req, res) => {
    logger.warn('Verify rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limiter: 'verify'
    });
    res.status(429).json({
      success: false,
      error: 'Too many verification requests, please try again later'
    });
  }
});

// Strict rate limiter for sensitive operations (5 requests per 15 minutes per IP)
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many requests for this sensitive operation, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  store: rateLimitStore, // Use Redis store if available
  handler: (req, res) => {
    logger.warn('Strict rate limit exceeded', {
      ip: req.ip,
      path: req.path,
      limiter: 'strict'
    });
    res.status(429).json({
      success: false,
      error: 'Too many requests for this sensitive operation, please try again later'
    });
  }
});
