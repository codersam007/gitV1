/**
 * Team Routes
 * 
 * Handles team member management endpoints
 */

const express = require('express');
const router = express.Router();
const {
  getTeamMembers,
  inviteMember,
  acceptInvitation,
  updateMemberRole,
  removeMember,
} = require('../controllers/teamController');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess, checkOwnerOrAdmin } = require('../middleware/authorization');
const { validateInviteMember } = require('../utils/validators');

// GET /api/v1/team?projectId=:projectId - Get team members
router.get('/', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getTeamMembers);

// POST /api/v1/team/invite - Invite team member
router.post('/invite', authenticate, (req, res, next) => {
  req.params.projectId = req.body.projectId;
  next();
}, checkProjectAccess, checkOwnerOrAdmin, validateInviteMember, inviteMember);

// POST /api/v1/team/accept-invite - Accept invitation
router.post('/accept-invite', acceptInvitation);

// PUT /api/v1/team/:userId/role?projectId=:projectId - Update member role
router.put('/:userId/role', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkOwnerOrAdmin, updateMemberRole);

// DELETE /api/v1/team/:userId?projectId=:projectId - Remove team member
router.delete('/:userId', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkOwnerOrAdmin, removeMember);

module.exports = router;
