/**
 * Commit Controller
 * 
 * Handles commit/version operations
 */

const Commit = require('../models/Commit');
const Branch = require('../models/Branch');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { generateCommitHash } = require('../utils/commitHash');
const { saveFile, saveCurrentSnapshot, getCommitSnapshot } = require('../services/storage/fileStorage');
const { emitBranchUpdated } = require('../services/websocket/websocketService');
const multer = require('multer');

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  storage: multer.memoryStorage(),
});

/**
 * Get commit history
 */
const getHistory = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { branch, limit = 20 } = req.query;

    let query = { projectId };

    // Filter by branch if provided
    if (branch) {
      const branchDoc = await Branch.findOne({
        projectId,
        name: branch,
        status: 'active',
      });

      if (branchDoc) {
        query.branchId = branchDoc._id;
      }
    }

    const commits = await Commit.find(query)
      .sort({ timestamp: -1 })
      .limit(parseInt(limit))
      .exec();

    // Manually populate author data (since authorId is a string, not ObjectId)
    const commitsWithAuthors = await Promise.all(
      commits.map(async (commit) => {
        const commitObj = commit.toObject();
        
        // Get author user
        if (commit.authorId) {
          const author = await User.findOne({ userId: commit.authorId });
          commitObj.author = author ? {
            userId: author.userId,
            name: author.name,
            email: author.email,
            avatarUrl: author.avatarUrl,
          } : null;
        }
        
        return commitObj;
      })
    );

    res.json({
      success: true,
      commits: commitsWithAuthors,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new commit
 */
const createCommit = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { branchId, message, changes } = req.body;
    const userId = req.userId;

    // Get branch
    const branch = await Branch.findById(branchId);
    if (!branch || branch.projectId !== projectId) {
      throw new AppError('NOT_FOUND', 'Branch not found', 404);
    }

    // Get file from request (multer middleware should handle this)
    const file = req.file;
    if (!file) {
      throw new AppError('VALIDATION_ERROR', 'Design snapshot file is required', 400);
    }

    // Generate commit hash
    const parentHash = branch.lastCommit?.hash || null;
    const commitHash = generateCommitHash(projectId, branchId, message, userId, parentHash);

    // Save file to storage
    const filePath = await saveFile(
      file.buffer,
      projectId,
      branchId,
      commitHash,
      'json'
    );

    // Save current snapshot
    await saveCurrentSnapshot(file.buffer, projectId, branchId);

    // Create commit record
    const commit = await Commit.create({
      projectId,
      branchId,
      hash: commitHash,
      message,
      authorId: userId,
      parentCommitHash: parentHash,
      changes: changes || {
        filesAdded: 0,
        filesModified: 0,
        filesDeleted: 0,
        componentsUpdated: 0,
      },
      snapshot: {
        fileUrl: filePath,
        thumbnailUrl: null, // TODO: Generate thumbnail
      },
    });

    // Update branch last commit
    branch.lastCommit = {
      hash: commit.hash,
      message: commit.message,
      timestamp: commit.timestamp,
      authorId: commit.authorId,
    };
    branch.updatedAt = new Date();
    await branch.save();

    // Emit WebSocket event
    emitBranchUpdated(projectId, branch);

    res.status(201).json({
      success: true,
      commit,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Revert branch to a specific commit
 */
const revertToCommit = async (req, res, next) => {
  try {
    const { projectId, branchId, commitHash } = req.params;
    const userId = req.userId;

    console.log('Revert to commit request:', { projectId, branchId, commitHash });

    // Get branch - branchId can be string or ObjectId
    const branch = await Branch.findById(branchId);
    if (!branch || branch.projectId !== projectId) {
      throw new AppError('NOT_FOUND', 'Branch not found', 404);
    }

    // Get commit
    const commit = await Commit.findOne({
      projectId,
      branchId,
      hash: commitHash,
    });

    if (!commit) {
      throw new AppError('NOT_FOUND', 'Commit not found', 404);
    }

    // Get commit snapshot
    let commitSnapshot;
    try {
      commitSnapshot = await getCommitSnapshot(projectId, branchId, commitHash);
    } catch (error) {
      throw new AppError('NOT_FOUND', 'Commit snapshot file not found', 404);
    }

    // Replace current branch snapshot with commit snapshot
    await saveCurrentSnapshot(commitSnapshot, projectId, branchId);

    // Create revert commit (soft rollback - preserves history)
    const parentHash = branch.lastCommit?.hash || null;
    const revertMessage = `Reverted to commit ${commitHash.substring(0, 7)}: ${commit.message}`;
    const revertCommitHash = generateCommitHash(
      projectId,
      branchId,
      revertMessage,
      userId,
      parentHash
    );

    // Save revert commit snapshot file
    const revertCommitFilePath = await saveFile(
      commitSnapshot,
      projectId,
      branchId,
      revertCommitHash,
      'json'
    );

    // Count elements for commit metadata
    const commitData = JSON.parse(commitSnapshot.toString());
    const elementCount = commitData?.pages?.[0]?.artboards?.[0]?.elements?.length || 0;

    // Create revert commit record
    const revertCommit = await Commit.create({
      projectId,
      branchId,
      hash: revertCommitHash,
      message: revertMessage,
      authorId: userId,
      parentCommitHash: parentHash,
      changes: {
        filesAdded: 0,
        filesModified: 1,
        filesDeleted: 0,
        componentsUpdated: elementCount,
      },
      snapshot: {
        fileUrl: revertCommitFilePath,
        thumbnailUrl: null,
      },
    });

    // Update branch last commit
    branch.lastCommit = {
      hash: revertCommit.hash,
      message: revertCommit.message,
      timestamp: revertCommit.timestamp,
      authorId: revertCommit.authorId,
    };
    branch.updatedAt = new Date();
    await branch.save();

    // Emit WebSocket event
    emitBranchUpdated(projectId, branch);

    res.json({
      success: true,
      message: 'Branch reverted successfully',
      commit: revertCommit,
      revertedToCommit: commit,
    });
  } catch (error) {
    next(error);
  }
};

// Export multer middleware for use in routes
const uploadMiddleware = upload.single('snapshot');

module.exports = {
  getHistory,
  createCommit,
  uploadMiddleware,
  revertToCommit,
};
