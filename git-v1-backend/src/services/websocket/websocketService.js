/**
 * WebSocket Service
 * 
 * Handles real-time updates via WebSocket
 * Uses Socket.io for bidirectional communication
 * 
 * Events:
 * - branch:created, branch:updated, branch:deleted
 * - merge:created, merge:approved, merge:merged, merge:closed
 * - team:member_added, team:member_updated
 */

let io = null;

/**
 * Initialize WebSocket server
 * @param {Object} server - HTTP server instance
 */
const initializeWebSocket = (server) => {
  const { Server } = require('socket.io');
  const jwt = require('jsonwebtoken');
  const config = require('../../config/config');
  const User = require('../../models/User');

  io = new Server(server, {
    cors: {
      origin: config.cors.origin,
      methods: ['GET', 'POST'],
    },
  });

  // Authentication middleware for WebSocket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findOne({ userId: decoded.userId });

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      socket.userId = user.userId;
      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle connection
  io.on('connection', (socket) => {
    console.log(`✅ WebSocket client connected: ${socket.userId}`);

    // Join project room
    socket.on('join:project', (projectId) => {
      socket.join(`project:${projectId}`);
      console.log(`User ${socket.userId} joined project:${projectId}`);
    });

    // Leave project room
    socket.on('leave:project', (projectId) => {
      socket.leave(`project:${projectId}`);
      console.log(`User ${socket.userId} left project:${projectId}`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`❌ WebSocket client disconnected: ${socket.userId}`);
    });
  });

  console.log('✅ WebSocket server initialized');
  return io;
};

/**
 * Emit event to project room
 * @param {String} projectId - Project ID
 * @param {String} event - Event name
 * @param {Object} data - Event data
 */
const emitToProject = (projectId, event, data) => {
  if (io) {
    io.to(`project:${projectId}`).emit(event, data);
    console.log(`📡 Emitted ${event} to project:${projectId}`);
  }
};

/**
 * Emit branch created event
 */
const emitBranchCreated = (projectId, branch) => {
  emitToProject(projectId, 'branch:created', { branch });
};

/**
 * Emit branch updated event
 */
const emitBranchUpdated = (projectId, branch) => {
  emitToProject(projectId, 'branch:updated', { branch });
};

/**
 * Emit branch deleted event
 */
const emitBranchDeleted = (projectId, branchName) => {
  emitToProject(projectId, 'branch:deleted', { branchName });
};

/**
 * Emit merge request created event
 */
const emitMergeRequestCreated = (projectId, mergeRequest) => {
  emitToProject(projectId, 'merge:created', { mergeRequest });
};

/**
 * Emit merge request approved event
 */
const emitMergeRequestApproved = (projectId, mergeRequest) => {
  emitToProject(projectId, 'merge:approved', { mergeRequest });
};

/**
 * Emit merge request merged event
 */
const emitMergeRequestMerged = (projectId, mergeRequest) => {
  emitToProject(projectId, 'merge:merged', { mergeRequest });
};

/**
 * Emit merge request closed event
 */
const emitMergeRequestClosed = (projectId, mergeRequest) => {
  emitToProject(projectId, 'merge:closed', { mergeRequest });
};

/**
 * Emit team member added event
 */
const emitTeamMemberAdded = (projectId, teamMember) => {
  emitToProject(projectId, 'team:member_added', { teamMember });
};

/**
 * Emit team member updated event
 */
const emitTeamMemberUpdated = (projectId, teamMember) => {
  emitToProject(projectId, 'team:member_updated', { teamMember });
};

module.exports = {
  initializeWebSocket,
  emitBranchCreated,
  emitBranchUpdated,
  emitBranchDeleted,
  emitMergeRequestCreated,
  emitMergeRequestApproved,
  emitMergeRequestMerged,
  emitMergeRequestClosed,
  emitTeamMemberAdded,
  emitTeamMemberUpdated,
};
