/**
 * Tests for Enhanced Error Code System
 *
 * Verifies:
 * - Error codes are properly defined with all required fields
 * - Public messages are generic and don't leak sensitive information
 * - Error response helper generates correlation IDs
 * - Logging includes detailed internal information
 * - HTTP status codes are appropriate
 * - Error categories are correctly identified
 * - CodedError class works correctly
 */

import { Response } from 'express';
import {
  ErrorCodes,
  AuthErrorCodes,
  ProfileErrorCodes,
  ChatErrorCodes,
  RateErrorCodes,
  ValidationErrorCodes,
  SystemErrorCodes,
  ErrorCategory,
  ErrorCodeDefinition,
  getErrorByCode,
  getErrorCategory,
  isAlertableError,
} from '../src/errors/error-codes';
import {
  sendErrorResponse,
  createErrorResponseSender,
  generateCorrelationId,
  CodedError,
  createCodedError,
  isCodedError,
  extractErrorDetails,
  ErrorLogger,
} from '../src/errors/error-response';

// Mock response factory
function createMockResponse(): Partial<Response> & {
  statusCode: number;
  jsonData: any;
  headers: Record<string, string>;
} {
  const res: any = {
    statusCode: 200,
    jsonData: null,
    headers: {},
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data: any) => {
    res.jsonData = data;
    return res;
  });
  res.setHeader = jest.fn((key: string, value: string) => {
    res.headers[key] = value;
    return res;
  });
  return res;
}

// Mock logger factory
function createMockLogger(): ErrorLogger & { calls: { level: string; message: string; meta: any }[] } {
  const calls: { level: string; message: string; meta: any }[] = [];
  return {
    calls,
    error: jest.fn((message: string, meta?: Record<string, unknown>) => {
      calls.push({ level: 'error', message, meta });
    }),
    warn: jest.fn((message: string, meta?: Record<string, unknown>) => {
      calls.push({ level: 'warn', message, meta });
    }),
    info: jest.fn((message: string, meta?: Record<string, unknown>) => {
      calls.push({ level: 'info', message, meta });
    }),
  };
}

