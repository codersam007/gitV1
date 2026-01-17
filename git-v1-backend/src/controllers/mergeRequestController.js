/**
 * Merge Request Controller
 * 
 * Handles merge request operations
 */

const MergeRequest = require('../models/MergeRequest');
const Branch = require('../models/Branch');
const Commit = require('../models/Commit');
const Project = require('../models/Project');
const TeamMember = require('../models/TeamMember');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { generateCommitHash } = require('../utils/commitHash');
const { getCurrentSnapshot, saveCurrentSnapshot, saveFile, copyCurrentSnapshot, getCommitSnapshot } = require('../services/storage/fileStorage');
const { v4: uuidv4 } = require('uuid');
const {
  emitMergeRequestCreated,
  emitMergeRequestApproved,
  emitMergeRequestMerged,
  emitMergeRequestClosed,
  emitBranchUpdated,
} = require('../services/websocket/websocketService');
const {
  sendMergeRequestNotification,
  sendMergeRequestApprovalNotification,
  sendMergeRequestChangesRequestedNotification,
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
        
        // Get merged by user
        if (mr.mergedBy) {
          const mergedByUser = await User.findOne({ userId: mr.mergedBy });
          mrObj.mergedByUser = mergedByUser ? {
            userId: mergedByUser.userId,
            name: mergedByUser.name,
          } : null;
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

    // Validate input
    if (!sourceBranch || !targetBranch) {
      throw new AppError('VALIDATION_ERROR', 'Source and target branches are required', 400);
    }

    // Trim branch names to handle any whitespace issues
    const sourceBranchName = sourceBranch.trim();
    const targetBranchName = targetBranch.trim();

    // Validate branches exist
    const sourceBranchDoc = await Branch.findOne({
      projectId,
      name: sourceBranchName,
      status: 'active',
    });

    const targetBranchDoc = await Branch.findOne({
      projectId,
      name: targetBranchName,
      status: 'active',
    });

    // Provide more specific error messages
    if (!sourceBranchDoc && !targetBranchDoc) {
      throw new AppError('NOT_FOUND', `Both source branch "${sourceBranchName}" and target branch "${targetBranchName}" not found`, 404);
    }
    if (!sourceBranchDoc) {
      throw new AppError('NOT_FOUND', `Source branch "${sourceBranchName}" not found`, 404);
    }
    if (!targetBranchDoc) {
      throw new AppError('NOT_FOUND', `Target branch "${targetBranchName}" not found`, 404);
    }

    if (sourceBranchName === targetBranchName) {
      throw new AppError('VALIDATION_ERROR', 'Source and target branches cannot be the same', 400);
    }

    // Check branch ownership: Only the branch owner can create merge requests
    const sourceBranchCreatorId = String(sourceBranchDoc.createdBy || '');
    const currentUserIdString = String(userId || '');
    const isManager = req.teamMember?.role === 'manager';
    const isPrimaryBranch = sourceBranchDoc.isPrimary === true || sourceBranchDoc.name === 'main';
    
    // Managers can create MRs from any branch, but designers can only create MRs from their own branches
    // Exception: Primary/main branch can be used by anyone (but typically only managers create MRs from main)
    if (!isManager && sourceBranchCreatorId !== currentUserIdString && !isPrimaryBranch) {
      console.log(`[Create Merge Request] Access denied: User "${currentUserIdString}" (role: ${req.teamMember?.role || 'unknown'}) attempted to create MR from branch "${sourceBranchName}" owned by "${sourceBranchCreatorId}"`);
      throw new AppError('FORBIDDEN', 'Only the branch owner can create merge requests from this branch', 403);
    }
    
    console.log(`[Create Merge Request] ✅ Access granted: User "${currentUserIdString}" creating MR from "${sourceBranchName}" to "${targetBranchName}"`);

    // Get next merge request ID
    const lastMergeRequest = await MergeRequest.findOne({ projectId })
      .sort({ mergeRequestId: -1 })
      .exec();

    const mergeRequestId = lastMergeRequest ? lastMergeRequest.mergeRequestId + 1 : 1;

    // Get project settings
    const project = await Project.findOne({ projectId });
    const minReviews = project?.settings?.branchProtection?.minReviews || 2;

    // Get team members who can review (managers and designers)
    const reviewers = await TeamMember.find({
      projectId,
      role: { $in: ['manager', 'designer'] },
      status: 'active',
    }).limit(minReviews);

    // Create merge request
    const mergeRequest = await MergeRequest.create({
      projectId,
      mergeRequestId,
      sourceBranch: sourceBranchName,
      targetBranch: targetBranchName,
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

    // Prevent self-approval: Creator cannot approve their own merge request
    if (mergeRequest.createdBy === userId) {
      throw new AppError('FORBIDDEN', 'You cannot approve your own merge request', 403);
    }

    // Check if user is a manager (managers can always approve)
    const teamMember = await TeamMember.findOne({
      projectId,
      userId,
      status: 'active',
    });

    const isManager = teamMember && teamMember.role === 'manager';

    // Find reviewer or add manager if not in list
    let reviewer = mergeRequest.reviewers.find(r => r.userId === userId);
    
    if (!reviewer) {
      if (isManager) {
        // Managers can approve even if not in reviewers list - add them
        reviewer = {
          userId: userId,
          status: 'pending',
        };
        mergeRequest.reviewers.push(reviewer);
      } else {
      throw new AppError('FORBIDDEN', 'You are not a reviewer for this merge request', 403);
      }
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

    // Prevent self-request-changes: Creator cannot request changes on their own merge request
    if (mergeRequest.createdBy === userId) {
      throw new AppError('FORBIDDEN', 'You cannot request changes on your own merge request', 403);
    }

    // Check if user is a manager (managers can always request changes)
    const teamMember = await TeamMember.findOne({
      projectId,
      userId,
      status: 'active',
    });

    const isManager = teamMember && teamMember.role === 'manager';

    // Find reviewer or add manager if not in list
    let reviewer = mergeRequest.reviewers.find(r => r.userId === userId);
    
    if (!reviewer) {
      if (isManager) {
        // Managers can request changes even if not in reviewers list - add them
        reviewer = {
          userId: userId,
          status: 'pending',
        };
        mergeRequest.reviewers.push(reviewer);
      } else {
      throw new AppError('FORBIDDEN', 'You are not a reviewer for this merge request', 403);
      }
    }

    reviewer.status = 'requested_changes';
    reviewer.reviewedAt = new Date();
    reviewer.comment = comment || null;

    // Status stays as 'open' (no approval status in simplified flow)

    await mergeRequest.save();

    // Send email notification to merge request creator
    try {
      const project = await Project.findOne({ projectId });
      const requester = await User.findOne({ userId: mergeRequest.createdBy });
      const reviewerUser = await User.findOne({ userId });
      
      if (requester && reviewerUser) {
        await sendMergeRequestChangesRequestedNotification(
          requester.email,
          project?.name || 'Project',
          mergeRequest.title,
          reviewerUser.name || 'Reviewer',
          comment || 'No feedback provided.'
        );
      }
    } catch (error) {
      console.error('Failed to send changes requested email:', error);
      // Don't fail the request if email fails
    }

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

    // Allow merging from 'open' status (no approval needed in simplified flow - manager decides directly)
    // Reject if status is 'merged', 'closed', 'rejected', or 'reverted'
    if (!['open', 'approved'].includes(mergeRequest.status)) {
      throw new AppError('VALIDATION_ERROR', `Merge request is ${mergeRequest.status} and cannot be merged`, 400);
    }

    // Get source and target branches
    const sourceBranch = await Branch.findOne({
      projectId,
      name: mergeRequest.sourceBranch,
      status: 'active',
    });

    const targetBranch = await Branch.findOne({
      projectId,
      name: mergeRequest.targetBranch,
      status: 'active',
    });

    if (!sourceBranch) {
      throw new AppError('NOT_FOUND', 'Source branch not found or inactive', 404);
    }

    if (!targetBranch) {
      throw new AppError('NOT_FOUND', 'Target branch not found or inactive', 404);
    }

    // Branch protection check (for future use)
    // In simplified flow, managers can merge directly without approval requirement
    // This check is kept for potential future branch protection features
    if (targetBranch.isPrimary) {
      const project = await Project.findOne({ projectId });
      // Note: In simplified flow, no approval requirement check needed
      // Managers can merge directly from 'open' status
    }

    // Perform actual merge: Replace target branch content with source branch content
    // Strategy: Completely overwrite target branch snapshot with source branch snapshot
    // This means branch2 will have the exact same content as branch1 (all properties preserved)
    console.log(`Merging branch "${mergeRequest.sourceBranch}" (${sourceBranch._id}) into "${mergeRequest.targetBranch}" (${targetBranch._id})`);
    console.log(`Strategy: Completely replace target branch content with source branch content`);

    // Simply copy the entire snapshot from source branch to target branch
    // This preserves ALL properties: font, size, color, alignment, spacing, corner radius, etc.
    let mergedSnapshot = null;
    try {
      await copyCurrentSnapshot(projectId, sourceBranch._id.toString(), targetBranch._id.toString());
      console.log(`✅ Successfully copied source branch snapshot to target branch (target branch content replaced)`);
      
      // Verify the copy by reading it back and parse it for later use
      const targetSnapshotBuffer = await getCurrentSnapshot(projectId, targetBranch._id.toString());
      mergedSnapshot = JSON.parse(targetSnapshotBuffer.toString());
      
      if (mergedSnapshot.pages && mergedSnapshot.pages.length > 0) {
        const targetPage = mergedSnapshot.pages[0];
        const elementCount = targetPage.artboards?.[0]?.elements?.length || 0;
        console.log(`📦 Target branch now contains ${elementCount} elements with all properties preserved`);
      }
    } catch (error) {
      console.error('❌ Error copying source branch snapshot:', error);
      throw new AppError('INTERNAL_ERROR', `Failed to copy source branch snapshot: ${error.message}`, 500);
    }

    // 4. Create merge commit
    // Get the merged snapshot buffer to save as commit file
    const mergedSnapshotBuffer = await getCurrentSnapshot(projectId, targetBranch._id.toString());
    
    const parentHash = targetBranch.lastCommit?.hash || null;
    const commitMessage = `Merge ${mergeRequest.sourceBranch} into ${mergeRequest.targetBranch}`;
    const commitHash = generateCommitHash(
      projectId,
      targetBranch._id.toString(),
      commitMessage,
      userId,
      parentHash
    );

    // Save commit snapshot file (using the merged snapshot)
    const commitFilePath = await saveFile(
      mergedSnapshotBuffer,
      projectId,
      targetBranch._id.toString(),
      commitHash,
      'json'
    );

    // Count elements for commit metadata (mergedSnapshot already parsed above)
    const elementCount = mergedSnapshot?.pages?.[0]?.artboards?.[0]?.elements?.length || 0;

    // Create commit record
    const mergeCommit = await Commit.create({
      projectId,
      branchId: targetBranch._id,
      hash: commitHash,
      message: commitMessage,
      authorId: userId,
      parentCommitHash: parentHash,
      changes: {
        filesAdded: 0,
        filesModified: 1,
        filesDeleted: 0,
        componentsUpdated: elementCount,
      },
      snapshot: {
        fileUrl: commitFilePath,
        thumbnailUrl: null,
      },
    });

    // 6. Update target branch's last commit
    targetBranch.lastCommit = {
      hash: mergeCommit.hash,
      message: mergeCommit.message,
      timestamp: mergeCommit.timestamp,
      authorId: mergeCommit.authorId,
    };
    targetBranch.updatedAt = new Date();
    await targetBranch.save();

    // Update merge request stats
    // Use mergedSnapshot which we already parsed earlier
    mergeRequest.stats = {
      filesChanged: 1,
      componentsUpdated: mergedSnapshot.pages?.[0]?.artboards?.[0]?.elements?.length || 0,
    };

    // Update merge request status
    mergeRequest.status = 'merged';
    mergeRequest.mergedAt = new Date();
    mergeRequest.mergedBy = userId;
    await mergeRequest.save();
    console.log(`Merge request #${mergeRequest.mergeRequestId} status updated to 'merged'`);

    // Emit branch updated event
    emitBranchUpdated(projectId, targetBranch);

    // If auto-delete enabled, mark source branch as merged
    const project = await Project.findOne({ projectId });
    if (project?.settings?.branchProtection?.autoDeleteMerged) {
      const sourceBranchToUpdate = await Branch.findOne({
        projectId,
        name: mergeRequest.sourceBranch,
      });
      if (sourceBranchToUpdate) {
        sourceBranchToUpdate.status = 'merged';
        await sourceBranchToUpdate.save();
        console.log(`Source branch "${mergeRequest.sourceBranch}" marked as merged`);
      }
    }

    // Emit WebSocket event
    emitMergeRequestMerged(projectId, mergeRequest);

    // Reload merge request to get updated data
    const updatedMergeRequest = await MergeRequest.findOne({
      projectId,
      mergeRequestId: parseInt(mergeRequestId),
    });

    console.log('Merge completed successfully. Updated merge request status:', updatedMergeRequest?.status);

    res.json({
      success: true,
      mergeRequest: updatedMergeRequest || mergeRequest,
      targetBranch: {
        id: targetBranch._id.toString(),
        name: targetBranch.name,
      },
      sourceBranch: {
        id: sourceBranch._id.toString(),
        name: sourceBranch.name,
      },
      message: 'Merge completed successfully',
    });
  } catch (error) {
    console.error('Error in completeMerge:', error);
    console.error('Error stack:', error.stack);
    next(error);
  }
};

/**
 * Revert a merge (undo a merge)
 */
const revertMerge = async (req, res, next) => {
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

    if (mergeRequest.status !== 'merged') {
      throw new AppError('VALIDATION_ERROR', 'Can only revert merged requests', 400);
    }

    // Get target branch
    const targetBranch = await Branch.findOne({
      projectId,
      name: mergeRequest.targetBranch,
      status: 'active',
    });

    if (!targetBranch) {
      throw new AppError('NOT_FOUND', 'Target branch not found', 404);
    }

    // Find the commit before the merge
    // The merge commit message should contain "Merge" keyword
    const mergeCommits = await Commit.find({
      projectId,
      branchId: targetBranch._id,
      message: { $regex: /^Merge .* into/ },
    }).sort({ timestamp: -1 });

    // Find the merge commit for this specific merge request
    const mergeCommit = mergeCommits.find(c => 
      c.message.includes(mergeRequest.sourceBranch) && 
      c.message.includes(mergeRequest.targetBranch)
    );

    if (!mergeCommit) {
      throw new AppError('NOT_FOUND', 'Merge commit not found', 404);
    }

    // Get the parent commit (state before merge)
    const parentCommit = await Commit.findOne({
      projectId,
      branchId: targetBranch._id,
      hash: mergeCommit.parentCommitHash,
    });

    if (!parentCommit) {
      throw new AppError('NOT_FOUND', 'Parent commit (pre-merge state) not found', 404);
    }

    // Get parent commit snapshot
    let parentSnapshot;
    try {
      parentSnapshot = await getCommitSnapshot(projectId, targetBranch._id.toString(), parentCommit.hash);
    } catch (error) {
      throw new AppError('NOT_FOUND', 'Parent commit snapshot not found', 404);
    }

    // Replace current branch snapshot with parent snapshot
    await saveCurrentSnapshot(parentSnapshot, projectId, targetBranch._id.toString());

    // Create revert commit
    const parentHash = targetBranch.lastCommit?.hash || null;
    const revertMessage = `Reverted merge #${mergeRequestId}: ${mergeRequest.title}`;
    const revertCommitHash = generateCommitHash(
      projectId,
      targetBranch._id.toString(),
      revertMessage,
      userId,
      parentHash
    );

    // Save revert commit snapshot file
    const revertCommitFilePath = await saveFile(
      parentSnapshot,
      projectId,
      targetBranch._id.toString(),
      revertCommitHash,
      'json'
    );

    // Count elements for commit metadata
    const parentData = JSON.parse(parentSnapshot.toString());
    const elementCount = parentData?.pages?.[0]?.artboards?.[0]?.elements?.length || 0;

    // Create revert commit record
    const revertCommit = await Commit.create({
      projectId,
      branchId: targetBranch._id,
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
    targetBranch.lastCommit = {
      hash: revertCommit.hash,
      message: revertCommit.message,
      timestamp: revertCommit.timestamp,
      authorId: revertCommit.authorId,
    };
    targetBranch.updatedAt = new Date();
    await targetBranch.save();

    // Update merge request status
    mergeRequest.status = 'reverted';
    mergeRequest.revertedAt = new Date();
    mergeRequest.revertedBy = userId;
    await mergeRequest.save();

    // Emit WebSocket events
    emitBranchUpdated(projectId, targetBranch);
    emitMergeRequestClosed(projectId, mergeRequest);

    res.json({
      success: true,
      message: 'Merge reverted successfully',
      commit: revertCommit,
      mergeRequest: mergeRequest,
      targetBranch: {
        id: targetBranch._id.toString(),
        name: targetBranch.name,
      },
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
  revertMerge,
};
