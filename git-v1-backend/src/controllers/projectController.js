/**
 * Project Controller
 * 
 * Handles project-related operations
 */

const Project = require('../models/Project');
const Branch = require('../models/Branch');
const { AppError } = require('../middleware/errorHandler');

/**
 * Get project details
 */
const getProject = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const project = await Project.findOne({ projectId });

    if (!project) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    res.json({
      success: true,
      project,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create project
 */
const createProject = async (req, res, next) => {
  try {
    const { projectId, name, description } = req.body;
    const userId = req.userId;

    // Check if project already exists
    const existingProject = await Project.findOne({ projectId });
    if (existingProject) {
      throw new AppError('CONFLICT', 'Project already exists', 409);
    }

    // Create project
    const project = await Project.create({
      projectId,
      name,
      description: description || '',
      ownerId: userId,
      settings: {
        branchProtection: {
          requireApproval: true,
          minReviews: 1,
          autoDeleteMerged: false,
        },
        notifications: {
          onMergeRequest: true,
          onBranchUpdate: true,
        },
      },
    });

    // Create default "main" branch
    const mainBranch = await Branch.create({
      projectId,
      name: 'main',
      type: 'main',
      description: 'Main branch',
      baseBranch: 'main',
      createdBy: userId,
      isPrimary: true,
      status: 'active',
    });

    // Create team member record for owner
    const TeamMember = require('../models/TeamMember');
    const User = require('../models/User');
    
    // Get user email if not in req.user
    let userEmail = req.user?.email;
    if (!userEmail) {
      const user = await User.findOne({ userId });
      userEmail = user?.email || 'unknown@example.com';
    }
    
    await TeamMember.create({
      projectId,
      userId,
      email: userEmail,
      role: 'manager', // Project creator becomes manager
      status: 'active',
      joinedAt: new Date(),
    });

    res.status(201).json({
      success: true,
      project: {
        ...project.toObject(),
        mainBranch,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update project settings
 */
const updateProjectSettings = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { settings } = req.body;

    const project = await Project.findOne({ projectId });

    if (!project) {
      throw new AppError('NOT_FOUND', 'Project not found', 404);
    }

    // Update settings
    if (settings.branchProtection) {
      project.settings.branchProtection = {
        ...project.settings.branchProtection,
        ...settings.branchProtection,
      };
    }

    if (settings.notifications) {
      project.settings.notifications = {
        ...project.settings.notifications,
        ...settings.notifications,
      };
    }

    await project.save();

    res.json({
      success: true,
      project,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getProject,
  createProject,
  updateProjectSettings,
};