describe('Error Codes', () => {
  describe('Error Code Structure', () => {
    it('should have all required fields for each error code', () => {
      const allCodes = Object.values(ErrorCodes);

      for (const errorDef of allCodes) {
        expect(errorDef.code).toBeDefined();
        expect(typeof errorDef.code).toBe('string');
        expect(errorDef.httpStatus).toBeDefined();
        expect(typeof errorDef.httpStatus).toBe('number');
        expect(errorDef.publicMessage).toBeDefined();
        expect(typeof errorDef.publicMessage).toBe('string');
        expect(errorDef.internalMessage).toBeDefined();
        expect(typeof errorDef.internalMessage).toBe('string');
      }
    });

    it('should have unique error codes', () => {
      const codes = Object.values(ErrorCodes).map((e) => e.code);
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should use valid HTTP status codes', () => {
      const validStatusCodes = [400, 401, 403, 404, 409, 423, 429, 500, 502, 503, 504];
      const allCodes = Object.values(ErrorCodes);

      for (const errorDef of allCodes) {
        expect(validStatusCodes).toContain(errorDef.httpStatus);
      }
    });
  });

  describe('Security - Information Leakage Prevention', () => {
    it('should have generic public messages for authentication errors', () => {
      // AUTH_INVALID_CREDENTIALS should not reveal if email or password was wrong
      expect(AuthErrorCodes.AUTH_INVALID_CREDENTIALS.publicMessage).toBe('Authentication failed');
      expect(AuthErrorCodes.AUTH_INVALID_CREDENTIALS.publicMessage).not.toContain('password');
      expect(AuthErrorCodes.AUTH_INVALID_CREDENTIALS.publicMessage).not.toContain('email');
      expect(AuthErrorCodes.AUTH_INVALID_CREDENTIALS.publicMessage).not.toContain('user');
    });

    it('should have generic public messages for token errors', () => {
      // Don't reveal token-specific details
      expect(AuthErrorCodes.AUTH_TOKEN_INVALID.publicMessage).toBe('Authentication failed');
      expect(AuthErrorCodes.AUTH_REFRESH_INVALID.publicMessage).toBe('Session expired');
    });

    it('should have generic public messages for profile not found', () => {
      // Don't reveal that a specific user doesn't exist
      expect(ProfileErrorCodes.PROFILE_NOT_FOUND.publicMessage).toBe('Resource not found');
      expect(ProfileErrorCodes.PROFILE_NOT_FOUND.publicMessage).not.toContain('user');
      expect(ProfileErrorCodes.PROFILE_NOT_FOUND.publicMessage).not.toContain('profile');
    });

    it('should have generic public messages for chat/match errors', () => {
      // Don't reveal blocking status
      expect(ChatErrorCodes.CHAT_USER_BLOCKED.publicMessage).toBe('Action not allowed');
      expect(ChatErrorCodes.CHAT_USER_BLOCKED.publicMessage).not.toContain('block');
    });

    it('should have generic public messages for system errors', () => {
      // Don't reveal internal system details
      expect(SystemErrorCodes.SYS_INTERNAL_ERROR.publicMessage).toBe('An unexpected error occurred');
      expect(SystemErrorCodes.SYS_DATABASE_ERROR.publicMessage).toBe('An unexpected error occurred');
      expect(SystemErrorCodes.SYS_DATABASE_ERROR.publicMessage).not.toContain('database');
    });

    it('internal messages should contain more detail than public messages', () => {
      const allCodes = Object.values(ErrorCodes);

      for (const errorDef of allCodes) {
        // Internal messages should provide more information
        // (either longer or contain different keywords)
        const publicWords = errorDef.publicMessage.toLowerCase().split(/\s+/);
        const internalWords = errorDef.internalMessage.toLowerCase().split(/\s+/);

        // Either internal is longer or contains different words
        const isDifferent =
          internalWords.length > publicWords.length ||
          internalWords.some((w) => !publicWords.includes(w));

        expect(isDifferent).toBe(true);
      }
    });
  });

  describe('Error Categories', () => {
    it('should have correct category prefixes for auth errors', () => {
      for (const [key, def] of Object.entries(AuthErrorCodes)) {
        expect(def.code.startsWith('AUTH_')).toBe(true);
      }
    });

    it('should have correct category prefixes for profile errors', () => {
      for (const [key, def] of Object.entries(ProfileErrorCodes)) {
        expect(def.code.startsWith('PROFILE_')).toBe(true);
      }
    });

    it('should have correct category prefixes for chat errors', () => {
      for (const [key, def] of Object.entries(ChatErrorCodes)) {
        expect(def.code.startsWith('CHAT_')).toBe(true);
      }
    });

    it('should have correct category prefixes for rate errors', () => {
      for (const [key, def] of Object.entries(RateErrorCodes)) {
        expect(def.code.startsWith('RATE_')).toBe(true);
      }
    });

    it('should have correct category prefixes for validation errors', () => {
      for (const [key, def] of Object.entries(ValidationErrorCodes)) {
        expect(def.code.startsWith('VAL_')).toBe(true);
      }
    });

    it('should have correct category prefixes for system errors', () => {
      for (const [key, def] of Object.entries(SystemErrorCodes)) {
        expect(def.code.startsWith('SYS_')).toBe(true);
      }
    });
  });

  describe('getErrorByCode()', () => {
    it('should find error by code string', () => {
      const error = getErrorByCode('AUTH_001');
      expect(error).toBeDefined();
      expect(error?.code).toBe('AUTH_001');
      expect(error?.publicMessage).toBe('Authentication failed');
    });

    it('should return undefined for unknown code', () => {
      const error = getErrorByCode('UNKNOWN_999');
      expect(error).toBeUndefined();
    });
  });

  describe('getErrorCategory()', () => {
    it('should extract AUTH category', () => {
      expect(getErrorCategory('AUTH_001')).toBe('AUTH');
    });

    it('should extract PROFILE category', () => {
      expect(getErrorCategory('PROFILE_001')).toBe('PROFILE');
    });

    it('should return undefined for unknown category', () => {
      expect(getErrorCategory('UNKNOWN_001')).toBeUndefined();
    });
  });

  describe('isAlertableError()', () => {
    it('should identify alertable errors', () => {
      expect(isAlertableError(AuthErrorCodes.AUTH_ACCOUNT_LOCKED)).toBe(true);
      expect(isAlertableError(SystemErrorCodes.SYS_INTERNAL_ERROR)).toBe(true);
      expect(isAlertableError(SystemErrorCodes.SYS_DATABASE_ERROR)).toBe(true);
    });

    it('should identify non-alertable errors', () => {
      expect(isAlertableError(AuthErrorCodes.AUTH_INVALID_CREDENTIALS)).toBe(false);
      expect(isAlertableError(ValidationErrorCodes.VAL_INVALID_INPUT)).toBe(false);
    });
  });
});

