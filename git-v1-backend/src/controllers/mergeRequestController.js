/**
 * Merge Request Controller
 * 
 * Handles merge request operations
 */

const MergeRequest = require('../models/MergeRequest');
const Branch = require('../models/Branch');
const Project = require('../models/Project');
const TeamMember = require('../models/TeamMember');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const {
  emitMergeRequestCreated,
  emitMergeRequestApproved,
  emitMergeRequestMerged,
  emitMergeRequestClosed,
} = require('../services/websocket/websocketService');
const {
  sendMergeRequestNotification,
  sendMergeRequestApprovalNotification,
} = require('../services/email/emailService');

/**
 * Get merge requests
 */
const getMergeRequests = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { status } = req.query;

    let query = { projectId };

    if (status && status !== 'all') {
      query.status = status;
    }

    const mergeRequests = await MergeRequest.find(query)
      .sort({ createdAt: -1 })
      .exec();

    // Manually populate user data (since userId is a string, not ObjectId)
    const mergeRequestsWithUsers = await Promise.all(
      mergeRequests.map(async (mr) => {
        const mrObj = mr.toObject();
        
        // Get creator user
        if (mr.createdBy) {
          const creator = await User.findOne({ userId: mr.createdBy });
          mrObj.createdByUser = creator ? {
            userId: creator.userId,
            name: creator.name,
            email: creator.email,
            avatarUrl: creator.avatarUrl,
          } : null;
        }
        
        // Get reviewer users
        if (mr.reviewers && mr.reviewers.length > 0) {
          mrObj.reviewers = await Promise.all(
            mr.reviewers.map(async (reviewer) => {
              const user = await User.findOne({ userId: reviewer.userId });
              return {
                ...reviewer.toObject(),
                user: user ? {
                  userId: user.userId,
                  name: user.name,
                  email: user.email,
                  avatarUrl: user.avatarUrl,
                } : null,
              };
            })
          );
        }
        
        return mrObj;
      })
    );

    res.json({
      success: true,
      mergeRequests: mergeRequestsWithUsers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get single merge request
 */
const getMergeRequest = async (req, res, next) => {
  try {
    const { projectId, mergeRequestId } = req.params;

    const mergeRequest = await MergeRequest.findOne({
      projectId,
      mergeRequestId: parseInt(mergeRequestId),
    }).exec();

    if (!mergeRequest) {
      throw new AppError('NOT_FOUND', 'Merge request not found', 404);
    }

    // Manually populate user data (since userId is a string, not ObjectId)
    const mrObj = mergeRequest.toObject();
    
    // Get creator user
    if (mergeRequest.createdBy) {
      const creator = await User.findOne({ userId: mergeRequest.createdBy });
      mrObj.createdByUser = creator ? {
        userId: creator.userId,
        name: creator.name,
        email: creator.email,
        avatarUrl: creator.avatarUrl,
      } : null;
    }
    
    // Get reviewer users
    if (mergeRequest.reviewers && mergeRequest.reviewers.length > 0) {
      mrObj.reviewers = await Promise.all(
        mergeRequest.reviewers.map(async (reviewer) => {
          const user = await User.findOne({ userId: reviewer.userId });
          return {
            ...reviewer.toObject(),
            user: user ? {
              userId: user.userId,
              name: user.name,
              email: user.email,
              avatarUrl: user.avatarUrl,
            } : null,
          };
        })
      );
    }

    res.json({
      success: true,
      mergeRequest: mrObj,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create merge request
 */
const createMergeRequest = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { sourceBranch, targetBranch, title, description } = req.body;
    const userId = req.userId;

    // Validate branches exist
    const sourceBranchDoc = await Branch.findOne({
      projectId,
      name: sourceBranch,
      status: 'active',
    });

    const targetBranchDoc = await Branch.findOne({
      projectId,
      name: targetBranch,
      status: 'active',
    });

    if (!sourceBranchDoc || !targetBranchDoc) {
      throw new AppError('NOT_FOUND', 'Source or target branch not found', 404);
    }

    if (sourceBranch === targetBranch) {
      throw new AppError('VALIDATION_ERROR', 'Source and target branches cannot be the same', 400);
    }

    // Get next merge request ID
    const lastMergeRequest = await MergeRequest.findOne({ projectId })
      .sort({ mergeRequestId: -1 })
      .exec();

    const mergeRequestId = lastMergeRequest ? lastMergeRequest.mergeRequestId + 1 : 1;

    // Get project settings
    const project = await Project.findOne({ projectId });
    const minReviews = project?.settings?.branchProtection?.minReviews || 2;

    // Get team members who can review
    const reviewers = await TeamMember.find({
      projectId,
      role: { $in: ['owner', 'admin', 'designer'] },
      status: 'active',
    }).limit(minReviews);

    // Create merge request
    const mergeRequest = await MergeRequest.create({
      projectId,
      mergeRequestId,
      sourceBranch,
      targetBranch,
      title,
      description: description || '',
      status: 'open',
      createdBy: userId,
      reviewers: reviewers.map(member => ({
        userId: member.userId,
        status: 'pending',
      })),
      stats: {
        filesChanged: 0, // TODO: Calculate from branch differences
        componentsUpdated: 0,
      },
    });

    // Send email notifications to reviewers
    const projectName = project?.name || 'Project';
    for (const reviewer of reviewers) {
      try {
        await sendMergeRequestNotification(
          reviewer.email,
          projectName,
          title,
          `${process.env.FRONTEND_URL || 'http://localhost:3000'}/merge/${mergeRequestId}`
        );
      } catch (error) {
        console.error('Failed to send email notification:', error);
      }
    }

    // Emit WebSocket event
    emitMergeRequestCreated(projectId, mergeRequest);

    res.status(201).json({
      success: true,
      mergeRequest,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Approve merge request
 */
const approveMergeRequest = async (req, res, next) => {
  try {
    const { projectId, mergeRequestId } = req.params;
    const userId = req.userId;

    const mergeRequest = await MergeRequest.findOne({
      projectId,
      mergeRequestId: parseInt(mergeRequestId),
    });

    if (!mergeRequest) {
      throw new AppError('NOT_FOUND', 'Merge request not found', 404);
    }

    // Find reviewer
    const reviewer = mergeRequest.reviewers.find(r => r.userId === userId);
    if (!reviewer) {
      throw new AppError('FORBIDDEN', 'You are not a reviewer for this merge request', 403);
    }

    // Update reviewer status
    reviewer.status = 'approved';
    reviewer.reviewedAt = new Date();
    await mergeRequest.save();

    // Check if all required approvals met
    const project = await Project.findOne({ projectId });
    const minReviews = project?.settings?.branchProtection?.minReviews || 2;
    const approvedCount = mergeRequest.reviewers.filter(r => r.status === 'approved').length;

    if (approvedCount >= minReviews) {
      mergeRequest.status = 'approved';
      await mergeRequest.save();

      // Send notification to requester
      try {
        const requester = await TeamMember.findOne({ userId: mergeRequest.createdBy });
        if (requester) {
          await sendMergeRequestApprovalNotification(
            requester.email,
            project?.name || 'Project',
            mergeRequest.title
          );
        }
      } catch (error) {
        console.error('Failed to send approval email:', error);
      }
    }

    // Emit WebSocket event
    emitMergeRequestApproved(projectId, mergeRequest);

    res.json({
      success: true,
      mergeRequest,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Request changes on merge request
 */
const requestChanges = async (req, res, next) => {
  try {
    const { projectId, mergeRequestId } = req.params;
    const { comment } = req.body;
    const userId = req.userId;

    const mergeRequest = await MergeRequest.findOne({
      projectId,
      mergeRequestId: parseInt(mergeRequestId),
    });

    if (!mergeRequest) {
      throw new AppError('NOT_FOUND', 'Merge request not found', 404);
    }

    const reviewer = mergeRequest.reviewers.find(r => r.userId === userId);
    if (!reviewer) {
      throw new AppError('FORBIDDEN', 'You are not a reviewer for this merge request', 403);
    }

    reviewer.status = 'requested_changes';
    reviewer.reviewedAt = new Date();
    reviewer.comment = comment || null;

    // If was approved, change back to open
    if (mergeRequest.status === 'approved') {
      mergeRequest.status = 'open';
    }

    await mergeRequest.save();

    // Emit WebSocket event
    emitMergeRequestClosed(projectId, mergeRequest);

    res.json({
      success: true,
      mergeRequest,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Complete merge
 */
const completeMerge = async (req, res, next) => {
  try {
    const { projectId, mergeRequestId } = req.params;
    const userId = req.userId;

    const mergeRequest = await MergeRequest.findOne({
      projectId,
      mergeRequestId: parseInt(mergeRequestId),
    });

    if (!mergeRequest) {
      throw new AppError('NOT_FOUND', 'Merge request not found', 404);
    }

    if (mergeRequest.status !== 'approved') {
      throw new AppError('VALIDATION_ERROR', 'Merge request must be approved before merging', 400);
    }

    // Check branch protection (if target is main)
    const targetBranch = await Branch.findOne({
      projectId,
      name: mergeRequest.targetBranch,
    });

    if (targetBranch?.isPrimary) {
      const project = await Project.findOne({ projectId });
      if (project?.settings?.branchProtection?.requireApproval) {
        // Already checked above (status must be approved)
      }
    }

    // TODO: Perform actual merge
    // 1. Get source branch snapshot
    // 2. Get target branch snapshot
    // 3. Merge changes
    // 4. Create merge commit
    // 5. Update target branch

    // Update merge request
    mergeRequest.status = 'merged';
    mergeRequest.mergedAt = new Date();
    mergeRequest.mergedBy = userId;
    await mergeRequest.save();

    // If auto-delete enabled, mark source branch as merged
    const project = await Project.findOne({ projectId });
    if (project?.settings?.branchProtection?.autoDeleteMerged) {
      const sourceBranch = await Branch.findOne({
        projectId,
        name: mergeRequest.sourceBranch,
      });
      if (sourceBranch) {
        sourceBranch.status = 'merged';
        await sourceBranch.save();
      }
    }

    // Emit WebSocket event
    emitMergeRequestMerged(projectId, mergeRequest);

    res.json({
      success: true,
      mergeRequest,
      message: 'Merge completed successfully',
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getMergeRequests,
  getMergeRequest,
  createMergeRequest,
  approveMergeRequest,
  requestChanges,
  completeMerge,
};
