/**
 * Authentication Controller
 * 
 * Handles user authentication and token management
 * TODO: Integrate with Adobe OAuth for production
 */

const User = require('../models/User');
const { generateToken, generateRefreshToken } = require('../services/auth/jwtService');
const { AppError } = require('../middleware/errorHandler');

/**
 * Login - Exchange Adobe token for JWT
 * TODO: Validate Adobe OAuth token with Adobe API
 */
const login = async (req, res, next) => {
  try {
    const { adobeToken, userId, email, name, avatarUrl } = req.body;

    // TODO: Validate adobeToken with Adobe API
    // const isValid = await validateAdobeToken(adobeToken);
    // if (!isValid) {
    //   throw new AppError('UNAUTHORIZED', 'Invalid Adobe token', 401);
    // }

    // Find or create user
    let user = await User.findOne({ userId });

    if (!user) {
      // Create new user
      user = await User.create({
        userId,
        email,
        name,
        avatarUrl: avatarUrl || null,
      });
    } else {
      // Update existing user info
      user.email = email;
      user.name = name;
      if (avatarUrl) user.avatarUrl = avatarUrl;
      await user.save();
    }

    // Generate tokens
    const token = generateToken({ userId: user.userId });
    const refreshToken = generateRefreshToken({ userId: user.userId });

    res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
      },
      token,
      refreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Refresh token
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('UNAUTHORIZED', 'Refresh token required', 401);
    }

    const { verifyRefreshToken } = require('../services/auth/jwtService');
    const decoded = verifyRefreshToken(refreshToken);

    const user = await User.findOne({ userId: decoded.userId });
    if (!user) {
      throw new AppError('UNAUTHORIZED', 'User not found', 401);
    }

    const token = generateToken({ userId: user.userId });
    const newRefreshToken = generateRefreshToken({ userId: user.userId });

    res.json({
      success: true,
      token,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get current user info
 */
const getMe = async (req, res, next) => {
  try {
    const user = await User.findOne({ userId: req.userId });

    if (!user) {
      throw new AppError('NOT_FOUND', 'User not found', 404);
    }

    res.json({
      success: true,
      user: {
        userId: user.userId,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        preferences: user.preferences,
      },
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  login,
  refreshToken,
  getMe,
};
