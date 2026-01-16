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
const { saveFile, saveCurrentSnapshot, getCurrentSnapshot, copyCurrentSnapshot } = require('../services/storage/fileStorage');
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

    // Decode the branch name in case it was URL-encoded (handles forward slashes like "design/TEST3")
    const decodedBranchName = decodeURIComponent(branchName);

    const branch = await Branch.findOne({
      projectId,
      name: decodedBranchName,
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

    // Copy current snapshot from base branch to new branch
    // This ensures the new branch has all the properties (alignment, size, color, etc.) from the source
    try {
      await copyCurrentSnapshot(projectId, baseBranchDoc._id.toString(), branch._id.toString());
      console.log(`✅ Copied snapshot from base branch "${baseBranch}" to new branch "${fullName}"`);
    } catch (error) {
      console.warn(`⚠️ Could not copy snapshot from base branch (branch may be empty):`, error.message);
      // Continue anyway - branch can start empty
    }

    // Create initial commit from base branch
    if (baseBranchDoc.lastCommit) {
      const baseCommit = await Commit.findOne({ hash: baseBranchDoc.lastCommit.hash });
      
      if (baseCommit) {
        // Copy base branch snapshot
        const commitHash = generateCommitHash(projectId, branch._id.toString(), 'Initial commit from base branch', userId);
        
        // Read the base branch's current snapshot to copy it as the initial commit
        try {
          const baseSnapshot = await getCurrentSnapshot(projectId, baseBranchDoc._id.toString());
          
          // Save as commit file
          const commitFilePath = await saveFile(
            baseSnapshot,
            projectId,
            branch._id.toString(),
            commitHash,
            'json'
          );
          
          // Create commit record
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
              fileUrl: commitFilePath,
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
        } catch (snapshotError) {
          console.warn(`⚠️ Could not copy base branch snapshot for commit:`, snapshotError.message);
          // Create commit without snapshot file reference
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

          branch.lastCommit = {
            hash: commit.hash,
            message: commit.message,
            timestamp: commit.timestamp,
            authorId: commit.authorId,
          };
          await branch.save();
        }
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
    console.log('deleteBranch------------------------------------>', req.params);
    const { projectId, branchName } = req.params;
    const userId = req.userId;

    // Decode the branch name in case it was URL-encoded (handles forward slashes like "design/TEST3")
    const decodedBranchName = decodeURIComponent(branchName);

    const branch = await Branch.findOne({
      projectId,
      name: decodedBranchName,
    });

    if (!branch) {
      throw new AppError('NOT_FOUND', `Branch "${decodedBranchName}" not found`, 404);
    }

    // Check if branch is primary
    if (branch.isPrimary) {
      throw new AppError('FORBIDDEN', 'Cannot delete primary branch', 403);
    }

    // Check if branch has open merge requests
    const openMergeRequests = await MergeRequest.countDocuments({
      projectId,
      sourceBranch: decodedBranchName,
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
    emitBranchDeleted(projectId, decodedBranchName);

    res.json({
      success: true,
      message: 'Branch deleted successfully',
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get branch snapshot (current state)
 * Used when checking out a branch
 */
const getBranchSnapshot = async (req, res, next) => {
  try {
    const { projectId, branchId } = req.params;

    // Get branch
    const branch = await Branch.findById(branchId);
    if (!branch || branch.projectId !== projectId) {
      throw new AppError('NOT_FOUND', 'Branch not found', 404);
    }

    // Try to get current snapshot
    let snapshotData = null;
    let snapshotUrl = null;

    try {
      // Ensure we use the branch's actual _id from database for consistency
      const branchIdString = branch._id.toString();
      const snapshotBuffer = await getCurrentSnapshot(projectId, branchIdString);
      snapshotData = JSON.parse(snapshotBuffer.toString());
      snapshotUrl = `projects/${projectId}/branches/${branchIdString}/current.json`;
    } catch (error) {
      // If no current snapshot, try to get from last commit
      if (branch.lastCommit && branch.lastCommit.hash) {
        const lastCommit = await Commit.findOne({ hash: branch.lastCommit.hash });
        if (lastCommit && lastCommit.snapshot && lastCommit.snapshot.fileUrl) {
          // Read the commit file
          const { readFile } = require('../services/storage/fileStorage');
          try {
            const commitBuffer = await readFile(lastCommit.snapshot.fileUrl);
            snapshotData = JSON.parse(commitBuffer.toString());
            snapshotUrl = lastCommit.snapshot.fileUrl;
          } catch (readError) {
            console.warn('Could not read commit snapshot:', readError);
          }
        }
      }

      // If still no snapshot, try base branch
      if (!snapshotData && branch.baseBranch) {
        const baseBranch = await Branch.findOne({
          projectId,
          name: branch.baseBranch,
          status: 'active',
        });

        if (baseBranch) {
          try {
            const baseBranchIdString = baseBranch._id.toString();
            const baseSnapshotBuffer = await getCurrentSnapshot(projectId, baseBranchIdString);
            snapshotData = JSON.parse(baseSnapshotBuffer.toString());
            snapshotUrl = `projects/${projectId}/branches/${baseBranchIdString}/current.json`;
          } catch (baseError) {
            console.warn('Could not read base branch snapshot:', baseError);
          }
        }
      }
    }

    res.json({
      success: true,
      branch: {
        _id: branch._id,
        name: branch.name,
        projectId: branch.projectId,
      },
      snapshot: snapshotData,
      snapshotUrl: snapshotUrl,
      hasSnapshot: !!snapshotData,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Save branch snapshot (current state)
 * Used when checking out a branch or auto-saving
 */
const saveBranchSnapshot = async (req, res, next) => {
  try {
    const { projectId, branchId } = req.params;
    const { snapshot } = req.body; // Document state as JSON
    const userId = req.userId;

    // Get branch
    const branch = await Branch.findById(branchId);
    if (!branch || branch.projectId !== projectId) {
      throw new AppError('NOT_FOUND', 'Branch not found', 404);
    }

    // Convert snapshot to buffer
    const snapshotBuffer = Buffer.from(JSON.stringify(snapshot));

    // Save current snapshot - use the branch's actual _id from database for consistency
    const branchIdString = branch._id.toString();
    const filePath = await saveCurrentSnapshot(snapshotBuffer, projectId, branchIdString);

    // Update branch updatedAt
    branch.updatedAt = new Date();
    await branch.save();

    // Emit WebSocket event
    emitBranchUpdated(projectId, branch);

    res.json({
      success: true,
      message: 'Branch snapshot saved',
      snapshotUrl: filePath,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Checkout branch (save current state and load target branch)
 * This is the main checkout operation
 */
const checkoutBranch = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { sourceBranchId, targetBranchId, currentSnapshot } = req.body;
    const userId = req.userId;

    // Validate branches
    const sourceBranch = sourceBranchId 
      ? await Branch.findById(sourceBranchId)
      : null;
    const targetBranch = await Branch.findById(targetBranchId);

    if (!targetBranch || targetBranch.projectId !== projectId) {
      throw new AppError('NOT_FOUND', 'Target branch not found', 404);
    }

    if (sourceBranch && sourceBranch.projectId !== projectId) {
      throw new AppError('NOT_FOUND', 'Source branch not found', 404);
    }

    // Save current branch snapshot if provided
    if (sourceBranch && currentSnapshot) {
      const snapshotBuffer = Buffer.from(JSON.stringify(currentSnapshot));
      // Use the actual branch _id from the database to ensure consistency
      await saveCurrentSnapshot(snapshotBuffer, projectId, sourceBranch._id.toString());
      
      // Update source branch
      sourceBranch.updatedAt = new Date();
      await sourceBranch.save();
    }

    // Get target branch snapshot
    let targetSnapshot = null;
    let targetSnapshotUrl = null;

    try {
      // Use the actual branch _id from the database to ensure consistency
      const targetBranchIdString = targetBranch._id.toString();
      const snapshotBuffer = await getCurrentSnapshot(projectId, targetBranchIdString);
      targetSnapshot = JSON.parse(snapshotBuffer.toString());
      targetSnapshotUrl = `projects/${projectId}/branches/${targetBranchIdString}/current.json`;
    } catch (error) {
      // If no current snapshot, try last commit
      if (targetBranch.lastCommit && targetBranch.lastCommit.hash) {
        const lastCommit = await Commit.findOne({ hash: targetBranch.lastCommit.hash });
        if (lastCommit && lastCommit.snapshot && lastCommit.snapshot.fileUrl) {
          const { readFile } = require('../services/storage/fileStorage');
          try {
            const commitBuffer = await readFile(lastCommit.snapshot.fileUrl);
            targetSnapshot = JSON.parse(commitBuffer.toString());
            targetSnapshotUrl = lastCommit.snapshot.fileUrl;
          } catch (readError) {
            console.warn('Could not read commit snapshot:', readError);
          }
        }
      }

      // If still no snapshot, use base branch
      if (!targetSnapshot && targetBranch.baseBranch) {
        const baseBranch = await Branch.findOne({
          projectId,
          name: targetBranch.baseBranch,
          status: 'active',
        });

        if (baseBranch) {
          try {
            const baseBranchIdString = baseBranch._id.toString();
            const baseSnapshotBuffer = await getCurrentSnapshot(projectId, baseBranchIdString);
            targetSnapshot = JSON.parse(baseSnapshotBuffer.toString());
            targetSnapshotUrl = `projects/${projectId}/branches/${baseBranchIdString}/current.json`;
          } catch (baseError) {
            console.warn('Could not read base branch snapshot:', baseError);
          }
        }
      }
    }

    res.json({
      success: true,
      targetBranch: {
        _id: targetBranch._id,
        name: targetBranch.name,
        projectId: targetBranch.projectId,
      },
      snapshot: targetSnapshot,
      snapshotUrl: targetSnapshotUrl,
      hasSnapshot: !!targetSnapshot,
      message: targetSnapshot 
        ? 'Branch checked out successfully' 
        : 'Branch checked out (no snapshot available, starting fresh)',
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
  getBranchSnapshot,
  saveBranchSnapshot,
  checkoutBranch,
};
