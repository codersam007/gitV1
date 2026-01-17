/**
 * File Storage Service
 * 
 * Handles file storage for design snapshots using MongoDB GridFS
 * GridFS provides persistent file storage across deployments on Render
 * 
 * Benefits of GridFS:
 * - Persistent storage across deployments
 * - No ephemeral filesystem issues
 * - Scalable (handles large files via chunking)
 * - Integrated with existing MongoDB setup
 */

const mongoose = require('mongoose');
const { GridFSBucket } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const config = require('../../config/config');

// GridFS bucket name for snapshots
const BUCKET_NAME = 'snapshots';

/**
 * Get GridFS bucket instance
 * @returns {GridFSBucket} GridFS bucket
 */
const getBucket = () => {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('Database connection not available');
  }
  return new GridFSBucket(db, { bucketName: BUCKET_NAME });
};

/**
 * Generate file path for GridFS
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 * @param {String} commitHash - Optional commit hash
 * @param {String} extension - File extension (default: 'json')
 * @returns {String} File path
 */
const generateFilePath = (projectId, branchId, commitHash = null, extension = 'json') => {
  if (commitHash) {
    return `projects/${projectId}/branches/${branchId}/commits/${commitHash}.${extension}`;
  }
  return `projects/${projectId}/branches/${branchId}/current.${extension}`;
};

/**
 * Save file to GridFS
 * @param {Buffer|String} fileData - File data to save
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 * @param {String} commitHash - Commit hash
 * @param {String} extension - File extension (e.g., 'json', 'png')
 * @returns {String} File path (GridFS filename)
 */
const saveFile = async (fileData, projectId, branchId, commitHash, extension = 'json') => {
  try {
    const bucket = getBucket();
    const filename = generateFilePath(projectId, branchId, commitHash, extension);
    
    // Convert string to Buffer if needed
    const buffer = Buffer.isBuffer(fileData) ? fileData : Buffer.from(fileData);
    
    // Delete existing file if it exists (GridFS allows multiple versions, we want one)
    try {
      await deleteFile(filename);
    } catch (error) {
      // File doesn't exist, that's okay
    }
    
    // Upload to GridFS
    return new Promise((resolve, reject) => {
      const uploadStream = bucket.openUploadStream(filename, {
        contentType: extension === 'json' ? 'application/json' : 'application/octet-stream',
        metadata: {
          projectId,
          branchId,
          commitHash: commitHash || null,
          extension,
          uploadedAt: new Date(),
        },
      });
      
      uploadStream.on('error', (error) => {
        console.error('Error uploading file to GridFS:', error);
        reject(new Error('Failed to save file'));
      });
      
      uploadStream.on('finish', () => {
        resolve(filename);
      });
      
      uploadStream.end(buffer);
    });
  } catch (error) {
    console.error('Error saving file:', error);
    throw new Error('Failed to save file');
  }
};

/**
 * Read file from GridFS
 * @param {String} filePath - File path (GridFS filename)
 * @returns {Buffer} File data
 */
const readFile = async (filePath) => {
  try {
    const bucket = getBucket();
    
    return new Promise((resolve, reject) => {
      const chunks = [];
      const downloadStream = bucket.openDownloadStreamByName(filePath);
      
      downloadStream.on('data', (chunk) => {
        chunks.push(chunk);
      });
      
      downloadStream.on('error', (error) => {
        if (error.code === 'ENOENT' || error.message.includes('FileNotFound')) {
          reject(new Error('File not found'));
        } else {
          console.error('Error reading file from GridFS:', error);
          reject(new Error('Failed to read file'));
        }
      });
      
      downloadStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
    });
  } catch (error) {
    if (error.message === 'File not found') {
      throw error;
    }
    console.error('Error reading file:', error);
    throw new Error('Failed to read file');
  }
};

/**
 * Delete file from GridFS
 * @param {String} filePath - File path (GridFS filename)
 */
const deleteFile = async (filePath) => {
  try {
    const bucket = getBucket();
    
    // Find file by filename
    const files = await bucket.find({ filename: filePath }).toArray();
    
    if (files.length === 0) {
      // File doesn't exist, that's okay
      return;
    }
    
    // Delete all versions of the file (should be just one, but be safe)
    for (const file of files) {
      await bucket.delete(file._id);
    }
  } catch (error) {
    console.error('Error deleting file from GridFS:', error);
    throw new Error('Failed to delete file');
  }
};

/**
 * Save current branch snapshot
 * @param {Buffer|String} fileData - File data
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 * @returns {String} File path (GridFS filename)
 */
const saveCurrentSnapshot = async (fileData, projectId, branchId) => {
  try {
    return await saveFile(fileData, projectId, branchId, null, 'json');
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
    const filePath = generateFilePath(projectId, branchId);
    return await readFile(filePath);
  } catch (error) {
    if (error.message === 'File not found') {
      throw new Error('Current snapshot not found');
    }
    throw error;
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
 * Get commit snapshot file
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 * @param {String} commitHash - Commit hash
 * @returns {Buffer} File data
 */
const getCommitSnapshot = async (projectId, branchId, commitHash) => {
  try {
    const filePath = generateFilePath(projectId, branchId, commitHash, 'json');
    return await readFile(filePath);
  } catch (error) {
    if (error.message === 'File not found') {
      throw new Error('Commit snapshot not found');
    }
    throw error;
  }
};

/**
 * Delete entire branch directory (including current.json and all commits)
 * @param {String} projectId - Project ID
 * @param {String} branchId - Branch ID
 */
const deleteBranchDirectory = async (projectId, branchId) => {
  try {
    const bucket = getBucket();
    
    // Find all files matching the branch path pattern
    const prefix = `projects/${projectId}/branches/${branchId}/`;
    const files = await bucket.find({ 
      filename: { $regex: `^${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}` } 
    }).toArray();
    
    // Delete all files for this branch
    for (const file of files) {
      await bucket.delete(file._id);
    }
    
    console.log(`Deleted ${files.length} file(s) for branch ${branchId}`);
  } catch (error) {
    console.error('Error deleting branch directory:', error);
    throw new Error('Failed to delete branch directory');
  }
};

module.exports = {
  saveFile,
  readFile,
  deleteFile,
  saveCurrentSnapshot,
  getCurrentSnapshot,
  copyCurrentSnapshot,
  deleteBranchDirectory,
  getCommitSnapshot,
};
