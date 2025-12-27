/**
 * Comprehensive Audit Logger for VLVT Microservices
 *
 * Provides centralized audit logging for security events and data changes.
 * Essential for security incident investigation and compliance requirements.
 */

import { Pool, PoolClient } from 'pg';
import { createLogger, LoggerOptions } from './logger';
import winston from 'winston';

/**
 * Authentication-related audit actions
 */
export enum AuditAction {
  // Authentication events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL_DEVICES = 'LOGOUT_ALL_DEVICES',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REFRESH_FAILURE = 'TOKEN_REFRESH_FAILURE',

  // Password management
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET_REQUEST = 'PASSWORD_RESET_REQUEST',
  PASSWORD_RESET_SUCCESS = 'PASSWORD_RESET_SUCCESS',
  PASSWORD_RESET_FAILURE = 'PASSWORD_RESET_FAILURE',

  // Account lifecycle
  ACCOUNT_CREATED = 'ACCOUNT_CREATED',
  ACCOUNT_VERIFIED = 'ACCOUNT_VERIFIED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',
  ACCOUNT_DELETED = 'ACCOUNT_DELETED',

  // OAuth/Social authentication
  OAUTH_LINK = 'OAUTH_LINK',
  OAUTH_UNLINK = 'OAUTH_UNLINK',

  // Profile changes
  PROFILE_CREATED = 'PROFILE_CREATED',
  PROFILE_UPDATED = 'PROFILE_UPDATED',
  PROFILE_DELETED = 'PROFILE_DELETED',
  PHOTO_UPLOADED = 'PHOTO_UPLOADED',
  PHOTO_DELETED = 'PHOTO_DELETED',

  // Security events
  PERMISSION_CHANGE = 'PERMISSION_CHANGE',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  VERIFICATION_RESENT = 'VERIFICATION_RESENT',

  // Data access
  DATA_EXPORT = 'DATA_EXPORT',
  DATA_ACCESS = 'DATA_ACCESS',

  // Subscription events
  SUBSCRIPTION_CREATED = 'SUBSCRIPTION_CREATED',
  SUBSCRIPTION_UPDATED = 'SUBSCRIPTION_UPDATED',
  SUBSCRIPTION_CANCELLED = 'SUBSCRIPTION_CANCELLED',
}

/**
 * Resource types that can be audited
 */
export enum AuditResourceType {
  USER = 'user',
  PROFILE = 'profile',
  AUTH_CREDENTIAL = 'auth_credential',
  REFRESH_TOKEN = 'refresh_token',
  MATCH = 'match',
  MESSAGE = 'message',
  SUBSCRIPTION = 'subscription',
  PHOTO = 'photo',
  VERIFICATION = 'verification',
}

/**
 * Audit log entry structure
 */
export interface AuditLogEntry {
  userId?: string | null;
  action: AuditAction | string;
  resourceType?: AuditResourceType | string;
  resourceId?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
  success?: boolean;
  errorMessage?: string | null;
}

/**
 * Options for retrieving audit logs
 */
export interface AuditLogQueryOptions {
  limit?: number;
  offset?: number;
  action?: AuditAction | string;
  resourceType?: AuditResourceType | string;
  startDate?: Date;
  endDate?: Date;
  successOnly?: boolean;
  failuresOnly?: boolean;
}

/**
 * Stored audit log record with ID and timestamp
 */
export interface AuditLogRecord extends AuditLogEntry {
  id: string;
  createdAt: Date;
}

/**
 * Configuration options for AuditLogger
 */
export interface AuditLoggerOptions {
  pool: Pool;
  serviceName?: string;
  logger?: winston.Logger;
  enabled?: boolean;
}

// List of sensitive field names that should be redacted in audit logs
const SENSITIVE_FIELDS = [
  'password',
  'passwordHash',
  'password_hash',
  'newPassword',
  'currentPassword',
  'token',
  'accessToken',
  'refreshToken',
  'idToken',
  'identityToken',
  'resetToken',
  'verificationToken',
  'secret',
  'apiKey',
  'api_key',
  'privateKey',
  'private_key',
  'creditCard',
  'ssn',
  'nonce',
];

/**
 * Recursively redact sensitive fields from an object
 */
function redactSensitiveData(obj: unknown, depth = 0): unknown {
  if (depth > 5 || !obj || typeof obj !== 'object') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitiveData(item, depth + 1));
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((field) => lowerKey.includes(field.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitiveData(value, depth + 1);
    } else {
      redacted[key] = value;
    }
  }
  return redacted;
}

