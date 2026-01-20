// Unified Authentication Middleware
// Supports both Firebase Admin and JWT tokens
const jwt = require('jsonwebtoken');
const admin = require('../config/firebase');
const ApiResponse = require('../utils/apiResponse');
const { logger } = require('./logger');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'newslett-secret-key-change-in-production';

// ======================
// JWT AUTHENTICATION
// ======================

/**
 * Generate JWT token
 */
const generateToken = (userId) => {
    return jwt.sign(
        { id: userId },
        JWT_SECRET,
        { expiresIn: '30d' }
    );
};

/**
 * Verify JWT token and attach user to request
 */
const jwtAuthMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);

        if (!user) {
            return res.status(401).json({ error: 'User not found' });
        }

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        logger.error('JWT auth error:', error.message);
        res.status(401).json({ error: 'Invalid token' });
    }
};

// ======================
// FIREBASE AUTHENTICATION
// ======================

/**
 * Verify Firebase ID Token
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return ApiResponse.unauthorized(res, 'No token provided');
        }

        const token = authHeader.split(' ')[1];

        if (!admin.apps.length) {
            logger.error('Firebase Admin not initialized');
            return ApiResponse.serverError(res, 'Authentication service unavailable');
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        logger.error('Token verification failed', error);
        return ApiResponse.unauthorized(res, 'Invalid token');
    }
};

// ======================
// UNIFIED AUTHENTICATION
// ======================

/**
 * Smart auth middleware - tries JWT first, then Firebase
 * Use this for routes that should work with both auth methods
 */
const authMiddleware = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: 'Not authenticated' });
        }

        const token = authHeader.split(' ')[1];

        // Try JWT first (faster, no network call)
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (user) {
                req.user = user;
                req.token = token;
                return next();
            }
        } catch (jwtError) {
            // JWT failed, try Firebase
        }

        // Try Firebase if JWT failed
        if (admin.apps.length) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                // Get or create user from Firebase token
                const user = await User.getOrCreateByFirebase(decodedToken);
                req.user = user;
                req.firebaseToken = decodedToken;
                return next();
            } catch (firebaseError) {
                logger.debug('Firebase auth failed:', firebaseError.message);
            }
        }

        return res.status(401).json({ error: 'Invalid token' });
    } catch (error) {
        logger.error('Auth error:', error.message);
        res.status(401).json({ error: 'Authentication failed' });
    }
};

/**
 * Optional auth - doesn't fail if no token, sets req.user if valid
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.split(' ')[1];

        // Try JWT first
        try {
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (user) {
                req.user = user;
                req.token = token;
                return next();
            }
        } catch (e) { /* JWT failed, try Firebase */ }

        // Try Firebase
        if (admin.apps.length) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(token);
                const user = await User.getOrCreateByFirebase(decodedToken);
                req.user = user;
                return next();
            } catch (e) { /* Firebase also failed */ }
        }

        next();
    } catch (error) {
        next();
    }
};

// ======================
// ROLE CHECKS
// ======================

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!req.user.isAdmin && req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
};

/**
 * Require verified creator status
 */
const requireVerified = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!req.user.isVerified) {
        return res.status(403).json({ error: 'Only verified creators can perform this action' });
    }
    next();
};

/**
 * Require premium subscription
 */
const requirePremium = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ error: 'Not authenticated' });
    }
    if (!req.user.isPremium) {
        return res.status(403).json({ error: 'Premium subscription required' });
    }
    if (req.user.premiumExpiry && new Date(req.user.premiumExpiry) < new Date()) {
        return res.status(403).json({ error: 'Premium subscription expired' });
    }
    next();
};

module.exports = {
    // Token generation
    generateToken,
    JWT_SECRET,

    // Auth methods
    authMiddleware,      // Unified (JWT + Firebase)
    jwtAuthMiddleware,   // JWT only
    verifyToken,         // Firebase only
    optionalAuth,        // Non-blocking auth

    // Role checks
    requireAdmin,
    requireVerified,
    requirePremium
};
