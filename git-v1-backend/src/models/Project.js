/**
 * Project Model
 * 
 * Represents a design project in Adobe Express
 * Each project has branches, merge requests, and team members
 */

const mongoose = require('mongoose');

const projectSchema = new mongoose.Schema({
  // Adobe Express project ID (unique identifier from Adobe)
  projectId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  name: {
    type: String,
    required: true,
    trim: true,
  },
  
  description: {
    type: String,
    default: '',
    trim: true,
  },
  
  // Owner of the project
  ownerId: {
    type: String,
    required: true,
    index: true,
    ref: 'User',
  },
  
  // Project settings
  settings: {
    branchProtection: {
      requireApproval: { type: Boolean, default: true },
      minReviews: { type: Number, default: 2, min: 0 },
      autoDeleteMerged: { type: Boolean, default: false },
    },
    notifications: {
      onMergeRequest: { type: Boolean, default: true },
      onBranchUpdate: { type: Boolean, default: true },
    },
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  
  updatedAt: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Update updatedAt before saving
projectSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Project', projectSchema);
