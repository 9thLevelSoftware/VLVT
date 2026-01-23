import { body, validationResult } from 'express-validator';
import { Request, Response, NextFunction } from 'express';

/**
 * After Hours Profile Validation Middleware
 *
 * Provides validation chains for After Hours profile operations following
 * the pattern established in validation.ts for main profile validation.
 */

// Middleware to handle validation errors (reusable pattern from validation.ts)
export const handleValidationErrors = (req: Request, res: Response, next: NextFunction) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array().map(err => ({
        field: err.type === 'field' ? err.path : 'unknown',
        message: err.msg
      }))
    });
  }
  next();
};

/**
 * Validation chain for After Hours profile creation
 *
 * Fields:
 * - description: optional, trimmed, max 500 characters
 *
 * Note: Photo is handled separately via multer and image-handler utilities.
 */
export const validateAfterHoursProfile = [
  // Description validation: Optional, max 500 characters
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be maximum 500 characters'),

  handleValidationErrors
];

/**
 * Validation chain for After Hours profile updates
 *
 * Fields:
 * - description: optional, trimmed, max 500 characters
 *
 * Note: Photo updates are handled via POST /profile/photo endpoint.
 */
export const validateAfterHoursProfileUpdate = [
  // Description validation: Optional, max 500 characters
  body('description')
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage('Description must be maximum 500 characters'),

  handleValidationErrors
];
