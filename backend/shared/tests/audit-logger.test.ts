/**
 * Tests for AuditLogger
 *
 * Verifies:
 * - Logging authentication events
 * - Logging data changes with before/after values
 * - Retrieval by user ID
 * - Sensitive data redaction
 */

import {
  AuditLogger,
  AuditAction,
  AuditResourceType,
  AuditLogEntry,
  createAuditLogger,
} from '../src/utils/audit-logger';

// Mock the pg Pool
const mockQuery = jest.fn();
const mockPool = {
  query: mockQuery,
  connect: jest.fn(),
  end: jest.fn(),
  on: jest.fn(),
} as any;

// Mock winston logger
jest.mock('../src/utils/logger', () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  })),
}));

describe('AuditLogger', () => {
  let auditLogger: AuditLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    auditLogger = new AuditLogger({
      pool: mockPool,
      serviceName: 'test-service',
    });
  });

  describe('log()', () => {
    it('should log a successful login event', async () => {
      const mockId = '123e4567-e89b-12d3-a456-426614174000';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockId }] });

      const entry: AuditLogEntry = {
        userId: 'user123',
        action: AuditAction.LOGIN_SUCCESS,
        resourceType: AuditResourceType.USER,
        resourceId: 'user123',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        success: true,
        metadata: { provider: 'email' },
      };

      const result = await auditLogger.log(entry);

      expect(result).toBe(mockId);
      expect(mockQuery).toHaveBeenCalledTimes(1);

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('INSERT INTO audit_log');
      expect(params[0]).toBe('user123'); // user_id
      expect(params[1]).toBe(AuditAction.LOGIN_SUCCESS); // action
      expect(params[2]).toBe(AuditResourceType.USER); // resource_type
      expect(params[10]).toBe(true); // success
    });

    it('should log a failed login event', async () => {
      const mockId = '123e4567-e89b-12d3-a456-426614174001';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockId }] });

      const entry: AuditLogEntry = {
        userId: null,
        action: AuditAction.LOGIN_FAILURE,
        resourceType: AuditResourceType.USER,
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        success: false,
        errorMessage: 'Invalid email or password',
        metadata: { email: 'test@example.com', provider: 'email' },
      };

      const result = await auditLogger.log(entry);

      expect(result).toBe(mockId);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBeNull(); // user_id null for failed login
      expect(params[1]).toBe(AuditAction.LOGIN_FAILURE);
      expect(params[10]).toBe(false); // success
      expect(params[11]).toBe('Invalid email or password'); // error_message
    });

    it('should log password change with before/after values', async () => {
      const mockId = '123e4567-e89b-12d3-a456-426614174002';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockId }] });

      const entry: AuditLogEntry = {
        userId: 'user123',
        action: AuditAction.PASSWORD_CHANGE,
        resourceType: AuditResourceType.AUTH_CREDENTIAL,
        resourceId: 'user123',
        oldValue: { credentialExists: true, lastChanged: '2024-01-01' },
        newValue: { credentialExists: true, lastChanged: '2024-12-27' },
        success: true,
      };

      const result = await auditLogger.log(entry);

      expect(result).toBe(mockId);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[1]).toBe(AuditAction.PASSWORD_CHANGE);
      expect(JSON.parse(params[7])).toEqual({ credentialExists: true, lastChanged: '2024-01-01' });
      expect(JSON.parse(params[8])).toEqual({ credentialExists: true, lastChanged: '2024-12-27' });
    });

    it('should redact sensitive data in old/new values', async () => {
      const mockId = '123e4567-e89b-12d3-a456-426614174003';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockId }] });

      const entry: AuditLogEntry = {
        userId: 'user123',
        action: AuditAction.PASSWORD_CHANGE,
        resourceType: AuditResourceType.AUTH_CREDENTIAL,
        resourceId: 'user123',
        oldValue: { password: 'old-secret-password', email: 'user@test.com' },
        newValue: { password: 'new-secret-password', email: 'user@test.com' },
        metadata: { token: 'jwt-token-here', provider: 'email' },
        success: true,
      };

      await auditLogger.log(entry);

      const [, params] = mockQuery.mock.calls[0];

      // Check old_value is redacted
      const oldValue = JSON.parse(params[7]);
      expect(oldValue.password).toBe('[REDACTED]');
      expect(oldValue.email).toBe('user@test.com');

      // Check new_value is redacted
      const newValue = JSON.parse(params[8]);
      expect(newValue.password).toBe('[REDACTED]');

      // Check metadata is redacted
      const metadata = JSON.parse(params[9]);
      expect(metadata.token).toBe('[REDACTED]');
      expect(metadata.provider).toBe('email');
    });

    it('should redact nested sensitive data', async () => {
      const mockId = '123e4567-e89b-12d3-a456-426614174004';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockId }] });

      const entry: AuditLogEntry = {
        userId: 'user123',
        action: AuditAction.ACCOUNT_CREATED,
        resourceType: AuditResourceType.USER,
        resourceId: 'user123',
        newValue: {
          email: 'user@test.com',
          credentials: {
            passwordHash: 'hashed-password',
            refreshToken: 'token-value',
          },
        },
        success: true,
      };

      await auditLogger.log(entry);

      const [, params] = mockQuery.mock.calls[0];
      const newValue = JSON.parse(params[8]);
      expect(newValue.credentials.passwordHash).toBe('[REDACTED]');
      expect(newValue.credentials.refreshToken).toBe('[REDACTED]');
      expect(newValue.email).toBe('user@test.com');
    });

    it('should truncate long user agent strings', async () => {
      const mockId = '123e4567-e89b-12d3-a456-426614174005';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockId }] });

      const longUserAgent = 'A'.repeat(1000);

      const entry: AuditLogEntry = {
        userId: 'user123',
        action: AuditAction.LOGIN_SUCCESS,
        userAgent: longUserAgent,
        success: true,
      };

      await auditLogger.log(entry);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[5].length).toBe(500); // Truncated to 500 chars
    });

    it('should handle database errors gracefully', async () => {
      mockQuery.mockRejectedValueOnce(new Error('Database connection failed'));

      const entry: AuditLogEntry = {
        userId: 'user123',
        action: AuditAction.LOGIN_SUCCESS,
        success: true,
      };

      const result = await auditLogger.log(entry);

      // Should return null instead of throwing
      expect(result).toBeNull();
    });

    it('should skip logging when disabled', async () => {
      const disabledLogger = new AuditLogger({
        pool: mockPool,
        enabled: false,
      });

      const entry: AuditLogEntry = {
        userId: 'user123',
        action: AuditAction.LOGIN_SUCCESS,
        success: true,
      };

      const result = await disabledLogger.log(entry);

      expect(result).toBeNull();
      expect(mockQuery).not.toHaveBeenCalled();
    });
  });

  describe('getLogsForUser()', () => {
    it('should retrieve logs for a user', async () => {
      const mockLogs = [
        {
          id: 'log1',
          createdAt: new Date(),
          userId: 'user123',
          action: AuditAction.LOGIN_SUCCESS,
          resourceType: AuditResourceType.USER,
          resourceId: 'user123',
          ipAddress: '192.168.1.1',
          userAgent: 'Mozilla/5.0',
          success: true,
        },
        {
          id: 'log2',
          createdAt: new Date(),
          userId: 'user123',
          action: AuditAction.PASSWORD_CHANGE,
          resourceType: AuditResourceType.AUTH_CREDENTIAL,
          resourceId: 'user123',
          success: true,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockLogs });

      const result = await auditLogger.getLogsForUser('user123');

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe(AuditAction.LOGIN_SUCCESS);
      expect(result[1].action).toBe(AuditAction.PASSWORD_CHANGE);

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('WHERE user_id = $1');
      expect(params[0]).toBe('user123');
    });

    it('should filter logs by action', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await auditLogger.getLogsForUser('user123', {
        action: AuditAction.LOGIN_SUCCESS,
      });

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('action = $2');
      expect(params[1]).toBe(AuditAction.LOGIN_SUCCESS);
    });

    it('should filter logs by date range', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-12-31');

      await auditLogger.getLogsForUser('user123', {
        startDate,
        endDate,
      });

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('created_at >= $2');
      expect(query).toContain('created_at <= $3');
      expect(params[1]).toEqual(startDate);
      expect(params[2]).toEqual(endDate);
    });

    it('should filter for failures only', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await auditLogger.getLogsForUser('user123', {
        failuresOnly: true,
      });

      const [query] = mockQuery.mock.calls[0];
      expect(query).toContain('success = FALSE');
    });

    it('should respect pagination options', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });

      await auditLogger.getLogsForUser('user123', {
        limit: 50,
        offset: 100,
      });

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('LIMIT $2 OFFSET $3');
      expect(params[1]).toBe(50);
      expect(params[2]).toBe(100);
    });
  });

  describe('getLogsByAction()', () => {
    it('should retrieve logs by action type', async () => {
      const mockLogs = [
        {
          id: 'log1',
          createdAt: new Date(),
          userId: 'user123',
          action: AuditAction.LOGIN_FAILURE,
          success: false,
        },
        {
          id: 'log2',
          createdAt: new Date(),
          userId: 'user456',
          action: AuditAction.LOGIN_FAILURE,
          success: false,
        },
      ];

      mockQuery.mockResolvedValueOnce({ rows: mockLogs });

      const result = await auditLogger.getLogsByAction(AuditAction.LOGIN_FAILURE);

      expect(result).toHaveLength(2);
      expect(result[0].action).toBe(AuditAction.LOGIN_FAILURE);

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('WHERE action = $1');
      expect(params[0]).toBe(AuditAction.LOGIN_FAILURE);
    });
  });

  describe('getLogCountForUser()', () => {
    it('should return count of logs for a user', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '42' }] });

      const result = await auditLogger.getLogCountForUser('user123');

      expect(result).toBe(42);

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('SELECT COUNT(*)');
      expect(query).toContain('WHERE user_id = $1');
      expect(params[0]).toBe('user123');
    });

    it('should filter count by action', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ count: '10' }] });

      const result = await auditLogger.getLogCountForUser('user123', {
        action: AuditAction.LOGIN_SUCCESS,
      });

      expect(result).toBe(10);

      const [query, params] = mockQuery.mock.calls[0];
      expect(query).toContain('action = $2');
      expect(params[1]).toBe(AuditAction.LOGIN_SUCCESS);
    });
  });

  describe('logAuthEvent()', () => {
    it('should log auth event with helper method', async () => {
      const mockId = '123e4567-e89b-12d3-a456-426614174006';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockId }] });

      const result = await auditLogger.logAuthEvent(AuditAction.LOGIN_SUCCESS, {
        userId: 'user123',
        email: 'user@test.com',
        provider: 'email',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        success: true,
      });

      expect(result).toBe(mockId);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('user123');
      expect(params[1]).toBe(AuditAction.LOGIN_SUCCESS);
      expect(params[2]).toBe(AuditResourceType.USER);

      // Check metadata contains email and provider
      const metadata = JSON.parse(params[9]);
      expect(metadata.email).toBe('user@test.com');
      expect(metadata.provider).toBe('email');
    });
  });

  describe('logDataChange()', () => {
    it('should log data change with helper method', async () => {
      const mockId = '123e4567-e89b-12d3-a456-426614174007';
      mockQuery.mockResolvedValueOnce({ rows: [{ id: mockId }] });

      const result = await auditLogger.logDataChange(AuditAction.PROFILE_UPDATED, {
        userId: 'user123',
        resourceType: AuditResourceType.PROFILE,
        resourceId: 'profile123',
        oldValue: { bio: 'Old bio' },
        newValue: { bio: 'New bio' },
      });

      expect(result).toBe(mockId);

      const [, params] = mockQuery.mock.calls[0];
      expect(params[0]).toBe('user123');
      expect(params[1]).toBe(AuditAction.PROFILE_UPDATED);
      expect(params[2]).toBe(AuditResourceType.PROFILE);
      expect(params[3]).toBe('profile123');
      expect(JSON.parse(params[7])).toEqual({ bio: 'Old bio' });
      expect(JSON.parse(params[8])).toEqual({ bio: 'New bio' });
    });
  });

  describe('createAuditLogger()', () => {
    it('should create an AuditLogger instance', () => {
      const logger = createAuditLogger({
        pool: mockPool,
        serviceName: 'test-service',
      });

      expect(logger).toBeInstanceOf(AuditLogger);
    });
  });
});
