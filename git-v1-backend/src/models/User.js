/**
 * User Model
 * 
 * Represents users in the system (Adobe Express users)
 * Stores user authentication and profile information
 */

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Adobe Express user ID (unique identifier from Adobe)
  userId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
  },
  
  name: {
    type: String,
    required: true,
    trim: true,
  },
  
  avatarUrl: {
    type: String,
    default: null,
  },
  
  // User preferences for notifications, etc.
  preferences: {
    notifications: {
      onMergeRequest: { type: Boolean, default: true },
      onBranchUpdate: { type: Boolean, default: true },
      onTeamInvite: { type: Boolean, default: true },
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
  timestamps: true, // Automatically manage createdAt and updatedAt
});

// Update updatedAt before saving
userSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('User', userSchema);
