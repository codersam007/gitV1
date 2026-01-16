/**
 * Commit Model
 * 
 * Represents a version/commit in the version history
 * Each commit contains a snapshot of the design at that point in time
 */

const mongoose = require('mongoose');

const commitSchema = new mongoose.Schema({
  projectId: {
    type: String,
    required: true,
    index: true,
    ref: 'Project',
  },
  
  branchId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    index: true,
    ref: 'Branch',
  },
  
  // Unique commit hash (generated using crypto)
  hash: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  
  message: {
    type: String,
    required: true,
    trim: true,
  },
  
  // User who created this commit
  authorId: {
    type: String,
    required: true,
    ref: 'User',
  },
  
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
  
  // Change statistics
  changes: {
    filesAdded: { type: Number, default: 0 },
    filesModified: { type: Number, default: 0 },
    filesDeleted: { type: Number, default: 0 },
    componentsUpdated: { type: Number, default: 0 },
  },
  
  // Snapshot information
  snapshot: {
    // Local file path (for now)
    // TODO: Migrate to S3 URL when using cloud storage
    fileUrl: {
      type: String,
      required: true,
    },
    thumbnailUrl: {
      type: String,
      default: null,
    },
  },
  
  // Parent commit hash (for version history chain)
  parentCommitHash: {
    type: String,
    default: null,
    ref: 'Commit',
  },
}, {
  timestamps: false, // We use custom timestamp field
});

// Compound index for efficient querying
commitSchema.index({ projectId: 1, branchId: 1, timestamp: -1 });
commitSchema.index({ projectId: 1, timestamp: -1 });

module.exports = mongoose.model('Commit', commitSchema);