/**
 * AuditLogger class for comprehensive audit logging
 *
 * Usage:
 * ```typescript
 * const auditLogger = new AuditLogger({ pool, serviceName: 'auth-service' });
 *
 * // Log a successful login
 * await auditLogger.log({
 *   userId: 'user123',
 *   action: AuditAction.LOGIN_SUCCESS,
 *   resourceType: AuditResourceType.USER,
 *   resourceId: 'user123',
 *   ipAddress: req.ip,
 *   userAgent: req.headers['user-agent'],
 *   success: true,
 *   metadata: { provider: 'email' }
 * });
 *
 * // Log a password change with before/after
 * await auditLogger.log({
 *   userId: 'user123',
 *   action: AuditAction.PASSWORD_CHANGE,
 *   resourceType: AuditResourceType.AUTH_CREDENTIAL,
 *   resourceId: 'user123',
 *   oldValue: { hasPassword: true, lastChanged: '2024-01-01' },
 *   newValue: { hasPassword: true, lastChanged: '2024-12-27' },
 *   success: true
 * });
 * ```
 */
export class AuditLogger {
  private pool: Pool;
  private logger: winston.Logger;
  private enabled: boolean;
  private serviceName: string;

  constructor(options: AuditLoggerOptions) {
    this.pool = options.pool;
    this.serviceName = options.serviceName || 'vlvt';
    this.enabled = options.enabled !== false; // Enabled by default

    this.logger =
      options.logger ||
      createLogger({
        service: `${this.serviceName}-audit`,
        silent: process.env.NODE_ENV === 'test',
      });
  }

  /**
   * Log an audit entry to the database
   *
   * @param entry - The audit log entry to record
   * @param client - Optional database client for transaction support
   * @returns The ID of the created audit log entry
   */
  async log(entry: AuditLogEntry, client?: PoolClient): Promise<string | null> {
    if (!this.enabled) {
      this.logger.debug('Audit logging disabled, skipping', { action: entry.action });
      return null;
    }

    // Redact sensitive data from old/new values and metadata
    const sanitizedEntry = {
      ...entry,
      oldValue: entry.oldValue ? redactSensitiveData(entry.oldValue) : null,
      newValue: entry.newValue ? redactSensitiveData(entry.newValue) : null,
      metadata: entry.metadata ? redactSensitiveData(entry.metadata) : null,
    };

    const queryClient = client || this.pool;

    try {
      const result = await queryClient.query(
        `INSERT INTO audit_log (
          user_id, action, resource_type, resource_id,
          ip_address, user_agent, request_id,
          old_value, new_value, metadata,
          success, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id`,
        [
          sanitizedEntry.userId || null,
          sanitizedEntry.action,
          sanitizedEntry.resourceType || null,
          sanitizedEntry.resourceId || null,
          sanitizedEntry.ipAddress || null,
          sanitizedEntry.userAgent?.substring(0, 500) || null, // Truncate long user agents
          sanitizedEntry.requestId || null,
          sanitizedEntry.oldValue ? JSON.stringify(sanitizedEntry.oldValue) : null,
          sanitizedEntry.newValue ? JSON.stringify(sanitizedEntry.newValue) : null,
          sanitizedEntry.metadata ? JSON.stringify(sanitizedEntry.metadata) : null,
          sanitizedEntry.success !== false, // Default to true
          sanitizedEntry.errorMessage || null,
        ]
      );

      const auditId = result.rows[0].id;

      this.logger.debug('Audit log entry created', {
        auditId,
        action: entry.action,
        userId: entry.userId,
        success: entry.success !== false,
      });

      return auditId;
    } catch (error) {
      // Log the error but don't throw - audit logging should not break the main flow
      this.logger.error('Failed to create audit log entry', {
        error: error instanceof Error ? error.message : String(error),
        action: entry.action,
        userId: entry.userId,
      });
      return null;
    }
  }

