/**
 * Team Controller
 * 
 * Handles team member management
 */

const TeamMember = require('../models/TeamMember');
const User = require('../models/User');
const { AppError } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');
const {
  emitTeamMemberAdded,
  emitTeamMemberUpdated,
} = require('../services/websocket/websocketService');
const { sendTeamInvitation } = require('../services/email/emailService');

/**
 * Get team members
 */
const getTeamMembers = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const teamMembers = await TeamMember.find({ projectId })
      .sort({ createdAt: -1 })
      .exec();

    // Manually populate user data (since userId is a string, not ObjectId)
    const teamMembersWithUsers = await Promise.all(
      teamMembers.map(async (member) => {
        const memberObj = member.toObject();
        
        // Get user data
        if (member.userId) {
          const user = await User.findOne({ userId: member.userId });
          memberObj.user = user ? {
            userId: user.userId,
            name: user.name,
            email: user.email,
            avatarUrl: user.avatarUrl,
          } : null;
        }
        
        return memberObj;
      })
    );

    res.json({
      success: true,
      teamMembers: teamMembersWithUsers,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Invite team member
 */
const inviteMember = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { email, role } = req.body;
    const userId = req.userId;

    // Check if user already exists
    let user = await User.findOne({ email });

    if (!user) {
      // Create user placeholder (they'll complete profile when accepting invite)
      user = await User.create({
        userId: `temp_${uuidv4()}`,
        email,
        name: email.split('@')[0], // Temporary name
      });
    }

    // Check if already a team member
    const existingMember = await TeamMember.findOne({
      projectId,
      userId: user.userId,
    });

    if (existingMember) {
      throw new AppError('CONFLICT', 'User is already a team member', 409);
    }

    // Generate invitation token
    const invitationToken = uuidv4();

    // Create team member record
    const teamMember = await TeamMember.create({
      projectId,
      userId: user.userId,
      email,
      role: role || 'designer',
      status: 'pending',
      invitedBy: userId,
      invitationToken,
    });

    // Send invitation email
    try {
      const inviter = await User.findOne({ userId });
      const project = await Project.findOne({ projectId });
      
      await sendTeamInvitation(
        email,
        project?.name || 'Project',
        inviter?.name || 'Team Member',
        invitationToken,
        projectId
      );
    } catch (error) {
      console.error('Failed to send invitation email:', error);
    }

    // Emit WebSocket event
    emitTeamMemberAdded(projectId, teamMember);

    res.status(201).json({
      success: true,
      message: 'Invitation sent',
      teamMember,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Accept invitation
 * Can be called with or without authentication
 * If authenticated, links the invitation to the real user account
 */
const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.userId; // May be undefined if not authenticated

    const teamMember = await TeamMember.findOne({
      invitationToken: token,
      status: 'pending',
    });

    if (!teamMember) {
      throw new AppError('NOT_FOUND', 'Invalid or expired invitation token', 404);
    }

    // Check if invitation is expired (7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    if (teamMember.invitedAt < sevenDaysAgo) {
      throw new AppError('EXPIRED', 'Invitation has expired', 410);
    }

    // If user is authenticated, link to their real account
    if (userId) {
      // Update userId if it was a temp user
      if (teamMember.userId.startsWith('temp_')) {
        teamMember.userId = userId;
        
        // Update or create User record
        let user = await User.findOne({ userId });
        if (!user) {
          // Create user if doesn't exist
          user = await User.create({
            userId,
            email: teamMember.email,
            name: teamMember.email.split('@')[0],
          });
        } else {
          // Update email if different
          if (user.email !== teamMember.email) {
            user.email = teamMember.email;
            await user.save();
          }
        }
      }
    }

    teamMember.status = 'active';
    teamMember.joinedAt = new Date();
    teamMember.invitationToken = null;
    teamMember.lastActiveAt = new Date();
    await teamMember.save();

    // Emit WebSocket event
    emitTeamMemberUpdated(teamMember.projectId, teamMember);

    res.json({
      success: true,
      message: 'Invitation accepted',
      projectId: teamMember.projectId,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update team member role
 */
const updateMemberRole = async (req, res, next) => {
  try {
    const { projectId, userId } = req.params;
    const { role } = req.body;

    const teamMember = await TeamMember.findOne({
      projectId,
      userId,
    });

    if (!teamMember) {
      throw new AppError('NOT_FOUND', 'Team member not found', 404);
    }

    teamMember.role = role;
    await teamMember.save();

    // Emit WebSocket event
    emitTeamMemberUpdated(projectId, teamMember);

    res.json({
      success: true,
      teamMember,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Remove team member
 */
const removeMember = async (req, res, next) => {
  try {
    const { projectId, userId } = req.params;

    const teamMember = await TeamMember.findOne({
      projectId,
      userId,
    });

    if (!teamMember) {
      throw new AppError('NOT_FOUND', 'Team member not found', 404);
    }

    // Cannot remove owner
    if (teamMember.role === 'owner') {
      throw new AppError('FORBIDDEN', 'Cannot remove project owner', 403);
    }

    await teamMember.remove();

    res.json({
      success: true,
      message: 'Team member removed',
    });
  } catch (error) {
    next(error);
  }
};

const Project = require('../models/Project');

/**
 * Add designer directly (for hackathon demo - no email)
 */
const addDesigner = async (req, res, next) => {
  try {
    const { projectId } = req.params;
    const { name, email } = req.body;
    const userId = req.userId; // Manager who is adding

    if (!name || !name.trim()) {
      throw new AppError('VALIDATION_ERROR', 'Designer name is required', 400);
    }

    // Generate unique user ID for designer
    const designerUserId = `designer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create or get user
    let user = await User.findOne({ email: email || `${name.toLowerCase().replace(/\s+/g, '')}@demo.com` });
    
    if (!user) {
      user = await User.create({
        userId: designerUserId,
        email: email || `${name.toLowerCase().replace(/\s+/g, '')}@demo.com`,
        name: name.trim(),
      });
    }

    // Check if already a team member
    const existingMember = await TeamMember.findOne({
      projectId,
      userId: user.userId,
    });

    if (existingMember) {
      throw new AppError('CONFLICT', 'User is already a team member', 409);
    }

    // Create team member record (immediately active, no invitation)
    const teamMember = await TeamMember.create({
      projectId,
      userId: user.userId,
      email: user.email,
      role: 'designer',
      status: 'active',
      invitedBy: userId,
      joinedAt: new Date(),
      lastActiveAt: new Date(),
    });

    // Emit WebSocket event
    emitTeamMemberAdded(projectId, teamMember);

    res.status(201).json({
      success: true,
      message: 'Designer added successfully',
      teamMember: {
        ...teamMember.toObject(),
        user: {
          userId: user.userId,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get all users in project (for user switcher)
 */
const getAllUsers = async (req, res, next) => {
  try {
    const { projectId } = req.params;

    const teamMembers = await TeamMember.find({ 
      projectId,
      status: 'active' 
    }).sort({ joinedAt: 1 }).exec();

    // Get user details for each team member
    const usersWithDetails = await Promise.all(
      teamMembers.map(async (member) => {
        const user = await User.findOne({ userId: member.userId });
        return {
          userId: member.userId,
          name: user?.name || member.email,
          email: user?.email || member.email,
          role: member.role,
          avatarUrl: user?.avatarUrl,
        };
      })
    );

    res.json({
      success: true,
      users: usersWithDetails,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getTeamMembers,
  inviteMember,
  acceptInvitation,
  updateMemberRole,
  removeMember,
  addDesigner,
  getAllUsers,
};
