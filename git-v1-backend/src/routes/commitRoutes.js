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
} = require('../controllers/commitController');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess } = require('../middleware/authorization');

// GET /api/v1/history?projectId=:projectId&branch=:branchName&limit=:limit - Get commit history
router.get('/', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getHistory);

// POST /api/v1/commits - Create new commit (with file upload)
router.post('/', authenticate, (req, res, next) => {
  req.params.projectId = req.body.projectId;
  next();
}, checkProjectAccess, uploadMiddleware, createCommit);

module.exports = router;
