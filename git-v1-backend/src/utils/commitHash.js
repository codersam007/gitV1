/**
 * Commit Hash Utility
 * 
 * Generates unique commit hashes for version control
 * Uses crypto to create SHA-256 hashes
 */

const crypto = require('crypto');

/**
 * Generate commit hash
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 * @param {String} message - Commit message
 * @param {String} authorId - Author user ID
 * @param {String} parentHash - Parent commit hash (optional)
 * @returns {String} Commit hash (first 12 characters of SHA-256)
 */
const generateCommitHash = (projectId, branchId, message, authorId, parentHash = null) => {
  const data = `${projectId}-${branchId}-${message}-${authorId}-${parentHash || ''}-${Date.now()}`;
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return hash.substring(0, 12); // Use first 12 characters
};

module.exports = {
  generateCommitHash,
};
