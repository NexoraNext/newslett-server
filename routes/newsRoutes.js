const express = require('express');
const router = express.Router();
const newsController = require('../controllers/newsController');

/**
 * News Routes
 * All routes prefixed with /api/news
 */

// GET all news articles with pagination
// Query params: page, limit, category, mood, sortBy, order
router.get('/', newsController.getAllNews);

// GET daily brief (top 5 articles)
router.get('/daily-brief', newsController.getDailyBrief);

// GET latest summaries (legacy endpoint)
router.get('/summaries/latest', newsController.getLatestSummaries);

// GET news by mood (calm/neutral/serious)
router.get('/mood/:mood', newsController.getNewsByMood);

// GET single article by ID
router.get('/:id', newsController.getNewsById);

// GET what changed since yesterday for article
router.get('/:id/deltas', newsController.getDeltas);

// POST ask one question about article (AI-powered)
router.post('/:id/question', newsController.askQuestion);

// POST manual sync of news
router.post('/sync', (req, res) => {
  newsController.syncNews({ ...req, manual: true }, res);
});

module.exports = router;
