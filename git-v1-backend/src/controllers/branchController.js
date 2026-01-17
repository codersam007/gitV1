/**
 * Branch Controller
 * 
 * Handles branch-related operations
 */

const Branch = require('../models/Branch');
const Commit = require('../models/Commit');
const MergeRequest = require('../models/MergeRequest');
const User = require('../models/User');
const TeamMember = require('../models/TeamMember');
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
    const teamMember = req.teamMember;
    const userId = req.userId;
    console.log('getBranches------>' , userId);

    // Debug logging
    console.log(`[Get Branches] Request received - projectId: ${projectId}, userId: ${userId}, teamMember: ${teamMember ? JSON.stringify({ userId: teamMember.userId, role: teamMember.role }) : 'null'}`);

    const query = {
      projectId,
      status: { $ne: 'deleted' },
    };

    // Everyone (designers and managers) can see all branches
    // No filtering by createdBy - all team members see all branches
    console.log(`[Get Branches] ✅ Showing all branches for project: ${projectId} (user: ${userId}, role: ${teamMember?.role || 'unknown'})`);

    // Log the query for debugging
    console.log(`[Get Branches] MongoDB query:`, JSON.stringify(query, null, 2));
    
    const branches = await Branch.find(query).sort({ createdAt: -1 });

    // Log found branches for debugging
    console.log(`[Get Branches] Found ${branches.length} branches matching query`);
    branches.forEach(branch => {
      console.log(`  - Branch: "${branch.name}", createdBy: "${branch.createdBy}", requested userId: "${userId}"`);
    });

    // Manually populate creator user data (since userId is a string, not ObjectId)
    const branchesWithUsers = await Promise.all(
      branches.map(async (branch) => {
        const branchObj = branch.toObject();
        
        // Get creator user with enhanced lookup and fallbacks
        if (branch.createdBy) {
          try {
            // Convert to string to ensure consistent matching
            const createdByUserId = String(branch.createdBy);
            
            // Step 1: Try to find in User collection (exact match)
            let creator = await User.findOne({ userId: createdByUserId });
            
            if (creator) {
              branchObj.createdByUser = {
                userId: creator.userId,
                name: creator.name || 'Unknown User',
                email: creator.email,
                avatarUrl: creator.avatarUrl,
              };
            } else {
              // Step 2: Try to find in TeamMember collection (project-specific)
              const teamMember = await TeamMember.findOne({
                projectId,
                userId: createdByUserId,
              });
              
              if (teamMember) {
                // Extract name from email if available
                let displayName = teamMember.email;
                if (teamMember.email && teamMember.email.includes('@')) {
                  displayName = teamMember.email.split('@')[0];
                  displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                  displayName = displayName.replace(/[._-]/g, ' ');
                } else {
                  displayName = teamMember.userId;
                }
                
                branchObj.createdByUser = {
                  userId: teamMember.userId,
                  name: displayName || 'Unknown User',
                  email: teamMember.email || null,
                  avatarUrl: null,
                };
              } else {
                // Step 3: Get all team members and try to match
                const allTeamMembers = await TeamMember.find({
                  projectId,
                  status: 'active',
                });
                
                // Try to match by email if userId looks like an email
                let matchedMember = null;
                if (createdByUserId.includes('@')) {
                  matchedMember = allTeamMembers.find(m => m.email === createdByUserId);
                }
                
                // If still no match, try to match any team member's userId (in case of format mismatch)
                if (!matchedMember && allTeamMembers.length > 0) {
                  // Try string comparison
                  matchedMember = allTeamMembers.find(m => String(m.userId) === createdByUserId);
                  
                  // If still no match and we only have one team member, use them as fallback
                  if (!matchedMember && allTeamMembers.length === 1) {
                    matchedMember = allTeamMembers[0];
                    console.log(`[Branch ${branch.name}] Using fallback: single team member as creator (original userId: ${createdByUserId})`);
                  }
                }
                
                if (matchedMember) {
                  let displayName = matchedMember.email;
                  if (matchedMember.email && matchedMember.email.includes('@')) {
                    displayName = matchedMember.email.split('@')[0];
                    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                    displayName = displayName.replace(/[._-]/g, ' ');
                  } else {
                    displayName = matchedMember.userId;
                  }
                  
                  branchObj.createdByUser = {
                    userId: matchedMember.userId,
                    name: displayName || 'Unknown User',
                    email: matchedMember.email || null,
                    avatarUrl: null,
                  };
                } else {
                  // Step 4: Try to extract meaningful name from userId pattern
                  let displayName = createdByUserId;
                  
                  // Extract from patterns like "designer_1234567890_abc123" -> "Designer"
                  if (createdByUserId.includes('_')) {
                    const parts = createdByUserId.split('_');
                    if (parts[0] && parts[0] !== 'temp') {
                      displayName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
                    }
                  } else if (createdByUserId.match(/^[a-z]+\d+$/i)) {
                    // Pattern: "user123" -> "User 123"
                    const match = createdByUserId.match(/^([a-z]+)(\d+)$/i);
                    if (match) {
                      displayName = match[1].charAt(0).toUpperCase() + match[1].slice(1) + ' ' + match[2];
                    }
                  } else if (createdByUserId.includes('@')) {
                    // If it's an email, extract name part
                    displayName = createdByUserId.split('@')[0];
                    displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                    displayName = displayName.replace(/[._-]/g, ' ');
                  }
                  
                  // If we couldn't extract a meaningful name, use "Unknown User"
                  if (displayName === createdByUserId && (displayName.length > 20 || /^[\d_]+$/.test(displayName))) {
                    displayName = 'Unknown User';
                  }
                  
                  branchObj.createdByUser = {
                    userId: createdByUserId,
                    name: displayName || 'Unknown User',
                    email: null,
                    avatarUrl: null,
                  };
                }
              }
            }
            
            // Final validation: ensure createdByUser has a valid name
            if (!branchObj.createdByUser || !branchObj.createdByUser.name || branchObj.createdByUser.name.trim() === '') {
              branchObj.createdByUser = {
                userId: createdByUserId,
                name: 'Unknown User',
                email: null,
                avatarUrl: null,
              };
            }
          } catch (error) {
            console.error(`[Branch ${branch.name}] Error fetching creator info for userId "${branch.createdBy}":`, error);
            // Final fallback
            branchObj.createdByUser = {
              userId: String(branch.createdBy),
              name: 'Unknown User',
              email: null,
              avatarUrl: null,
            };
          }
        } else {
          // No createdBy field at all
          branchObj.createdByUser = null;
        }
        
        return branchObj;
      })
    );

    res.json({
      success: true,
      branches: branchesWithUsers,
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

    // Everyone (designers and managers) can access all branches
    // No access restrictions - all team members can view any branch
    const userId = req.userId;
    const branchCreatorId = String(branch.createdBy || '');
    const currentUserId = String(userId || '');
    
    console.log(`[Get Branch] ✅ Access granted: User "${currentUserId}" (role: ${req.teamMember?.role || 'unknown'}) accessing branch "${decodedBranchName}" created by "${branchCreatorId}"`);

    // Get recent commits
    const commits = await Commit.find({
      projectId,
      branchId: branch._id,
    })
      .sort({ timestamp: -1 })
      .limit(10);

    // Get creator user info with enhanced lookup (same logic as getBranches)
    const branchObj = branch.toObject();
    if (branch.createdBy) {
      try {
        // Convert to string to ensure consistent matching
        const createdByUserId = String(branch.createdBy);
        
        // Step 1: Try to find in User collection
        let creator = await User.findOne({ userId: createdByUserId });
        
        if (creator) {
          branchObj.createdByUser = {
            userId: creator.userId,
            name: creator.name || 'Unknown User',
            email: creator.email,
            avatarUrl: creator.avatarUrl,
          };
        } else {
          // Step 2: Try to find in TeamMember collection
          const teamMember = await TeamMember.findOne({
            projectId,
            userId: createdByUserId,
          });
          
          if (teamMember) {
            let displayName = teamMember.email;
            if (teamMember.email && teamMember.email.includes('@')) {
              displayName = teamMember.email.split('@')[0];
              displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
              displayName = displayName.replace(/[._-]/g, ' ');
            } else {
              displayName = teamMember.userId;
            }
            
            branchObj.createdByUser = {
              userId: teamMember.userId,
              name: displayName || 'Unknown User',
              email: teamMember.email || null,
              avatarUrl: null,
            };
          } else {
            // Step 3: Get all team members and try to match
            const allTeamMembers = await TeamMember.find({
              projectId,
              status: 'active',
            });
            
            let matchedMember = null;
            if (createdByUserId.includes('@')) {
              matchedMember = allTeamMembers.find(m => m.email === createdByUserId);
            }
            
            if (!matchedMember && allTeamMembers.length > 0) {
              matchedMember = allTeamMembers.find(m => String(m.userId) === createdByUserId);
              
              if (!matchedMember && allTeamMembers.length === 1) {
                matchedMember = allTeamMembers[0];
              }
            }
            
            if (matchedMember) {
              let displayName = matchedMember.email;
              if (matchedMember.email && matchedMember.email.includes('@')) {
                displayName = matchedMember.email.split('@')[0];
                displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                displayName = displayName.replace(/[._-]/g, ' ');
              } else {
                displayName = matchedMember.userId;
              }
              
              branchObj.createdByUser = {
                userId: matchedMember.userId,
                name: displayName || 'Unknown User',
                email: matchedMember.email || null,
                avatarUrl: null,
              };
            } else {
              // Step 4: Extract name from userId pattern
              let displayName = createdByUserId;
              
              if (createdByUserId.includes('_')) {
                const parts = createdByUserId.split('_');
                if (parts[0] && parts[0] !== 'temp') {
                  displayName = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
                }
              } else if (createdByUserId.match(/^[a-z]+\d+$/i)) {
                const match = createdByUserId.match(/^([a-z]+)(\d+)$/i);
                if (match) {
                  displayName = match[1].charAt(0).toUpperCase() + match[1].slice(1) + ' ' + match[2];
                }
              } else if (createdByUserId.includes('@')) {
                displayName = createdByUserId.split('@')[0];
                displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
                displayName = displayName.replace(/[._-]/g, ' ');
              }
              
              if (displayName === createdByUserId && (displayName.length > 20 || /^[\d_]+$/.test(displayName))) {
                displayName = 'Unknown User';
              }
              
              branchObj.createdByUser = {
                userId: createdByUserId,
                name: displayName || 'Unknown User',
                email: null,
                avatarUrl: null,
              };
            }
          }
        }
        
        // Final validation
        if (!branchObj.createdByUser || !branchObj.createdByUser.name || branchObj.createdByUser.name.trim() === '') {
          branchObj.createdByUser = {
            userId: createdByUserId,
            name: 'Unknown User',
            email: null,
            avatarUrl: null,
          };
        }
      } catch (error) {
        console.error(`[Branch ${branch.name}] Error fetching creator info:`, error);
        branchObj.createdByUser = {
          userId: String(branch.createdBy),
          name: 'Unknown User',
          email: null,
          avatarUrl: null,
        };
      }
    } else {
      branchObj.createdByUser = null;
    }

    res.json({
      success: true,
      branch: {
        ...branchObj,
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
    console.log('createBranch------------------------------------>', userId);

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
    // Allow any status except deleted
    const baseBranchDoc = await Branch.findOne({
      projectId,
      name: baseBranch,
      status: { $ne: 'deleted' },
    });

    if (!baseBranchDoc) {
      throw new AppError('NOT_FOUND', 'Base branch not found', 404);
    }

    // Everyone can use any branch as base branch - no access restrictions
    console.log(`[Create Branch] Base branch "${baseBranch}" found (isPrimary: ${baseBranchDoc.isPrimary}, name: ${baseBranchDoc.name})`);

    // Convert userId to string for consistency
    const userIdString = String(userId || '');
    
    // Log branch creation with userId for debugging
    console.log(`[Create Branch] Creating branch "${fullName}" with creator userId: ${userIdString}`);
    
    // Verify user exists before creating branch
    const creatorCheck = await User.findOne({ userId: userIdString });
    if (!creatorCheck) {
      console.warn(`[Create Branch] Warning: User with userId "${userIdString}" not found in User collection. Branch will still be created.`);
    }

    // Create branch - ensure createdBy is a string for consistent comparison
    const branch = await Branch.create({
      projectId,
      name: fullName,
      type,
      description: description || '',
      baseBranch,
      createdBy: userIdString,
      isPrimary: false,
      status: 'active',
    });
    
    console.log(`[Create Branch] Branch "${fullName}" created successfully with ID: ${branch._id}`);

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
        const commitHash = generateCommitHash(projectId, branch._id.toString(), 'Initial commit from base branch', userIdString);
        
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
          
          // Create commit record - ensure authorId is a string for consistency
          const commit = await Commit.create({
            projectId,
            branchId: branch._id,
            hash: commitHash,
            message: 'Initial commit from base branch',
            authorId: userIdString,
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
          // Create commit without snapshot file reference - ensure authorId is a string for consistency
        const commit = await Commit.create({
          projectId,
          branchId: branch._id,
          hash: commitHash,
          message: 'Initial commit from base branch',
          authorId: userIdString,
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

    // Check branch ownership: Only the branch owner can save changes
    const branchCreatorId = String(branch.createdBy || '');
    const currentUserIdString = String(userId || '');
    const isManager = req.teamMember?.role === 'manager';
    const isPrimaryBranch = branch.isPrimary === true || branch.name === 'main';
    
    // Managers can save to any branch, but designers can only save to their own branches
    // Exception: Primary/main branch can be saved by anyone (but typically only managers modify main)
    if (!isManager && branchCreatorId !== currentUserIdString && !isPrimaryBranch) {
      console.log(`[Save Branch Snapshot] Access denied: User "${currentUserIdString}" (role: ${req.teamMember?.role || 'unknown'}) attempted to save changes to branch "${branch.name}" owned by "${branchCreatorId}"`);
      throw new AppError('FORBIDDEN', 'Only the branch owner can save changes to this branch', 403);
    }
    
    console.log(`[Save Branch Snapshot] ✅ Access granted: User "${currentUserIdString}" saving snapshot to branch "${branch.name}"`);

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
    // BUT: Only save if the user is the branch owner (non-owners' changes are lost on checkout)
    if (sourceBranch && currentSnapshot) {
      const sourceBranchCreatorId = String(sourceBranch.createdBy || '');
      const currentUserIdString = String(userId || '');
      const isManager = req.teamMember?.role === 'manager';
      const isPrimaryBranch = sourceBranch.isPrimary === true || sourceBranch.name === 'main';
      
      // Only save if user is owner, manager, or it's the primary branch
      if (isManager || sourceBranchCreatorId === currentUserIdString || isPrimaryBranch) {
        const snapshotBuffer = Buffer.from(JSON.stringify(currentSnapshot));
        // Use the actual branch _id from the database to ensure consistency
        await saveCurrentSnapshot(snapshotBuffer, projectId, sourceBranch._id.toString());
        
        // Update source branch
        sourceBranch.updatedAt = new Date();
        await sourceBranch.save();
        
        console.log(`[Checkout Branch] ✅ Saved snapshot for source branch "${sourceBranch.name}" (user is owner/manager)`);
      } else {
        // Non-owner's changes are discarded - don't save
        console.log(`[Checkout Branch] ⚠️ Discarding changes: User "${currentUserIdString}" is not the owner of branch "${sourceBranch.name}" (owned by "${sourceBranchCreatorId}")`);
        // Don't throw error - just silently discard changes (this is expected behavior)
      }
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

/**
 * Debug endpoint to check branch creator data
 * This helps identify why creator names aren't showing
 */
const debugBranchCreators = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const branches = await Branch.find({
      projectId,
      status: { $ne: 'deleted' },
    }).sort({ createdAt: -1 });

    const allUsers = await User.find({});
    const allTeamMembers = await TeamMember.find({
      projectId,
      status: 'active',
    });

    const debugInfo = branches.map(branch => {
      // Use String() conversion for consistent comparison
      const branchCreatedBy = String(branch.createdBy || '');
      const user = allUsers.find(u => String(u.userId) === branchCreatedBy);
      const teamMember = allTeamMembers.find(tm => String(tm.userId) === branchCreatedBy);
      
      return {
        branchName: branch.name,
        branchCreatedBy: branch.createdBy,
        userFound: !!user,
        userDetails: user ? { userId: user.userId, name: user.name, email: user.email } : null,
        teamMemberFound: !!teamMember,
        teamMemberDetails: teamMember ? { userId: teamMember.userId, email: teamMember.email, role: teamMember.role } : null,
        allUserIds: allUsers.map(u => u.userId),
        allTeamMemberUserIds: allTeamMembers.map(tm => tm.userId),
      };
    });

    res.json({
      success: true,
      debug: {
        branches: debugInfo,
        totalUsers: allUsers.length,
        totalTeamMembers: allTeamMembers.length,
        allUserIds: allUsers.map(u => u.userId),
        allTeamMemberUserIds: allTeamMembers.map(tm => tm.userId),
      },
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
  debugBranchCreators,
};
