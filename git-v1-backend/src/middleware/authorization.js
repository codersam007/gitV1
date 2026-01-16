/**
 * Authorization Middleware
 * 
 * Checks if user has permission to perform actions
 * Role-based access control (RBAC)
 */

const TeamMember = require('../models/TeamMember');
const Project = require('../models/Project');
const { AppError } = require('./errorHandler');

/**
 * Check if user has access to a project
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const checkProjectAccess = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const userId = req.userId;

    // Check if user is a team member
    const teamMember = await TeamMember.findOne({
      projectId,
      userId,
      status: 'active',
    });

    if (!teamMember) {
      throw new AppError('FORBIDDEN', 'You do not have access to this project', 403);
    }

    // Attach team member info to request
    req.teamMember = teamMember;
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Check if user has required role in project
 * @param {Array} allowedRoles - Array of allowed roles
 */
const checkRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const { projectId } = req.params;
      const userId = req.userId;

      const teamMember = await TeamMember.findOne({
        projectId,
        userId,
        status: 'active',
      });

      if (!teamMember) {
        throw new AppError('FORBIDDEN', 'You do not have access to this project', 403);
      }

      if (!allowedRoles.includes(teamMember.role)) {
        throw new AppError(
          'FORBIDDEN',
          `This action requires one of these roles: ${allowedRoles.join(', ')}`,
          403
        );
      }

      req.teamMember = teamMember;
      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Check if user is project owner
 */
const checkOwner = checkRole(['owner']);

/**
 * Check if user is owner or admin
 */
const checkOwnerOrAdmin = checkRole(['owner', 'admin']);

/**
 * Check if user can review merge requests
 * Typically designers and above can review
 */
const checkReviewer = checkRole(['owner', 'admin', 'designer']);

module.exports = {
  checkProjectAccess,
  checkRole,
  checkOwner,
  checkOwnerOrAdmin,
  checkReviewer,
};
