/**
 * Merge Request Routes
 * 
 * Handles merge request endpoints
 */

const express = require('express');
const router = express.Router();
const {
  getMergeRequests,
  getMergeRequest,
  createMergeRequest,
  approveMergeRequest,
  requestChanges,
  completeMerge,
} = require('../controllers/mergeRequestController');
const { authenticate } = require('../middleware/auth');
const { checkProjectAccess, checkReviewer, checkManager } = require('../middleware/authorization');
const { validateCreateMergeRequest } = require('../utils/validators');

// GET /api/v1/merge-requests?projectId=:projectId&status=:status - Get merge requests
router.get('/', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getMergeRequests);

// GET /api/v1/merge-requests/:mergeRequestId?projectId=:projectId - Get single merge request
router.get('/:mergeRequestId', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, getMergeRequest);

// POST /api/v1/merge-requests - Create merge request
router.post('/', authenticate, (req, res, next) => {
  // Extract projectId from body and add to params for middleware
  if (req.body.projectId) {
    req.params.projectId = req.body.projectId;
  }
  next();
}, checkProjectAccess, validateCreateMergeRequest, createMergeRequest);

// POST /api/v1/merge-requests/:mergeRequestId/approve - Approve merge request
router.post('/:mergeRequestId/approve', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkReviewer, approveMergeRequest);

// POST /api/v1/merge-requests/:mergeRequestId/request-changes - Request changes
router.post('/:mergeRequestId/request-changes', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkReviewer, requestChanges);

// POST /api/v1/merge-requests/:mergeRequestId/merge - Complete merge
// Only managers can complete merge (designers can only approve)
router.post('/:mergeRequestId/merge', authenticate, (req, res, next) => {
  req.params.projectId = req.query.projectId;
  next();
}, checkProjectAccess, checkManager, completeMerge);

module.exports = router;