  /**
   * Get audit logs for a specific user
   *
   * @param userId - The user ID to query logs for
   * @param options - Query options for filtering and pagination
   * @returns Array of audit log records
   */
  async getLogsForUser(
    userId: string,
    options: AuditLogQueryOptions = {}
  ): Promise<AuditLogRecord[]> {
    const {
      limit = 100,
      offset = 0,
      action,
      resourceType,
      startDate,
      endDate,
      successOnly,
      failuresOnly,
    } = options;

    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (resourceType) {
      conditions.push(`resource_type = $${paramIndex}`);
      params.push(resourceType);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (successOnly) {
      conditions.push('success = TRUE');
    } else if (failuresOnly) {
      conditions.push('success = FALSE');
    }

    params.push(limit, offset);

    const query = `
      SELECT
        id, created_at as "createdAt", user_id as "userId",
        action, resource_type as "resourceType", resource_id as "resourceId",
        ip_address as "ipAddress", user_agent as "userAgent", request_id as "requestId",
        old_value as "oldValue", new_value as "newValue", metadata,
        success, error_message as "errorMessage"
      FROM audit_log
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    try {
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to retrieve audit logs', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      throw error;
    }
  }

  /**
   * Get audit logs by action type
   *
   * @param action - The action type to filter by
   * @param options - Query options for filtering and pagination
   * @returns Array of audit log records
   */
  async getLogsByAction(
    action: AuditAction | string,
    options: AuditLogQueryOptions = {}
  ): Promise<AuditLogRecord[]> {
    const { limit = 100, offset = 0, startDate, endDate, successOnly, failuresOnly } = options;

    const conditions: string[] = ['action = $1'];
    const params: unknown[] = [action];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    if (successOnly) {
      conditions.push('success = TRUE');
    } else if (failuresOnly) {
      conditions.push('success = FALSE');
    }

    params.push(limit, offset);

    const query = `
      SELECT
        id, created_at as "createdAt", user_id as "userId",
        action, resource_type as "resourceType", resource_id as "resourceId",
        ip_address as "ipAddress", user_agent as "userAgent", request_id as "requestId",
        old_value as "oldValue", new_value as "newValue", metadata,
        success, error_message as "errorMessage"
      FROM audit_log
      WHERE ${conditions.join(' AND ')}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    try {
      const result = await this.pool.query(query, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to retrieve audit logs by action', {
        error: error instanceof Error ? error.message : String(error),
        action,
      });
      throw error;
    }
  }

  /**
   * Get audit log count for a user
   *
   * @param userId - The user ID to count logs for
   * @param options - Query options for filtering
   * @returns Count of audit log entries
   */
  async getLogCountForUser(
    userId: string,
    options: Pick<AuditLogQueryOptions, 'action' | 'startDate' | 'endDate'> = {}
  ): Promise<number> {
    const { action, startDate, endDate } = options;

    const conditions: string[] = ['user_id = $1'];
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (action) {
      conditions.push(`action = $${paramIndex}`);
      params.push(action);
      paramIndex++;
    }

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT COUNT(*) as count
      FROM audit_log
      WHERE ${conditions.join(' AND ')}
    `;

    try {
      const result = await this.pool.query(query, params);
      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      this.logger.error('Failed to count audit logs', {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      throw error;
    }
  }

  /**
   * Helper method to log authentication events with common patterns
   */
  async logAuthEvent(
    action: AuditAction,
    options: {
      userId?: string | null;
      email?: string;
      provider?: string;
      ipAddress?: string | null;
      userAgent?: string | null;
      success?: boolean;
      errorMessage?: string;
      metadata?: Record<string, unknown>;
    }
  ): Promise<string | null> {
    return this.log({
      userId: options.userId,
      action,
      resourceType: AuditResourceType.USER,
      resourceId: options.userId || undefined,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      success: options.success,
      errorMessage: options.errorMessage,
      metadata: {
        email: options.email,
        provider: options.provider,
        ...options.metadata,
      },
    });
  }

  /**
   * Helper method to log data changes with before/after values
   */
  async logDataChange(
    action: AuditAction,
    options: {
      userId: string;
      resourceType: AuditResourceType | string;
      resourceId: string;
      oldValue?: Record<string, unknown> | null;
      newValue?: Record<string, unknown> | null;
      ipAddress?: string | null;
      userAgent?: string | null;
      metadata?: Record<string, unknown>;
    }
  ): Promise<string | null> {
    return this.log({
      userId: options.userId,
      action,
      resourceType: options.resourceType,
      resourceId: options.resourceId,
      oldValue: options.oldValue,
      newValue: options.newValue,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      success: true,
      metadata: options.metadata,
    });
  }
}

/**
 * Create an AuditLogger instance
 */
export function createAuditLogger(options: AuditLoggerOptions): AuditLogger {
  return new AuditLogger(options);
}

export default AuditLogger;
