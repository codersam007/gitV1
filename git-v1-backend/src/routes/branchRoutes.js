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
  getBranchSnapshot,
  saveBranchSnapshot,
  checkoutBranch,
} = require('../controllers/branchController');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess, checkManager } = require('../middleware/authorization');
const { validateCreateBranch } = require('../utils/validators');

// GET /api/v1/branches?projectId=:projectId - Get all branches
// Note: projectId comes from query params, so we need to add it to req.params for middleware
router.get('/', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getBranches);

// POST /api/v1/branches - Create new branch
router.post('/', authenticate, (req, res, next) => {
  req.params.projectId = req.body.projectId;
  next();
}, checkProjectAccess, validateCreateBranch, createBranch);

// POST /api/v1/branches/checkout?projectId=:projectId - Checkout branch
// Must come before generic routes to avoid conflicts
router.post('/checkout', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkoutBranch);

// GET /api/v1/branches/:branchId/snapshot?projectId=:projectId - Get branch snapshot
// Must come before generic /:branchName route to avoid conflicts
router.get('/:branchId/snapshot', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getBranchSnapshot);

// POST /api/v1/branches/:branchId/snapshot?projectId=:projectId - Save branch snapshot
// Must come before generic /:branchName route to avoid conflicts
router.post('/:branchId/snapshot', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, saveBranchSnapshot);

// GET /api/v1/branches/:branchName?projectId=:projectId - Get single branch
// Using regex to handle branch names with forward slashes (e.g., "design/TEST3")
// The regex .+ matches one or more characters including forward slashes
// Must come AFTER specific routes like /:branchId/snapshot
router.get('/:branchName(.+)', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getBranch);

// DELETE /api/v1/branches/:branchName?projectId=:projectId - Delete branch
// Only managers can delete branches
// Using regex to handle branch names with forward slashes (e.g., "design/TEST3")
// The regex .+ matches one or more characters including forward slashes
router.delete('/:branchName(.+)', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkManager, deleteBranch);

module.exports = router;