describe('Error Response', () => {
  describe('generateCorrelationId()', () => {
    it('should generate unique correlation IDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate IDs with correct format', () => {
      const id = generateCorrelationId();
      // Format: err-timestamp-random
      expect(id).toMatch(/^err-\d+-[a-f0-9]{8}$/);
    });
  });

  describe('sendErrorResponse()', () => {
    it('should send correct HTTP status code', () => {
      const res = createMockResponse();
      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('should include error code in response', () => {
      const res = createMockResponse();
      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(res.jsonData.code).toBe('AUTH_001');
    });

    it('should include public message (not internal)', () => {
      const res = createMockResponse();
      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(res.jsonData.message).toBe('Authentication failed');
      expect(res.jsonData.message).not.toBe('Invalid credentials provided');
    });

    it('should include correlation ID in response', () => {
      const res = createMockResponse();
      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(res.jsonData.correlationId).toBeDefined();
      expect(res.jsonData.correlationId).toMatch(/^err-\d+-[a-f0-9]{8}$/);
    });

    it('should include timestamp in response', () => {
      const res = createMockResponse();
      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(res.jsonData.timestamp).toBeDefined();
      expect(new Date(res.jsonData.timestamp).getTime()).not.toBeNaN();
    });

    it('should set X-Correlation-ID header', () => {
      const res = createMockResponse();
      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(res.headers['X-Correlation-ID']).toBeDefined();
      expect(res.headers['X-Correlation-ID']).toMatch(/^err-\d+-[a-f0-9]{8}$/);
    });

    it('should log with internal message', () => {
      const res = createMockResponse();
      const logger = createMockLogger();

      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS, undefined, {
        logger,
      });

      expect(logger.warn).toHaveBeenCalled();
      expect(logger.calls[0].message).toContain('AUTH_001');
      expect(logger.calls[0].message).toContain('Invalid credentials provided');
    });

    it('should log at error level for 5xx errors', () => {
      const res = createMockResponse();
      const logger = createMockLogger();

      sendErrorResponse(res as Response, ErrorCodes.SYS_INTERNAL_ERROR, undefined, {
        logger,
      });

      expect(logger.error).toHaveBeenCalled();
    });

    it('should log at warn level for 4xx errors', () => {
      const res = createMockResponse();
      const logger = createMockLogger();

      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS, undefined, {
        logger,
      });

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should include original error in logs but not response', () => {
      const res = createMockResponse();
      const logger = createMockLogger();
      const originalError = new Error('Database connection failed');

      sendErrorResponse(res as Response, ErrorCodes.SYS_DATABASE_ERROR, originalError, {
        logger,
      });

      // Response should not contain original error
      expect(res.jsonData.details).toBeUndefined();

      // Log should contain original error
      expect(logger.calls[0].meta.originalError).toBeDefined();
      expect(logger.calls[0].meta.originalError.message).toBe('Database connection failed');
    });

    it('should include log context in logs', () => {
      const res = createMockResponse();
      const logger = createMockLogger();

      sendErrorResponse(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS, undefined, {
        logger,
        userId: 'user-123',
        path: '/auth/login',
        method: 'POST',
        logContext: { attemptedEmail: 'test@example.com' },
      });

      expect(logger.calls[0].meta.userId).toBe('user-123');
      expect(logger.calls[0].meta.path).toBe('/auth/login');
      expect(logger.calls[0].meta.method).toBe('POST');
      expect(logger.calls[0].meta.attemptedEmail).toBe('test@example.com');
    });

    it('should set Retry-After header for rate limit errors', () => {
      const res = createMockResponse();

      sendErrorResponse(res as Response, ErrorCodes.RATE_LIMIT_EXCEEDED, undefined, {
        retryAfter: 60,
      });

      expect(res.headers['Retry-After']).toBe('60');
      expect(res.jsonData.retryAfter).toBe(60);
    });

    it('should not include details by default', () => {
      const res = createMockResponse();
      const originalError = new Error('Secret internal error');

      sendErrorResponse(res as Response, ErrorCodes.SYS_INTERNAL_ERROR, originalError);

      expect(res.jsonData.details).toBeUndefined();
    });
  });

  describe('createErrorResponseSender()', () => {
    it('should create a sender with preset options', () => {
      const logger = createMockLogger();
      const sendError = createErrorResponseSender({ logger });

      const res = createMockResponse();
      sendError(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(logger.warn).toHaveBeenCalled();
    });

    it('should allow overriding options', () => {
      const defaultLogger = createMockLogger();
      const overrideLogger = createMockLogger();
      const sendError = createErrorResponseSender({ logger: defaultLogger });

      const res = createMockResponse();
      sendError(res as Response, ErrorCodes.AUTH_INVALID_CREDENTIALS, undefined, {
        logger: overrideLogger,
      });

      expect(overrideLogger.warn).toHaveBeenCalled();
      expect(defaultLogger.warn).not.toHaveBeenCalled();
    });
  });

  describe('CodedError', () => {
    it('should create an error with error definition', () => {
      const codedError = new CodedError(ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(codedError.name).toBe('CodedError');
      expect(codedError.message).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS.internalMessage);
      expect(codedError.errorDef).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
    });

    it('should preserve original error stack', () => {
      const originalError = new Error('Original error');
      const codedError = new CodedError(ErrorCodes.SYS_DATABASE_ERROR, originalError);

      expect(codedError.stack).toBe(originalError.stack);
      expect(codedError.originalError).toBe(originalError);
    });

    it('should include log context', () => {
      const codedError = new CodedError(
        ErrorCodes.AUTH_INVALID_CREDENTIALS,
        undefined,
        { attemptedEmail: 'test@example.com' }
      );

      expect(codedError.logContext).toEqual({ attemptedEmail: 'test@example.com' });
    });
  });

  describe('createCodedError()', () => {
    it('should create CodedError instance', () => {
      const error = createCodedError(ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(error).toBeInstanceOf(CodedError);
      expect(error.errorDef).toBe(ErrorCodes.AUTH_INVALID_CREDENTIALS);
    });
  });

  describe('isCodedError()', () => {
    it('should identify CodedError instances', () => {
      const codedError = new CodedError(ErrorCodes.AUTH_INVALID_CREDENTIALS);
      const regularError = new Error('Regular error');

      expect(isCodedError(codedError)).toBe(true);
      expect(isCodedError(regularError)).toBe(false);
      expect(isCodedError(null)).toBe(false);
      expect(isCodedError(undefined)).toBe(false);
    });
  });

  describe('extractErrorDetails()', () => {
    it('should extract code, message, and status', () => {
      const details = extractErrorDetails(ErrorCodes.AUTH_INVALID_CREDENTIALS);

      expect(details.code).toBe('AUTH_001');
      expect(details.message).toBe('Authentication failed');
      expect(details.httpStatus).toBe(401);
    });
  });
});

describe('Error Code Coverage', () => {
  describe('Authentication Errors', () => {
    it('should have all essential auth error codes', () => {
      expect(AuthErrorCodes.AUTH_INVALID_CREDENTIALS).toBeDefined();
      expect(AuthErrorCodes.AUTH_TOKEN_MISSING).toBeDefined();
      expect(AuthErrorCodes.AUTH_TOKEN_INVALID).toBeDefined();
      expect(AuthErrorCodes.AUTH_TOKEN_EXPIRED).toBeDefined();
      expect(AuthErrorCodes.AUTH_REFRESH_INVALID).toBeDefined();
      expect(AuthErrorCodes.AUTH_ACCOUNT_LOCKED).toBeDefined();
      expect(AuthErrorCodes.AUTH_EMAIL_NOT_VERIFIED).toBeDefined();
      expect(AuthErrorCodes.AUTH_PROVIDER_ERROR).toBeDefined();
      expect(AuthErrorCodes.AUTH_FORBIDDEN).toBeDefined();
    });
  });

  describe('Rate Limit Errors', () => {
    it('should have rate limit errors with 429 status', () => {
      for (const def of Object.values(RateErrorCodes)) {
        expect(def.httpStatus).toBe(429);
      }
    });
  });

  describe('System Errors', () => {
    it('should have most system errors with 5xx status (except SYS_NOT_FOUND)', () => {
      for (const [key, def] of Object.entries(SystemErrorCodes)) {
        if (key === 'SYS_NOT_FOUND') {
          expect(def.httpStatus).toBe(404); // SYS_NOT_FOUND is 404
        } else {
          expect(def.httpStatus).toBeGreaterThanOrEqual(500);
        }
      }
    });

    it('should have 5xx system errors be alertable', () => {
      // Only check errors with 5xx status codes
      const fiveXXErrors = Object.values(SystemErrorCodes).filter(
        (def) => def.httpStatus >= 500
      );

      for (const def of fiveXXErrors) {
        // All 5xx system errors should be alertable
        expect(isAlertableError(def)).toBe(true);
      }
    });
  });
});
