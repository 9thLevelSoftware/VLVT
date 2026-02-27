/**
 * Shared PostgreSQL Pool Factory
 *
 * Centralizes pool configuration for all VLVT microservices.
 * Addresses:
 *   RESIL-01: Idle client errors logged, never crash the process
 *   RESIL-02: 5000ms connection timeout for Railway cold start resilience
 *   RESIL-03: Single source of truth for pool settings
 */

import { Pool, PoolConfig } from 'pg';
import winston from 'winston';

export interface CreatePoolOptions {
  /** Override DATABASE_URL from env */
  connectionString?: string;
  /** Winston logger instance for pool events */
  logger?: winston.Logger;
  /** Override default pool config */
  poolConfig?: Partial<PoolConfig>;
}

export function createPool(options: CreatePoolOptions = {}): Pool {
  const {
    connectionString = process.env.DATABASE_URL,
    logger,
    poolConfig = {},
  } = options;

  const pool = new Pool({
    connectionString,
    max: parseInt(process.env.DATABASE_POOL_MAX || '20', 10),
    idleTimeoutMillis: parseInt(process.env.DATABASE_IDLE_TIMEOUT_MS || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DATABASE_CONNECTION_TIMEOUT_MS || '5000', 10),
    // SEC-01-DOCUMENTED: rejectUnauthorized: false is acceptable for Railway's
    // internal private network with self-signed certs.
    ssl: connectionString?.includes('railway')
      ? { rejectUnauthorized: false }
      : false,
    ...poolConfig,
  });

  const log = logger ?? {
    info: console.log,
    debug: console.debug,
    error: console.error,
  };

  pool.on('connect', () => {
    log.info('New database connection established');
  });

  pool.on('acquire', () => {
    if (typeof log.debug === 'function') log.debug('Database client acquired from pool');
  });

  pool.on('remove', () => {
    if (typeof log.debug === 'function') log.debug('Database client removed from pool');
  });

  // RESIL-01: Log error and continue. pg-pool already removes the dead client
  // and will create a new one on the next connect()/query() call.
  pool.on('error', (err: Error) => {
    log.error('Unexpected error on idle database client', {
      error: err.message,
      stack: err.stack,
    });
  });

  return pool;
}
