const admin = require('../config/firebase');
const ApiResponse = require('../utils/apiResponse');
const { logger } = require('./logger');

/**
 * Middleware to verify Firebase ID Token
 */
const verifyToken = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return ApiResponse.unauthorized(res, 'No token provided');
        }

        const token = authHeader.split(' ')[1];

        if (!admin.apps.length) {
            logger.error('Firebase Admin not initialized - Check FIREBASE_SERVICE_ACCOUNT_PATH');
            return ApiResponse.serverError(res, 'Authentication service unavailable (Backend Config Missing)');
        }

        const decodedToken = await admin.auth().verifyIdToken(token);

        req.user = decodedToken;
        next();
    } catch (error) {
        logger.error('Token verification failed', error);
        return ApiResponse.unauthorized(res, 'Invalid token');
    }
};

/**
 * Middleware that tries to verify token but continues if missing
 * Used for endpoints supporting both Anonymous and Authenticated users
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next(); // Proceed without req.user
        }
        // Reuse verifyToken logic but handle error gracefully
        // We can't reuse verifyToken directly because it sends response on error
        // So we duplicate minimal logic or refactor. duplicating minimal for safety here:

        const token = authHeader.split(' ')[1];

        if (!admin.apps.length) return next();

        const decodedToken = await admin.auth().verifyIdToken(token);
        req.user = decodedToken;
        next();
    } catch (error) {
        // Ignore errors in optional auth, just verify what we can
        next();
    }
};

/**
 * Middleware to check for Admin role
 */
const requireAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        return ApiResponse.forbidden(res, 'Admin access required');
    }
};

module.exports = { verifyToken, requireAdmin, optionalAuth };
