/**
 * Project Routes
 * 
 * Handles project-related endpoints
 */

const express = require('express');
const router = express.Router();
const {
  getProject,
  createProject,
  updateProjectSettings,
} = require('../controllers/projectController');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess, checkOwnerOrAdmin } = require('../middleware/authorization');

// GET /api/v1/projects/:projectId - Get project details
router.get('/:projectId', authenticate, checkProjectAccess, getProject);

// POST /api/v1/projects - Create new project
router.post('/', authenticate, createProject);

// PUT /api/v1/projects/:projectId/settings - Update project settings
router.put('/:projectId/settings', authenticate, checkProjectAccess, checkOwnerOrAdmin, updateProjectSettings);

module.exports = router;
