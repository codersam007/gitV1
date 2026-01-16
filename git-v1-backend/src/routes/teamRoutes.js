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
  addDesigner,
  getAllUsers,
} = require('../controllers/teamController');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { checkProjectAccess, checkManager } = require('../middleware/authorization');
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
}, checkProjectAccess, checkManager, validateInviteMember, inviteMember);

// POST /api/v1/team/accept-invite - Accept invitation
// Optional authentication - if user is logged in, links to their account
router.post('/accept-invite', optionalAuth, acceptInvitation);

// PUT /api/v1/team/:userId/role?projectId=:projectId - Update member role
router.put('/:userId/role', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkManager, updateMemberRole);

// DELETE /api/v1/team/:userId?projectId=:projectId - Remove team member
router.delete('/:userId', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkManager, removeMember);

// POST /api/v1/team/add-designer?projectId=:projectId - Add designer directly (hackathon demo)
router.post('/add-designer', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId || req.body.projectId;
  next();
}, checkProjectAccess, checkManager, addDesigner);

// GET /api/v1/team/users?projectId=:projectId - Get all users for switcher
router.get('/users', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getAllUsers);

module.exports = router;
