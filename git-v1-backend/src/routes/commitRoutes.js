/**
 * Commit Routes
 * 
 * Handles commit/version history endpoints
 */

const express = require('express');
const router = express.Router();
const {
  getHistory,
  createCommit,
  uploadMiddleware,
  revertToCommit,
} = require('../controllers/commitController');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/authorization');

// GET /api/v1/history?projectId=:projectId&branch=:branchName&limit=:limit - Get commit history
router.get('/', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getHistory);

// POST /api/v1/commits/:branchId/revert/:commitHash?projectId=:projectId - Revert branch to commit
// IMPORTANT: This route must come BEFORE the generic POST / route to ensure proper matching
// Using explicit path matching to avoid conflicts
router.post('/:branchId/revert/:commitHash', (req, res, next) => {
  console.log('🔍 Route matching attempt:', {
    method: req.method,
    path: req.path,
    originalUrl: req.originalUrl,
    params: req.params,
    query: req.query
  });
  next();
}, authenticate, (req, res, next) => {
  console.log('✅ Revert route matched after auth!', {
    branchId: req.params.branchId,
    commitHash: req.params.commitHash,
    projectId: req.query.projectId,
    originalUrl: req.originalUrl
  });
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, revertToCommit);

// POST /api/v1/commits - Create new commit (with file upload)
router.post('/', authenticate, (req, res, next) => {
  req.params.projectId = req.body.projectId;
  next();
}, checkProjectAccess, uploadMiddleware, createCommit);

module.exports = router;
