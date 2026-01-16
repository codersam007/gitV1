/**
 * Main Server File
 * 
 * Entry point for the Design Branch Manager backend API
 * Sets up Express server, middleware, routes, and WebSocket
 */

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config/config');
const { connectDB } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { initializeWebSocket } = require('./services/websocket/websocketService');

// Import routes
const authRoutes = require('./routes/authRoutes');
const projectRoutes = require('./routes/projectRoutes');
const branchRoutes = require('./routes/branchRoutes');
const commitRoutes = require('./routes/commitRoutes');
const mergeRequestRoutes = require('./routes/mergeRequestRoutes');
const teamRoutes = require('./routes/teamRoutes');

// Initialize Express app
const app = express();

// Create HTTP server (needed for WebSocket)
const server = http.createServer(app);

// Initialize WebSocket
initializeWebSocket(server);

// ============================================
// MIDDLEWARE
// ============================================

// Security middleware
app.use(helmet());

// CORS configuration
// Allow multiple origins including Adobe Express add-on origins
const allowedOrigins = [
  config.cors.origin,
  'https://localhost:5241', // Adobe Express add-on origin
  'https://localhost:*', // Any localhost HTTPS port (for Adobe Express)
  'https://express.adobe.com', // Production Adobe Express
  'https://*.express.adobe.com', // Adobe Express subdomains
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    const isAllowed = allowedOrigins.some(allowed => {
      if (allowed.includes('*')) {
        // Handle wildcard patterns like https://localhost:*
        const pattern = allowed.replace('*', '.*');
        const regex = new RegExp(pattern);
        return regex.test(origin);
      }
      return origin === allowed;
    });
    
    if (isAllowed) {
      callback(null, true);
    } else {
      // In development, allow all origins for easier testing
      if (config.nodeEnv === 'development') {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (simple version)
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl}`);
  next();
});

// ============================================
// ROUTES
// ============================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// API routes
app.use('/auth', authRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/branches', branchRoutes);
app.use('/api/v1/history', commitRoutes); // History endpoint
app.use('/api/v1/commits', commitRoutes); // Commit creation endpoint
app.use('/api/v1/merge-requests', mergeRequestRoutes);
app.use('/api/v1/team', teamRoutes);

// 404 handler
app.use(notFound);

// Error handler (must be last)
app.use(errorHandler);

// ============================================
// SERVER STARTUP
// ============================================

const startServer = async () => {
  try {
    // Connect to database
    await connectDB();

    // Start server
    const PORT = config.port;
    server.listen(PORT, () => {
      console.log('='.repeat(60));
      console.log('🚀 Design Branch Manager Backend Server');
      console.log('='.repeat(60));
      console.log(`✅ Server running on port ${PORT}`);
      console.log(`✅ Environment: ${config.nodeEnv}`);
      console.log(`✅ WebSocket server initialized`);
      console.log(`✅ API available at http://localhost:${PORT}`);
      console.log('='.repeat(60));
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('❌ Unhandled Promise Rejection:', err);
  // Close server & exit process
  server.close(() => {
    process.exit(1);
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('⚠️  SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('✅ Process terminated');
    process.exit(0);
  });
});

// Start the server
startServer();

module.exports = app;
