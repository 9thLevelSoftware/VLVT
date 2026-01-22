/**
 * After Hours Authorization Middleware
 *
 * Gates After Hours endpoints behind THREE required conditions:
 * 1. Premium subscription (active, not expired)
 * 2. ID verification (id_verified = true)
 * 3. GDPR consent for location sharing (after_hours_consent = true)
 *
 * SECURITY: This middleware FAILS CLOSED - any error results in denial.
 * All checks are server-side and cannot be bypassed by client.
 */

import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';

export interface AfterHoursAuthOptions {
  /** PostgreSQL connection pool */
  pool: Pool;
  /** Optional logger (defaults to console) */
  logger?: {
    info: (message: string, meta?: object) => void;
    error: (message: string, meta?: object) => void;
  };
}

/**
 * Factory function to create After Hours authorization middleware
 *
 * @param options - Configuration options including database pool and logger
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * const afterHoursAuth = createAfterHoursAuthMiddleware({ pool, logger });
 * app.use('/api/after-hours', authMiddleware, afterHoursAuth);
 * ```
 */
export const createAfterHoursAuthMiddleware = (options: AfterHoursAuthOptions) => {
  const { pool, logger = console } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const userId = req.user?.userId;

    // Check 0: User must be authenticated first
    if (!userId) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED'
      });
      return;
    }

    try {
      // Check 1: Premium subscription (SECURITY: fail closed)
      // Query for active, non-expired subscription
      const subscriptionResult = await pool.query(
        `SELECT is_active, expires_at FROM user_subscriptions
         WHERE user_id = $1 AND is_active = true
         AND (expires_at IS NULL OR expires_at > NOW())
         ORDER BY expires_at DESC NULLS FIRST
         LIMIT 1`,
        [userId]
      );

      if (subscriptionResult.rows.length === 0) {
        logger.info('After Hours access denied: no active subscription', { userId });
        res.status(403).json({
          success: false,
          error: 'Premium subscription required for After Hours Mode',
          code: 'PREMIUM_REQUIRED',
          upgrade: true
        });
        return;
      }

      // Check 2: ID Verification (SECURITY: fail closed)
      const verificationResult = await pool.query(
        `SELECT id_verified FROM users WHERE id = $1`,
        [userId]
      );

      if (!verificationResult.rows[0]?.id_verified) {
        logger.info('After Hours access denied: not verified', { userId });
        res.status(403).json({
          success: false,
          error: 'ID verification required for After Hours Mode',
          code: 'VERIFICATION_REQUIRED',
          requiresVerification: true
        });
        return;
      }

      // Check 3: GDPR Consent for After Hours location sharing (SECURITY: fail closed)
      const consentResult = await pool.query(
        `SELECT after_hours_consent FROM users WHERE id = $1`,
        [userId]
      );

      if (!consentResult.rows[0]?.after_hours_consent) {
        logger.info('After Hours access denied: no location consent', { userId });
        res.status(403).json({
          success: false,
          error: 'Location sharing consent required for After Hours Mode',
          code: 'CONSENT_REQUIRED',
          requiresConsent: true
        });
        return;
      }

      // All checks passed - allow access
      next();
    } catch (error) {
      // SECURITY: Fail closed on any database error
      // Never call next() on error - deny access instead
      logger.error('After Hours auth middleware error', { error, userId });
      res.status(500).json({
        success: false,
        error: 'Unable to verify After Hours access',
        code: 'AUTH_ERROR'
      });
      // Explicitly NOT calling next() - this is intentional fail-closed behavior
    }
  };
};
