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

// GET historical timeline of related articles
router.get('/:id/timeline', newsController.getTimeline);

// POST manual sync of news
router.post('/sync', (req, res) => {
  newsController.syncNews({ ...req, manual: true }, res);
});

// GET brain status (AI architecture status)
router.get('/brain/status', (req, res) => {
  try {
    const brainService = require('../services/brainService');
    const status = brainService.getStatus();
    res.json({
      success: true,
      brain: {
        enabled: status.enabled,
        services: {
          decisionMaker: {
            name: 'Mistral-7B (Decision)',
            enabled: status.services.decisionMaker.enabled,
            model: status.services.decisionMaker.model
          },
          multilingual: {
            name: 'Qwen 2.5 (Translation)',
            enabled: status.services.multilingual.enabled,
            languages: status.services.multilingual.supportedLanguages
          },
          heavyLifting: {
            name: 'BART/RoBERTa/MiniLM',
            enabled: status.services.huggingFace.enabled,
            tasks: ['Summarization', 'Mood', 'Embeddings']
          }
        }
      }
    });
  } catch (error) {
    res.json({
      success: false,
      brain: { enabled: false },
      error: error.message
    });
  }
});

module.exports = router;
