require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const compression = require('compression');
const morgan = require('morgan');
const cron = require('node-cron');

// Middleware
const { requestLogger, logger } = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

// Controllers
const newsController = require('./controllers/newsController');

// Validate required environment variables
if (!process.env.MONGODB_URI) {
  logger.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// ======================
// MIDDLEWARE SETUP
// ======================

// Enable CORS for Flutter app
app.use(cors({
  origin: '*', // Allow all origins in development
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Id', 'X-Request-Id']
}));

// Compression for responses
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Morgan HTTP logger (combined with custom logger)
app.use(morgan('dev', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));

// Custom request logger with timing
app.use(requestLogger);

// ======================
// ROUTES
// ======================

// Root route
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to the Newslett API Server',
    status: 'Operational',
    docs: 'https://github.com/NexoraNext/newslett-server'
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Server is healthy',
    data: {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    }
  });
});

// API Routes - News (original)
app.use('/api/news', require('./routes/newsRoutes'));
app.use('/api/stories', require('./routes/storiesRoutes')); // Clustered story feed
app.use('/api/users', require('./routes/userRoutes'));
app.use('/api/comments', require('./routes/commentRoutes'));

// API Routes - Added from backend/
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/blogs', require('./routes/blogRoutes'));
app.use('/api/analytics', require('./routes/analyticsRoutes'));
app.use('/api/payment', require('./routes/paymentRoutes'));
app.use('/api/verification', require('./routes/verificationRoutes'));
app.use('/api/tts', require('./routes/ttsRoutes'));


// ======================
// ERROR HANDLING
// ======================

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// ======================
// DATABASE CONNECTION
// ======================

mongoose.connect(process.env.MONGODB_URI).then(() => {
  logger.info('MongoDB connected successfully');
  logger.info(`Connected to DB: ${mongoose.connection.name} at ${mongoose.connection.host}:${mongoose.connection.port}`);
}).catch(err => {
  logger.error('MongoDB connection failed', err);
  process.exit(1);
});

// Handle MongoDB connection events
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected successfully');
});

// ======================
// SCHEDULED TASKS
// ======================

// Import services for scheduled tasks
const calmRankingService = require('./services/calmRankingService');

// Sync news every 15 minutes (less aggressive than every minute)
cron.schedule('*/15 * * * *', async () => {
  logger.info('Running scheduled news sync...');
  try {
    await newsController.syncNews({ manual: false }, {
      status: () => ({ json: (data) => logger.info('Sync result:', data) })
    });
  } catch (error) {
    logger.error('Scheduled sync failed', error);
  }
});

// Refresh calm ranking scores every hour
cron.schedule('0 * * * *', async () => {
  logger.info('Refreshing calm ranking scores...');
  try {
    const result = await calmRankingService.refreshAllScores();
    logger.info(`Refreshed ${result.updated} story scores`);
  } catch (error) {
    logger.error('Score refresh failed', error);
  }
});

// Daily brief selection at 5 AM
cron.schedule('0 5 * * *', async () => {
  logger.info('Selecting daily brief articles...');
  try {
    await newsController.selectDailyBrief();
  } catch (error) {
    logger.error('Daily brief selection failed', error);
  }

});

// ======================
// START SERVER
// ======================
if (require.main === module) {
  const server = app.listen(PORT)
    .on('listening', () => {
      logger.info(`Server running on port ${PORT}`);
      logger.info(`API URL: http://localhost:${PORT}/api`);
      logger.info(`Health Check: http://localhost:${PORT}/health`);
      logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
    })
    .on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${PORT} is already in use. The 'prestart' script should have cleared it, but if you still see this, try: 'lsof -t -i:${PORT} | xargs kill -9'`);
      } else {
        logger.error('Server startup error:', err);
      }
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGTERM', () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
      mongoose.connection.close(false, () => {
        logger.info('MongoDB connection closed');
        process.exit(0);
      });
    });
  });
}

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', { promise, reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

module.exports = app;
