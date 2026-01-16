/**
 * Team Member Model
 * 
 * Represents team members in a project
 * Tracks roles, permissions, and activity
 */

const mongoose = require('mongoose');

const teamMemberSchema = new mongoose.Schema({
  projectId: {
    type: String,
    required: true,
    index: true,
    ref: 'Project',
  },
  
  userId: {
    type: String,
    required: true,
    index: true,
    ref: 'User',
  },
  
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  
  // Role: owner, admin, designer, viewer
  role: {
    type: String,
    enum: ['owner', 'admin', 'designer', 'viewer'],
    default: 'designer',
  },
  
  // Status: active, inactive, pending (invited but not accepted)
  status: {
    type: String,
    enum: ['active', 'inactive', 'pending'],
    default: 'pending',
    index: true,
  },
  
  // Invitation information
  invitedBy: {
    type: String,
    ref: 'User',
  },
  
  invitedAt: {
    type: Date,
    default: Date.now,
  },
  
  // Invitation token (for accepting invites)
  invitationToken: {
    type: String,
    default: null,
  },
  
  joinedAt: {
    type: Date,
    default: null,
  },
  
  lastActiveAt: {
    type: Date,
    default: Date.now,
  },
  
  // Commit count for this project
  commitCount: {
    type: Number,
    default: 0,
  },
}, {
  timestamps: false, // We manage timestamps manually
});

// Compound index for unique team members per project
teamMemberSchema.index({ projectId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('TeamMember', teamMemberSchema);
