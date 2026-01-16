/**
 * ============================================
 * STATE MANAGER MODULE
 * ============================================
 * 
 * Manages document state and change detection.
 * This module:
 * - Generates state hashes for change detection
 * - Tracks document modification state
 * - Provides utilities for state comparison
 */

import { exportDocument } from './documentManager.js';

/**
 * Generate a hash from document state
 * Used to detect if document has changed
 * 
 * @param {Object} documentState - Document state object
 * @returns {string} Hash string
 */
export function generateStateHash(documentState) {
    try {
        // Create a simple hash from document state
        // In production, you might want to use a proper hashing algorithm
        const stateString = JSON.stringify(documentState);
        
        // Simple hash function (for demo purposes)
        // In production, use crypto.createHash('sha256')
        let hash = 0;
        for (let i = 0; i < stateString.length; i++) {
            const char = stateString.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        
        return Math.abs(hash).toString(16);
    } catch (error) {
        console.error('Error generating state hash:', error);
        return Date.now().toString(); // Fallback to timestamp
    }
}

/**
 * Get current document state hash
 * 
 * @returns {Promise<string>} Current state hash
 */
export async function getCurrentStateHash() {
    try {
        const documentState = await exportDocument();
        return generateStateHash(documentState);
    } catch (error) {
        console.error('Error getting current state hash:', error);
        return null;
    }
}

/**
 * Compare two document states
 * 
 * @param {Object} state1 - First document state
 * @param {Object} state2 - Second document state
 * @returns {boolean} True if states are equal
 */
export function compareStates(state1, state2) {
    try {
        // Simple comparison - in production, you might want deeper comparison
        const hash1 = generateStateHash(state1);
        const hash2 = generateStateHash(state2);
        return hash1 === hash2;
    } catch (error) {
        console.error('Error comparing states:', error);
        return false;
    }
}

/**
 * Check if document has been modified since last save
 * 
 * @param {string} lastSavedHash - Hash of last saved state
 * @returns {Promise<boolean>} True if document has been modified
 */
export async function isDocumentModified(lastSavedHash) {
    try {
        if (!lastSavedHash) {
            // No saved state, assume modified
            return true;
        }
        
        const currentHash = await getCurrentStateHash();
        return currentHash !== lastSavedHash;
    } catch (error) {
        console.error('Error checking document modification:', error);
        return true; // Assume modified on error
    }
}
