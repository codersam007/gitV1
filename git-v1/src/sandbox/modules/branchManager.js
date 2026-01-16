/**
 * ============================================
 * BRANCH MANAGER MODULE
 * ============================================
 * 
 * Manages branch state and switching logic.
 * This module:
 * - Tracks the current active branch
 * - Handles branch switching operations
 * - Manages branch state persistence
 */

// Current branch state
let currentBranchId = null;
let currentBranchName = null;
let branchStateHash = null; // Hash of current branch state for change detection

/**
 * Initialize branch manager
 * 
 * @param {string} branchId - Initial branch ID
 * @param {string} branchName - Initial branch name
 */
export function initializeBranch(branchId, branchName) {
    currentBranchId = branchId;
    currentBranchName = branchName;
    branchStateHash = null;
    console.log(`Branch manager initialized: ${branchName} (${branchId})`);
}

/**
 * Get current branch information
 * 
 * @returns {Object} Current branch info
 */
export function getCurrentBranch() {
    return {
        branchId: currentBranchId,
        branchName: currentBranchName,
        stateHash: branchStateHash
    };
}

/**
 * Set current branch
 * 
 * @param {string} branchId - Branch ID
 * @param {string} branchName - Branch name
 */
export function setCurrentBranch(branchId, branchName) {
    currentBranchId = branchId;
    currentBranchName = branchName;
    console.log(`Switched to branch: ${branchName} (${branchId})`);
}

/**
 * Update branch state hash
 * This is used to detect if the document has uncommitted changes
 * 
 * @param {string} hash - State hash
 */
export function updateBranchStateHash(hash) {
    branchStateHash = hash;
}

/**
 * Check if branch has uncommitted changes
 * Compares current document state hash with saved branch state hash
 * 
 * @param {string} currentStateHash - Current document state hash
 * @returns {boolean} True if there are uncommitted changes
 */
export function hasUncommittedChanges(currentStateHash) {
    if (!branchStateHash) {
        // No saved state, so no changes to detect
        return false;
    }
    return currentStateHash !== branchStateHash;
}

/**
 * Reset branch state (after commit or discard)
 */
export function resetBranchState() {
    branchStateHash = null;
}
