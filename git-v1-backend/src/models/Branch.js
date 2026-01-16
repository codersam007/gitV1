/**
 * Branch Model
 * 
 * Represents a branch in version control
 * Each branch contains commits and can be merged into other branches
 */

const mongoose = require('mongoose');

const branchSchema = new mongoose.Schema({
  projectId: {
    type: String,
    required: true,
    index: true,
    ref: 'Project',
  },
  
  // Full branch name (e.g., "feature/Q1-campaign")
  name: {
    type: String,
    required: true,
    trim: true,
  },
  
  // Branch type: feature, hotfix, design, experiment, main
  type: {
    type: String,
    required: true,
    enum: ['feature', 'hotfix', 'design', 'experiment', 'main'],
  },
  
  description: {
    type: String,
    default: '',
    trim: true,
  },
  
  // Parent branch name (branch this was created from)
  baseBranch: {
    type: String,
    required: true,
  },
  
  // User who created this branch
  createdBy: {
    type: String,
    required: true,
    ref: 'User',
  },
  
  // Latest commit information
  lastCommit: {
    hash: { type: String, default: null },
    message: { type: String, default: null },
    timestamp: { type: Date, default: null },
    authorId: { type: String, default: null },
  },
  
  // Whether this is the primary/main branch
  isPrimary: {
    type: Boolean,
    default: false,
  },
  
  // Branch status: active, merged, deleted
  status: {
    type: String,
    enum: ['active', 'merged', 'deleted'],
    default: 'active',
    index: true,
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
    index: true,
  },
}, {
  timestamps: true,
});

// Compound index for unique branch names per project
branchSchema.index({ projectId: 1, name: 1 }, { unique: true });

// Update updatedAt before saving
branchSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Branch', branchSchema);
