import { body, validationResult } from 'express-validator';

/**
 * Helper: reads validation errors and sends a 422 response if any exist.
 */
export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Validation failed.',
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export const validateLogin = [
  body('loginId')
    .trim()
    .notEmpty().withMessage('Employee ID is required.')
    .isLength({ max: 64 }).withMessage('Employee ID must be 64 characters or less.'),
  body('password')
    .notEmpty().withMessage('Password is required.')
    .isLength({ min: 4, max: 128 }).withMessage('Password must be between 4 and 128 characters.'),
  handleValidationErrors,
];

// ── Reports ───────────────────────────────────────────────────────────────────

export const validateReport = [
  body('area')
    .trim().notEmpty().withMessage('Area is required.')
    .isLength({ max: 128 }).withMessage('Area must be 128 characters or less.'),
  body('station')
    .trim().notEmpty().withMessage('Station is required.')
    .isLength({ max: 128 }).withMessage('Station must be 128 characters or less.'),
  body('officerName')
    .trim().notEmpty().withMessage('Officer name is required.')
    .isLength({ max: 128 }).withMessage('Officer name must be 128 characters or less.'),
  body('priority')
    .trim().notEmpty().withMessage('Priority is required.')
    .isIn(['High', 'Medium', 'Low']).withMessage('Priority must be High, Medium, or Low.'),
  body('description')
    .trim().notEmpty().withMessage('Description is required.')
    .isLength({ max: 5000 }).withMessage('Description must be 5000 characters or less.'),
  body('latitude')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be a valid coordinate.'),
  body('longitude')
    .optional({ nullable: true, checkFalsy: true })
    .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be a valid coordinate.'),
  body('remarks')
    .optional({ nullable: true, checkFalsy: true })
    .isLength({ max: 5000 }).withMessage('Remarks must be 5000 characters or less.'),
  body('status')
    .optional()
    .isIn(['pending', 'in_review', 'resolved']).withMessage('Status must be pending, in_review, or resolved.'),
  handleValidationErrors,
];

// ── Bulletins ─────────────────────────────────────────────────────────────────

export const validateBulletin = [
  body('message')
    .trim().notEmpty().withMessage('Message is required.')
    .isLength({ max: 1000 }).withMessage('Message must be 1000 characters or less.'),
  body('severity')
    .trim().notEmpty().withMessage('Severity is required.')
    .isIn(['Critical', 'High', 'Medium', 'Low', 'Info']).withMessage('Invalid severity level.'),
  handleValidationErrors,
];
