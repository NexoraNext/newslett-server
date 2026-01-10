/**
 * Global Error Handler Middleware
 * Catches all errors and returns a standardized response
 */

const ApiResponse = require('../utils/apiResponse');
const { logger } = require('./logger');

/**
 * Error types for classification
 */
const ErrorTypes = {
    VALIDATION_ERROR: 'ValidationError',
    CAST_ERROR: 'CastError',
    DUPLICATE_KEY: 'MongoServerError',
    JWT_ERROR: 'JsonWebTokenError',
    JWT_EXPIRED: 'TokenExpiredError'
};

/**
 * Main error handler middleware
 */
const errorHandler = (err, req, res, next) => {
    // Log the error with full details
    logger.error(`Error in ${req.method} ${req.originalUrl}`, err);

    // Default error response
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal server error';
    let details = null;

    // Handle specific error types
    switch (err.name) {
        case ErrorTypes.VALIDATION_ERROR:
            // Mongoose validation error
            statusCode = 422;
            message = 'Validation failed';
            details = Object.values(err.errors || {}).map(e => ({
                field: e.path,
                message: e.message
            }));
            break;

        case ErrorTypes.CAST_ERROR:
            // Invalid MongoDB ObjectId
            statusCode = 400;
            message = `Invalid ${err.path}: ${err.value}`;
            break;

        case ErrorTypes.DUPLICATE_KEY:
            // Duplicate key error
            if (err.code === 11000) {
                statusCode = 409;
                const field = Object.keys(err.keyValue || {})[0];
                message = `${field ? `${field} already exists` : 'Duplicate entry'}`;
                details = { field, value: err.keyValue?.[field] };
            }
            break;

        case ErrorTypes.JWT_ERROR:
            statusCode = 401;
            message = 'Invalid token';
            break;

        case ErrorTypes.JWT_EXPIRED:
            statusCode = 401;
            message = 'Token expired';
            break;
    }

    // Handle custom application errors
    if (err.isOperational) {
        statusCode = err.statusCode;
        message = err.message;
        details = err.details;
    }

    // Add stack trace in development mode
    if (process.env.NODE_ENV === 'development') {
        details = details || {};
        details.stack = err.stack;
    }

    return ApiResponse.error(res, message, statusCode, details);
};

/**
 * Custom operational error class
 */
class AppError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        this.isOperational = true;

        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * 404 Not Found handler
 */
const notFoundHandler = (req, res, next) => {
    const message = `Route not found: ${req.method} ${req.originalUrl}`;
    logger.warn(message);
    return ApiResponse.notFound(res, message);
};

/**
 * Async handler wrapper to catch errors in async routes
 */
const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

module.exports = {
    errorHandler,
    notFoundHandler,
    asyncHandler,
    AppError
};
