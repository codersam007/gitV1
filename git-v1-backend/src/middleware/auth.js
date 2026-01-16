/**
 * Authentication Middleware
 * 
 * Validates JWT tokens and attaches user information to requests
 * Protects routes that require authentication
 */

const jwt = require('jsonwebtoken');
const config = require('../config/config');
const User = require('../models/User');

/**
 * Middleware to verify JWT token
 * Attaches user information to req.user if token is valid
 */
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'No token provided. Please include a valid JWT token in the Authorization header.',
        },
      });
    }

    // Extract token (remove 'Bearer ' prefix)
    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Get user from database
    const user = await User.findOne({ userId: decoded.userId });
    
    if (!user) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'User not found. Token may be invalid.',
        },
      });
    }

    // Attach user to request object
    req.user = user;
    req.userId = user.userId;
    
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Invalid token. Please provide a valid JWT token.',
        },
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: {
          code: 'TOKEN_EXPIRED',
          message: 'Token has expired. Please refresh your token.',
        },
      });
    }

    console.error('Auth middleware error:', error);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Authentication error occurred.',
      },
    });
  }
};

/**
 * Optional authentication middleware
 * Doesn't fail if token is missing, but attaches user if token is valid
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await User.findOne({ userId: decoded.userId });
      
      if (user) {
        req.user = user;
        req.userId = user.userId;
      }
    }
    
    next();
  } catch (error) {
    // Ignore errors for optional auth
    next();
  }
};

module.exports = {
  authenticate,
  optionalAuth,
};
