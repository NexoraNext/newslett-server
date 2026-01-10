/**
 * Standard API Response Utility
 * Provides consistent response format across all endpoints
 */

const { v4: uuidv4 } = require('uuid');

class ApiResponse {
    /**
     * Success response
     * @param {Object} res - Express response object
     * @param {String} message - Success message
     * @param {*} data - Response data
     * @param {Number} statusCode - HTTP status code (default: 200)
     */
    static success(res, message, data = null, statusCode = 200) {
        const response = {
            success: true,
            message,
            data,
            error: null,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId || uuidv4()
            }
        };

        console.log(`[API RESPONSE] ${statusCode} - ${message}`);
        return res.status(statusCode).json(response);
    }

    /**
     * Created response (201)
     */
    static created(res, message, data = null) {
        return ApiResponse.success(res, message, data, 201);
    }

    /**
     * Error response
     * @param {Object} res - Express response object
     * @param {String} message - Error message
     * @param {Number} statusCode - HTTP status code (default: 500)
     * @param {Object} details - Additional error details
     */
    static error(res, message, statusCode = 500, details = null) {
        const errorCodes = {
            400: 'BAD_REQUEST',
            401: 'UNAUTHORIZED',
            403: 'FORBIDDEN',
            404: 'NOT_FOUND',
            409: 'CONFLICT',
            422: 'VALIDATION_ERROR',
            429: 'RATE_LIMIT_EXCEEDED',
            500: 'INTERNAL_ERROR',
            502: 'BAD_GATEWAY',
            503: 'SERVICE_UNAVAILABLE'
        };

        const response = {
            success: false,
            message,
            data: null,
            error: {
                code: errorCodes[statusCode] || 'UNKNOWN_ERROR',
                statusCode,
                details
            },
            meta: {
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId || uuidv4()
            }
        };

        console.error(`[API ERROR] ${statusCode} - ${message}`, details ? JSON.stringify(details) : '');
        return res.status(statusCode).json(response);
    }

    /**
     * Bad Request (400)
     */
    static badRequest(res, message = 'Bad request', details = null) {
        return ApiResponse.error(res, message, 400, details);
    }

    /**
     * Unauthorized (401)
     */
    static unauthorized(res, message = 'Unauthorized') {
        return ApiResponse.error(res, message, 401);
    }

    /**
     * Forbidden (403)
     */
    static forbidden(res, message = 'Forbidden') {
        return ApiResponse.error(res, message, 403);
    }

    /**
     * Not Found (404)
     */
    static notFound(res, message = 'Resource not found') {
        return ApiResponse.error(res, message, 404);
    }

    /**
     * Conflict (409)
     */
    static conflict(res, message = 'Resource conflict') {
        return ApiResponse.error(res, message, 409);
    }

    /**
     * Validation Error (422)
     */
    static validationError(res, message = 'Validation failed', errors = null) {
        return ApiResponse.error(res, message, 422, errors);
    }

    /**
     * Rate Limit (429)
     */
    static rateLimited(res, message = 'Too many requests') {
        return ApiResponse.error(res, message, 429);
    }

    /**
     * Internal Server Error (500)
     */
    static serverError(res, message = 'Internal server error', details = null) {
        return ApiResponse.error(res, message, 500, details);
    }

    /**
     * Paginated response
     */
    static paginated(res, message, data, pagination) {
        const response = {
            success: true,
            message,
            data,
            pagination: {
                page: pagination.page,
                limit: pagination.limit,
                total: pagination.total,
                totalPages: Math.ceil(pagination.total / pagination.limit),
                hasNext: pagination.page < Math.ceil(pagination.total / pagination.limit),
                hasPrev: pagination.page > 1
            },
            error: null,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId || uuidv4()
            }
        };

        return res.status(200).json(response);
    }
}

module.exports = ApiResponse;
