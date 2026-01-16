/**
 * File Storage Service
 * 
 * Handles file storage for design snapshots
 * Currently uses local file system
 * TODO: Migrate to AWS S3 or Google Cloud Storage for production
 * 
 * Benefits of cloud storage:
 * - Scalability: Handle large files and high traffic
 * - CDN integration: Faster file delivery globally
 * - Reliability: Built-in redundancy and backup
 * - Cost-effective: Pay only for what you use
 * - Security: Built-in access controls and encryption
 */

const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/config');

/**
 * Ensure directory exists
 * @param {String} dirPath - Directory path
 */
const ensureDirectory = async (dirPath) => {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
};

/**
 * Save file to local storage
 * @param {Buffer|String} fileData - File data to save
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 * @param {String} commitHash - Commit hash
 * @param {String} extension - File extension (e.g., 'json', 'png')
 * @returns {String} File path
 */
const saveFile = async (fileData, projectId, branchId, commitHash, extension = 'json') => {
  try {
    // Create directory structure: storage/projects/{projectId}/branches/{branchId}/commits/
    const dirPath = path.join(
      config.storage.path,
      'projects',
      projectId,
      'branches',
      branchId.toString(),
      'commits'
    );

    await ensureDirectory(dirPath);

    // Create filename with commit hash
    const filename = `${commitHash}.${extension}`;
    const filePath = path.join(dirPath, filename);

    // Write file
    await fs.writeFile(filePath, fileData);

    // Return relative path (for now)
    // TODO: When migrating to S3, return S3 URL instead
    return filePath;
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error('Failed to save file');
  }
};

/**
 * Read file from storage
 * @param {String} filePath - File path
 * @returns {Buffer} File data
 */
const readFile = async (filePath) => {
  try {
    return await fs.readFile(filePath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('File not found');
    }
    throw error;
  }
};

/**
 * Delete file from storage
 * @param {String} filePath - File path
 */
const deleteFile = async (filePath) => {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw error;
    }
  }
};

/**
 * Save current branch snapshot
 * @param {Buffer|String} fileData - File data
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 * @returns {String} File path
 */
const saveCurrentSnapshot = async (fileData, projectId, branchId) => {
  try {
    const dirPath = path.join(
      config.storage.path,
      'projects',
      projectId,
      'branches',
      branchId.toString()
    );

    await ensureDirectory(dirPath);

    const filePath = path.join(dirPath, 'current.json');
    await fs.writeFile(filePath, fileData);

    return filePath;
  } catch (error) {
    console.error('Error saving current snapshot:', error);
    throw new Error('Failed to save current snapshot');
  }
};

/**
 * Get current branch snapshot
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 * @returns {Buffer} File data
 */
const getCurrentSnapshot = async (projectId, branchId) => {
  try {
    const filePath = path.join(
      config.storage.path,
      'projects',
      projectId,
      'branches',
      branchId.toString(),
      'current.json'
    );

    return await readFile(filePath);
  } catch (error) {
    throw new Error('Current snapshot not found');
  }
};

/**
 * Copy current snapshot from source branch to target branch
 * @param {String} projectId - Project ID
 * @param {String} sourceBranchId - Source branch ID
 * @param {String} targetBranchId - Target branch ID
 * @returns {String} File path of copied snapshot
 */
const copyCurrentSnapshot = async (projectId, sourceBranchId, targetBranchId) => {
  try {
    // Get source branch snapshot
    const sourceSnapshot = await getCurrentSnapshot(projectId, sourceBranchId);
    
    // Save to target branch
    const targetPath = await saveCurrentSnapshot(sourceSnapshot, projectId, targetBranchId);
    
    return targetPath;
  } catch (error) {
    // If source snapshot doesn't exist, that's okay - new branch starts empty
    if (error.message === 'Current snapshot not found') {
      console.log(`No snapshot found for source branch ${sourceBranchId}, new branch will start empty`);
      return null;
    }
    console.error('Error copying current snapshot:', error);
    throw new Error('Failed to copy current snapshot');
  }
};

/**
 * TODO: Implement S3 upload
 * Example implementation:
 * 
 * const AWS = require('aws-sdk');
 * const s3 = new AWS.S3();
 * 
 * const uploadToS3 = async (fileData, key) => {
 *   const params = {
 *     Bucket: process.env.S3_BUCKET_NAME,
 *     Key: key,
 *     Body: fileData,
 *     ContentType: 'application/json',
 *   };
 *   
 *   const result = await s3.upload(params).promise();
 *   return result.Location; // S3 URL
 * };
 */

module.exports = {
  saveFile,
  readFile,
  deleteFile,
  saveCurrentSnapshot,
  getCurrentSnapshot,
  copyCurrentSnapshot,
};
