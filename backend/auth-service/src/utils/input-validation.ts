import { Request, Response, NextFunction } from 'express';
import logger from './logger';

/**
 * Input validation and sanitization utilities
 * Critical security component to prevent SQL injection and XSS attacks
 */

// SQL injection pattern detection
const SQL_INJECTION_PATTERNS = [
  /(\b(ALTER|CREATE|DELETE|DROP|EXEC(UTE)?|INSERT( +INTO)?|MERGE|SELECT|UPDATE|UNION( +ALL)?)\b)/i,
  /(\b(OR\b|AND\b)[\s]*[0-9]+[\s]*=[\s]*[0-9]+)/i,
  /(\b(OR\b|AND\b)[\s]*[a-zA-Z0-9_]+[\s]*=[\s]*[a-zA-Z0-9_]+)/i,
  /(--|#|\/\*|\*\/)/,
  /(\b(WAITFOR|DELAY|SHUTDOWN|TRUNCATE|GRANT|REVOKE|COMMIT|ROLLBACK)\b)/i,
  /(\b(CHAR|VARCHAR|NCHAR|NVARCHAR|CAST|CONVERT)\b[\s]*\(/i,
  /(\b(DECLARE|EXECUTE|EXEC|XP_)\b)/i,
  /(\b(BENCHMARK|SLEEP|GETDATE|CURRENT_USER|SYSTEM_USER|USER|SESSION_USER|DB_NAME)\b)/i,
  /(\b(LOAD_FILE|INTO\s+(OUTFILE|DUMPFILE))\b)/i
];

// XSS pattern detection
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i,
  /<[^>]+on\w+\s*=/i,
  /javascript:/i,
  /vbscript:/i,
  /expression\s*\(/i,
  /eval\s*\(/i,
  /document\.cookie/i,
  /window\.location/i,
  /<[^>]+style\s*=/i,
  /<[^>]+href\s*=/i,
  /<[^>]+src\s*=/i
];

/**
 * Validate and sanitize string input
 * @param input String to validate
 * @param fieldName Name of the field for logging
 * @returns Sanitized string or throws error
 */
export function validateAndSanitizeString(input: string, fieldName: string): string {
  if (typeof input !== 'string') {
    logger.warn(`Input validation failed: ${fieldName} is not a string`, { input });
    throw new Error(`Invalid input: ${fieldName} must be a string`);
  }

  // Check for SQL injection patterns
  for (const pattern of SQL_INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      logger.error(`SQL injection attempt detected in ${fieldName}`, {
        input: input.substring(0, 50) + '...',
        pattern: pattern.toString()
      });
      throw new Error(`Invalid input: ${fieldName} contains suspicious characters`);
    }
  }

  // Check for XSS patterns
  for (const pattern of XSS_PATTERNS) {
    if (pattern.test(input)) {
      logger.error(`XSS attempt detected in ${fieldName}`, {
        input: input.substring(0, 50) + '...',
        pattern: pattern.toString()
      });
      throw new Error(`Invalid input: ${fieldName} contains suspicious content`);
    }
  }

  // Basic sanitization - remove potentially dangerous characters
  // Note: This is in addition to parameterized queries, not a replacement
  const sanitized = input
    .replace(/--/g, '')          // Remove SQL comments
    .replace(/#/g, '')           // Remove hash comments
    .replace(/\/\*.*?\*\//g, '')  // Remove block comments
    .trim();

  return sanitized;
}

/**
 * Validate email format with enhanced security
 * @param email Email to validate
 * @returns Validated email
 */
export function validateEmail(email: string): string {
  const sanitized = validateAndSanitizeString(email, 'email');

  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(sanitized)) {
    logger.warn('Invalid email format', { email: sanitized });
    throw new Error('Invalid email format');
  }

  // Additional security: prevent potentially dangerous domains
  const dangerousDomains = ['localhost', '127.0.0.1', '0.0.0.0'];
  const domain = sanitized.split('@')[1];
  if (dangerousDomains.some(d => domain.includes(d))) {
    logger.warn('Potentially dangerous email domain', { email: sanitized });
    throw new Error('Invalid email domain');
  }

  return sanitized.toLowerCase();
}

/**
 * Validate user ID format
 * @param userId User ID to validate
 * @returns Validated user ID
 */
export function validateUserId(userId: string): string {
  const sanitized = validateAndSanitizeString(userId, 'userId');

  // User IDs should follow specific patterns based on provider
  const validPatterns = [
    /^google_[a-zA-Z0-9_-]+$/,    // Google user IDs
    /^apple_[a-zA-Z0-9_-]+$/,    // Apple user IDs
    /^email_[a-zA-Z0-9_-]+$/,    // Email user IDs
    /^instagram_[a-zA-Z0-9_-]+$/ // Instagram user IDs
  ];

  if (!validPatterns.some(pattern => pattern.test(sanitized))) {
    logger.warn('Invalid user ID format', { userId: sanitized });
    throw new Error('Invalid user ID format');
  }

  return sanitized;
}

/**
 * Validate and sanitize object input
 * @param obj Object to validate
 * @param fieldName Name of the field for logging
 * @returns Sanitized object
 */
export function validateAndSanitizeObject(obj: any, fieldName: string): any {
  if (typeof obj !== 'object' || obj === null) {
    logger.warn(`Input validation failed: ${fieldName} is not an object`, { input: obj });
    throw new Error(`Invalid input: ${fieldName} must be an object`);
  }

  // Recursively validate object properties
  const sanitized: any = {};
  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      sanitized[key] = validateAndSanitizeString(value, `${fieldName}.${key}`);
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = validateAndSanitizeObject(value, `${fieldName}.${key}`);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Express middleware for input validation
 */
export function validateInputMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    // Validate query parameters
    if (req.query && Object.keys(req.query).length > 0) {
      req.query = validateAndSanitizeObject(req.query, 'query');
    }

    // Validate body
    if (req.body && Object.keys(req.body).length > 0) {
      req.body = validateAndSanitizeObject(req.body, 'body');
    }

    // Validate params
    if (req.params && Object.keys(req.params).length > 0) {
      req.params = validateAndSanitizeObject(req.params, 'params');
    }

    next();
  } catch (error) {
    logger.error('Input validation failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      path: req.path,
      method: req.method
    });
    res.status(400).json({
      success: false,
      error: 'Invalid input data',
      code: 'VALIDATION_ERROR'
    });
  }
}

/**
 * Validate array input
 * @param array Array to validate
 * @param fieldName Name of the field for logging
 * @returns Validated array
 */
export function validateArray(array: any[], fieldName: string): any[] {
  if (!Array.isArray(array)) {
    logger.warn(`Input validation failed: ${fieldName} is not an array`, { input: array });
    throw new Error(`Invalid input: ${fieldName} must be an array`);
  }

  // Validate each array element
  return array.map((item, index) => {
    if (typeof item === 'string') {
      return validateAndSanitizeString(item, `${fieldName}[${index}]`);
    } else if (typeof item === 'object' && item !== null) {
      return validateAndSanitizeObject(item, `${fieldName}[${index}]`);
    }
    return item;
  });
}