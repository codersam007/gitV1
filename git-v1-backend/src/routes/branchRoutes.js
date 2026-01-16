/**
 * Branch Routes
 * 
 * Handles branch-related endpoints
 */

const express = require('express');
const router = express.Router();
const {
  getBranches,
  getBranch,
  createBranch,
  deleteBranch,
} = require('../controllers/branchController');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/authorization');
const { validateCreateBranch } = require('../utils/validators');

// GET /api/v1/branches?projectId=:projectId - Get all branches
// Note: projectId comes from query params, so we need to add it to req.params for middleware
router.get('/', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getBranches);

// GET /api/v1/branches/:branchName?projectId=:projectId - Get single branch
router.get('/:branchName', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getBranch);

// POST /api/v1/branches - Create new branch
router.post('/', authenticate, (req, res, next) => {
  req.params.projectId = req.body.projectId;
  next();
}, checkProjectAccess, validateCreateBranch, createBranch);

// DELETE /api/v1/branches/:branchName?projectId=:projectId - Delete branch
router.delete('/:branchName', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, deleteBranch);

module.exports = router;
