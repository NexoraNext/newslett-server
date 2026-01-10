/**
 * Logger Middleware
 * Provides detailed request/response logging for debugging
 */

const { v4: uuidv4 } = require('uuid');

// ANSI color codes for terminal output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m'
};

// Log levels
const LOG_LEVELS = {
    DEBUG: { priority: 0, color: colors.dim, label: 'DEBUG' },
    INFO: { priority: 1, color: colors.cyan, label: 'INFO' },
    WARN: { priority: 2, color: colors.yellow, label: 'WARN' },
    ERROR: { priority: 3, color: colors.red, label: 'ERROR' }
};

// Current log level (can be set via environment variable)
const currentLogLevel = process.env.LOG_LEVEL || 'DEBUG';

/**
 * Check if a log level should be displayed
 */
const shouldLog = (level) => {
    const current = LOG_LEVELS[currentLogLevel] || LOG_LEVELS.DEBUG;
    const target = LOG_LEVELS[level] || LOG_LEVELS.DEBUG;
    return target.priority >= current.priority;
};

/**
 * Format log message
 */
const formatLog = (level, message, data = null) => {
    const levelConfig = LOG_LEVELS[level] || LOG_LEVELS.INFO;
    const timestamp = new Date().toISOString();

    let formattedMessage = `${colors.dim}[${timestamp}]${colors.reset} `;
    formattedMessage += `${levelConfig.color}[${levelConfig.label}]${colors.reset} `;
    formattedMessage += message;

    if (data) {
        formattedMessage += `\n${colors.dim}${JSON.stringify(data, null, 2)}${colors.reset}`;
    }

    return formattedMessage;
};

/**
 * Logger object with methods for each log level
 */
const logger = {
    debug: (message, data = null) => {
        if (shouldLog('DEBUG')) {
            console.log(formatLog('DEBUG', message, data));
        }
    },

    info: (message, data = null) => {
        if (shouldLog('INFO')) {
            console.log(formatLog('INFO', message, data));
        }
    },

    warn: (message, data = null) => {
        if (shouldLog('WARN')) {
            console.warn(formatLog('WARN', message, data));
        }
    },

    error: (message, error = null) => {
        if (shouldLog('ERROR')) {
            let errorData = null;
            if (error) {
                errorData = {
                    message: error.message,
                    stack: error.stack,
                    ...(error.response && { response: error.response.data })
                };
            }
            console.error(formatLog('ERROR', message, errorData));
        }
    },

    /**
     * Log HTTP request
     */
    request: (req) => {
        if (shouldLog('DEBUG')) {
            const logData = {
                method: req.method,
                url: req.originalUrl,
                headers: {
                    'content-type': req.headers['content-type'],
                    'user-agent': req.headers['user-agent'],
                    'x-device-id': req.headers['x-device-id']
                },
                query: Object.keys(req.query).length > 0 ? req.query : undefined,
                body: Object.keys(req.body || {}).length > 0 ? req.body : undefined,
                ip: req.ip
            };
            console.log(formatLog('DEBUG', `→ ${req.method} ${req.originalUrl}`, logData));
        }
    },

    /**
     * Log HTTP response
     */
    response: (req, res, duration) => {
        const statusColor = res.statusCode >= 400 ? colors.red :
            res.statusCode >= 300 ? colors.yellow : colors.green;

        const message = `← ${statusColor}${res.statusCode}${colors.reset} ${req.method} ${req.originalUrl} ${colors.dim}(${duration}ms)${colors.reset}`;

        if (res.statusCode >= 400) {
            console.log(formatLog('ERROR', message));
        } else {
            console.log(formatLog('INFO', message));
        }
    }
};

/**
 * Request logging middleware
 */
const requestLogger = (req, res, next) => {
    // Generate unique request ID
    const requestId = uuidv4();
    req.requestId = requestId;
    res.locals.requestId = requestId;

    // Set request start time
    const startTime = Date.now();

    // Log incoming request
    logger.request(req);

    // Override res.json to log response body
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        res.locals.responseBody = body;
        return originalJson(body);
    };

    // Log response on finish
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        logger.response(req, res, duration);
    });

    next();
};

module.exports = {
    logger,
    requestLogger,
    LOG_LEVELS
};
