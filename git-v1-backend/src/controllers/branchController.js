/**
 * Branch Controller
 * 
 * Handles branch-related operations
 */

const Branch = require('../models/Branch');
const Commit = require('../models/Commit');
const MergeRequest = require('../models/MergeRequest');
const { AppError } = require('../middleware/errorHandler');
const { generateCommitHash } = require('../utils/commitHash');
const { saveFile, saveCurrentSnapshot } = require('../services/storage/fileStorage');
const {
  emitBranchCreated,
  emitBranchUpdated,
  emitBranchDeleted,
} = require('../services/websocket/websocketService');

/**
 * Get all branches for a project
 */
const getBranches = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const branches = await Branch.find({
      projectId,
      status: { $ne: 'deleted' },
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      branches,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single branch details
 */
const getBranch = async (req, res, next) => {
  try {
    const { projectId, branchName } = req.params;

    const branch = await Branch.findOne({
      projectId,
      name: branchName,
      status: { $ne: 'deleted' },
    });

    if (!branch) {
      throw new AppError('NOT_FOUND', 'Branch not found', 404);
    }

    // Get recent commits
    const commits = await Commit.find({
      projectId,
      branchId: branch._id,
    })
      .sort({ timestamp: -1 })
      .limit(10);

    res.json({
      success: true,
      branch: {
        ...branch.toObject(),
        commits,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new branch
 */
const createBranch = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { name, type, description, baseBranch } = req.body;
    const userId = req.userId;

    // Validate branch name format
    const fullName = `${type}/${name}`;

    // Check if branch already exists
    const existingBranch = await Branch.findOne({
      projectId,
      name: fullName,
      status: { $ne: 'deleted' },
    });

    if (existingBranch) {
      throw new AppError('CONFLICT', 'Branch already exists', 409);
    }

    // Check if base branch exists
    const baseBranchDoc = await Branch.findOne({
      projectId,
      name: baseBranch,
      status: 'active',
    });

    if (!baseBranchDoc) {
      throw new AppError('NOT_FOUND', 'Base branch not found', 404);
    }

    // Create branch
    const branch = await Branch.create({
      projectId,
      name: fullName,
      type,
      description: description || '',
      baseBranch,
      createdBy: userId,
      isPrimary: false,
      status: 'active',
    });

    // Create initial commit from base branch
    if (baseBranchDoc.lastCommit) {
      const baseCommit = await Commit.findOne({ hash: baseBranchDoc.lastCommit.hash });
      
      if (baseCommit) {
        // Copy base branch snapshot
        const commitHash = generateCommitHash(projectId, branch._id.toString(), 'Initial commit from base branch', userId);
        
        // TODO: Copy file from base branch to new branch
        // For now, we'll create a placeholder commit
        const commit = await Commit.create({
          projectId,
          branchId: branch._id,
          hash: commitHash,
          message: 'Initial commit from base branch',
          authorId: userId,
          parentCommitHash: baseCommit.hash,
          changes: {
            filesAdded: 0,
            filesModified: 0,
            filesDeleted: 0,
            componentsUpdated: 0,
          },
          snapshot: {
            fileUrl: baseCommit.snapshot.fileUrl, // Reference same file for now
            thumbnailUrl: baseCommit.snapshot.thumbnailUrl,
          },
        });

        // Update branch last commit
        branch.lastCommit = {
          hash: commit.hash,
          message: commit.message,
          timestamp: commit.timestamp,
          authorId: commit.authorId,
        };
        await branch.save();
      }
    }

    // Emit WebSocket event
    emitBranchCreated(projectId, branch);

    res.status(201).json({
      success: true,
      branch,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete branch
 */
const deleteBranch = async (req, res, next) => {
  try {
    const { projectId, branchName } = req.params;
    const userId = req.userId;

    const branch = await Branch.findOne({
      projectId,
      name: branchName,
    });

    if (!branch) {
      throw new AppError('NOT_FOUND', 'Branch not found', 404);
    }

    // Check if branch is primary
    if (branch.isPrimary) {
      throw new AppError('FORBIDDEN', 'Cannot delete primary branch', 403);
    }

    // Check if branch has open merge requests
    const openMergeRequests = await MergeRequest.countDocuments({
      projectId,
      sourceBranch: branchName,
      status: { $in: ['open', 'approved'] },
    });

    if (openMergeRequests > 0) {
      throw new AppError(
        'CONFLICT',
        'Cannot delete branch with open merge requests',
        409
      );
    }

    // Soft delete
    branch.status = 'deleted';
    await branch.save();

    // Emit WebSocket event
    emitBranchDeleted(projectId, branchName);

    res.json({
      success: true,
      message: 'Branch deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getBranches,
  getBranch,
  createBranch,
  deleteBranch,
};
