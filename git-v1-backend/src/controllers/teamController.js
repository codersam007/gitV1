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
        invitationToken
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
 */
const acceptInvitation = async (req, res, next) => {
  try {
    const { token } = req.body;

    const teamMember = await TeamMember.findOne({
      invitationToken: token,
      status: 'pending',
    });

    if (!teamMember) {
      throw new AppError('NOT_FOUND', 'Invalid or expired invitation token', 404);
    }

    teamMember.status = 'active';
    teamMember.joinedAt = new Date();
    teamMember.invitationToken = null;
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

module.exports = {
  getTeamMembers,
  inviteMember,
  acceptInvitation,
  updateMemberRole,
  removeMember,
};
