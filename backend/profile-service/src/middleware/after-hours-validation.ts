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

/**
 * Validation chain for After Hours preferences creation
 *
 * All fields are optional since smart defaults are applied from main profile.
 * Custom validation ensures minAge <= maxAge when both are provided.
 */
export const validatePreferences = [
  // Seeking gender: Optional, restricted to valid values
  body('seekingGender')
    .optional()
    .isIn(['Any', 'Male', 'Female', 'Non-binary'])
    .withMessage('Seeking gender must be one of: Any, Male, Female, Non-binary'),

  // Max distance: Optional, 1-200 km
  body('maxDistanceKm')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('Max distance must be between 1 and 200 km'),

  // Min age: Optional, 18-99
  body('minAge')
    .optional()
    .isInt({ min: 18, max: 99 })
    .withMessage('Minimum age must be between 18 and 99'),

  // Max age: Optional, 18-99
  body('maxAge')
    .optional()
    .isInt({ min: 18, max: 99 })
    .withMessage('Maximum age must be between 18 and 99'),

  // Sexual orientation: Optional, restricted to valid values
  body('sexualOrientation')
    .optional()
    .isIn(['Straight', 'Gay', 'Bisexual', 'Pansexual', 'Queer', 'Other'])
    .withMessage('Sexual orientation must be one of: Straight, Gay, Bisexual, Pansexual, Queer, Other'),

  // Custom validation: minAge must be <= maxAge when both provided
  body('maxAge').custom((maxAge, { req }) => {
    const minAge = req.body.minAge;
    if (minAge !== undefined && maxAge !== undefined) {
      if (parseInt(minAge) > parseInt(maxAge)) {
        throw new Error('Minimum age cannot be greater than maximum age');
      }
    }
    return true;
  }),

  handleValidationErrors
];

/**
 * Validation chain for After Hours preferences updates
 *
 * Same validation as creation - all fields optional for partial updates.
 */
export const validatePreferencesUpdate = [
  // Seeking gender: Optional, restricted to valid values
  body('seekingGender')
    .optional()
    .isIn(['Any', 'Male', 'Female', 'Non-binary'])
    .withMessage('Seeking gender must be one of: Any, Male, Female, Non-binary'),

  // Max distance: Optional, 1-200 km
  body('maxDistanceKm')
    .optional()
    .isInt({ min: 1, max: 200 })
    .withMessage('Max distance must be between 1 and 200 km'),

  // Min age: Optional, 18-99
  body('minAge')
    .optional()
    .isInt({ min: 18, max: 99 })
    .withMessage('Minimum age must be between 18 and 99'),

  // Max age: Optional, 18-99
  body('maxAge')
    .optional()
    .isInt({ min: 18, max: 99 })
    .withMessage('Maximum age must be between 18 and 99'),

  // Sexual orientation: Optional, restricted to valid values
  body('sexualOrientation')
    .optional()
    .isIn(['Straight', 'Gay', 'Bisexual', 'Pansexual', 'Queer', 'Other'])
    .withMessage('Sexual orientation must be one of: Straight, Gay, Bisexual, Pansexual, Queer, Other'),

  // Custom validation: minAge must be <= maxAge when both provided
  body('maxAge').custom((maxAge, { req }) => {
    const minAge = req.body.minAge;
    if (minAge !== undefined && maxAge !== undefined) {
      if (parseInt(minAge) > parseInt(maxAge)) {
        throw new Error('Minimum age cannot be greater than maximum age');
      }
    }
    return true;
  }),

  handleValidationErrors
];

/**
 * Validation chain for After Hours session start
 *
 * Fields:
 * - duration: required, must be 15, 30, or 60 minutes
 * - latitude: required, -90 to 90
 * - longitude: required, -180 to 180
 */
export const validateSessionStart = [
  // Duration: Required, must be 15, 30, or 60
  body('duration')
    .notEmpty()
    .withMessage('Duration is required')
    .isIn([15, 30, 60])
    .withMessage('Duration must be 15, 30, or 60 minutes'),

  // Latitude: Required, valid range
  body('latitude')
    .notEmpty()
    .withMessage('Latitude is required')
    .isFloat({ min: -90, max: 90 })
    .withMessage('Invalid latitude: must be between -90 and 90'),

  // Longitude: Required, valid range
  body('longitude')
    .notEmpty()
    .withMessage('Longitude is required')
    .isFloat({ min: -180, max: 180 })
    .withMessage('Invalid longitude: must be between -180 and 180'),

  handleValidationErrors
];

/**
 * Validation chain for After Hours session extension
 *
 * Fields:
 * - additionalMinutes: required, must be 15, 30, or 60 minutes
 */
export const validateSessionExtend = [
  // Additional minutes: Required, must be 15, 30, or 60
  body('additionalMinutes')
    .notEmpty()
    .withMessage('Additional minutes required')
    .isIn([15, 30, 60])
    .withMessage('Can extend by 15, 30, or 60 minutes'),

  handleValidationErrors
];
