/**
 * Validation Utilities
 * 
 * Common validation functions using express-validator
 */

const { body, param, query, validationResult } = require('express-validator');

/**
 * Middleware to check validation results
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Validation failed',
        details: errors.array(),
      },
    });
  }
  next();
};

/**
 * Validation rules for creating a branch
 */
const validateCreateBranch = [
  body('projectId').notEmpty().withMessage('Project ID is required'),
  body('name').notEmpty().trim().withMessage('Branch name is required'),
  body('type').isIn(['feature', 'hotfix', 'design', 'experiment']).withMessage('Invalid branch type'),
  body('baseBranch').notEmpty().withMessage('Base branch is required'),
  validate,
];

/**
 * Validation rules for creating a merge request
 */
const validateCreateMergeRequest = [
  body('projectId').notEmpty().withMessage('Project ID is required'),
  body('sourceBranch').notEmpty().withMessage('Source branch is required'),
  body('targetBranch').notEmpty().withMessage('Target branch is required'),
  body('title').notEmpty().trim().withMessage('Title is required'),
  validate,
];

/**
 * Validation rules for inviting team member
 */
const validateInviteMember = [
  body('projectId').notEmpty().withMessage('Project ID is required'),
  body('email').isEmail().withMessage('Valid email is required'),
  body('role').isIn(['owner', 'admin', 'designer', 'viewer']).withMessage('Invalid role'),
  validate,
];

/**
 * Validation rules for project ID parameter
 */
const validateProjectId = [
  param('projectId').notEmpty().withMessage('Project ID is required'),
  validate,
];

module.exports = {
  validate,
  validateCreateBranch,
  validateCreateMergeRequest,
  validateInviteMember,
  validateProjectId,
};
