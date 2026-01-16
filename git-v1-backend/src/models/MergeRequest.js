/**
 * Merge Request Model
 * 
 * Represents a request to merge one branch into another
 * Includes review process, approvals, and conflict resolution
 */

const mongoose = require('mongoose');

const reviewerSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    ref: 'User',
    index: true,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'requested_changes', 'rejected'],
    default: 'pending',
  },
  reviewedAt: {
    type: Date,
    default: null,
  },
  comment: {
    type: String,
    default: null,
  },
}, { _id: false });

const conflictSchema = new mongoose.Schema({
  filePath: {
    type: String,
    required: true,
  },
  conflictType: {
    type: String,
    required: true,
  },
}, { _id: false });

const mergeRequestSchema = new mongoose.Schema({
  projectId: {
    type: String,
    required: true,
    index: true,
    ref: 'Project',
  },
  
  // Sequential merge request ID per project (e.g., #42, #43)
  mergeRequestId: {
    type: Number,
    required: true,
  },
  
  sourceBranch: {
    type: String,
    required: true,
  },
  
  targetBranch: {
    type: String,
    required: true,
  },
  
  title: {
    type: String,
    required: true,
    trim: true,
  },
  
  description: {
    type: String,
    default: '',
    trim: true,
  },
  
  // Merge request status
  status: {
    type: String,
    enum: ['open', 'approved', 'merged', 'closed', 'rejected'],
    default: 'open',
    index: true,
  },
  
  // User who created the merge request
  createdBy: {
    type: String,
    required: true,
    ref: 'User',
  },
  
  // Reviewers and their status
  reviewers: [reviewerSchema],
  
  // Conflicts detected during merge
  conflicts: [conflictSchema],
  
  // Statistics about the merge
  stats: {
    filesChanged: { type: Number, default: 0 },
    componentsUpdated: { type: Number, default: 0 },
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  
  mergedAt: {
    type: Date,
    default: null,
  },
  
  // User who merged (if merged)
  mergedBy: {
    type: String,
    default: null,
    ref: 'User',
  },
}, {
  timestamps: true,
});

// Compound index for unique merge request IDs per project
mergeRequestSchema.index({ projectId: 1, mergeRequestId: 1 }, { unique: true });

// Update updatedAt before saving
mergeRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('MergeRequest', mergeRequestSchema);
