/**
 * Authentication Routes
 * 
 * Handles authentication endpoints
 */

const express = require('express');
const router = express.Router();
const { login, refreshToken, getMe } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// POST /auth/login - Exchange Adobe token for JWT
router.post('/login', login);

// POST /auth/refresh - Refresh JWT token
router.post('/refresh', refreshToken);

// GET /auth/me - Get current user info (protected)
router.get('/me', authenticate, getMe);

module.exports = router;
