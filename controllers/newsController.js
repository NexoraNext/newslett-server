const News = require('../models/News');
const User = require('../models/User');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const newsFetchService = require('../services/newsFetchService');
const gemmaApiService = require('../services/gemmaApiService');

/**
 * News Controller
 * Handles all news-related API endpoints
 */
const newsController = {
  /**
   * GET /api/news
   * Get all news articles with pagination
   */
  getAllNews: asyncHandler(async (req, res) => {
    const {
      page = 1,
      limit = 20,
      category,
      mood,
      sortBy = 'publishedAt',
      order = 'desc'
    } = req.query;

    logger.debug('Fetching news articles', { page, limit, category, mood });

    // Build query
    const query = {};
    if (category && category !== 'general') {
      query.category = category;
    }
    if (mood) {
      query.mood = mood;
    }

    // Get device ID for user-specific data
    const deviceId = req.headers['x-device-id'];
    let userVotes = {};
    let userLikes = [];
    let userSaves = [];

    if (deviceId) {
      const user = await User.findOne({ deviceId });
      if (user) {
        userVotes = Object.fromEntries(user.votedArticles || new Map());
        userLikes = user.likedArticles.map(id => id.toString());
        userSaves = user.savedArticles.map(id => id.toString());
      }
    }

    // Get total count
    const total = await News.countDocuments(query);

    // Get articles
    const articles = await News.find(query)
      .sort({ [sortBy]: order === 'asc' ? 1 : -1 })
      .skip((page - 1) * parseInt(limit))
      .limit(parseInt(limit))
      .lean();

    // Add user-specific data to each article
    const articlesWithUserData = articles.map(article => ({
      ...article,
      id: article._id,
      userVote: userVotes[article._id.toString()] || null,
      userLiked: userLikes.includes(article._id.toString()),
      userSaved: userSaves.includes(article._id.toString())
    }));

    return ApiResponse.paginated(res, 'News articles retrieved successfully', articlesWithUserData, {
      page: parseInt(page),
      limit: parseInt(limit),
      total
    });
  }),

  /**
   * GET /api/news/:id
   * Get single news article by ID
   */
  getNewsById: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const deviceId = req.headers['x-device-id'];

    logger.debug('Fetching news article by ID', { id });

    const article = await News.findById(id).lean();

    if (!article) {
      return ApiResponse.notFound(res, 'News article not found');
    }

    // Get user-specific data
    let userVote = null;
    let userLiked = false;
    let userSaved = false;

    if (deviceId) {
      const user = await User.findOne({ deviceId });
      if (user) {
        userVote = user.votedArticles.get(id) || null;
        userLiked = user.likedArticles.includes(id);
        userSaved = user.savedArticles.includes(id);
      }
    }

    return ApiResponse.success(res, 'News article retrieved successfully', {
      ...article,
      id: article._id,
      userVote,
      userLiked,
      userSaved
    });
  }),

  /**
   * GET /api/news/mood/:mood
   * Get news filtered by mood (calm/neutral/serious)
   */
  getNewsByMood: asyncHandler(async (req, res) => {
    const { mood } = req.params;
    const { limit = 20 } = req.query;

    if (!['calm', 'neutral', 'serious'].includes(mood)) {
      return ApiResponse.badRequest(res, 'Invalid mood. Must be calm, neutral, or serious');
    }

    logger.debug('Fetching news by mood', { mood, limit });

    const articles = await News.getByMood(mood, parseInt(limit));

    return ApiResponse.success(res, `${mood} news retrieved successfully`, articles);
  }),

  /**
   * GET /api/news/daily-brief
   * Get top 5 news for daily brief mode
   */
  getDailyBrief: asyncHandler(async (req, res) => {
    const { limit = 5 } = req.query;

    logger.debug('Fetching daily brief');

    const articles = await News.getDailyBrief(parseInt(limit));

    // Calculate total read time
    const totalReadTimeSeconds = articles.reduce((sum, article) => {
      return sum + (article.readTimeSeconds || 30);
    }, 0);

    return ApiResponse.success(res, 'Daily brief retrieved successfully', {
      articles,
      totalArticles: articles.length,
      totalReadTimeSeconds,
      estimatedMinutes: Math.ceil(totalReadTimeSeconds / 60)
    });
  }),

  /**
   * POST /api/news/:id/question
   * Ask one question about an article (AI-powered, cached)
   */
  askQuestion: asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { question } = req.body;
    const deviceId = req.headers['x-device-id'];

    if (!question || question.length > 200) {
      return ApiResponse.badRequest(res, 'Question is required and must be under 200 characters');
    }

    logger.debug('AI question asked', { articleId: id, question });

    const article = await News.findById(id);

    if (!article) {
      return ApiResponse.notFound(res, 'News article not found');
    }

    // Check if answer is already cached for this exact question
    if (article.aiQuestion === question && article.aiAnswer) {
      logger.info('Returning cached AI answer');
      return ApiResponse.success(res, 'Answer retrieved from cache', {
        question: article.aiQuestion,
        answer: article.aiAnswer,
        cached: true
      });
    }

    // Generate new answer (rate limit per user)
    if (deviceId) {
      const user = await User.findOne({ deviceId });
      if (user) {
        const lastQuestion = user.lastQuestionAt;
        const cooldown = 60 * 1000; // 1 minute cooldown

        if (lastQuestion && (Date.now() - new Date(lastQuestion).getTime()) < cooldown) {
          return ApiResponse.rateLimited(res, 'Please wait before asking another question');
        }

        user.questionsAsked += 1;
        user.lastQuestionAt = new Date();
        await user.save();
      }
    }

    // Generate AI answer
    const answer = await gemmaApiService.answerQuestion(
      article.title,
      article.content || article.description,
      question
    );

    // Cache the answer
    article.aiQuestion = question;
    article.aiAnswer = answer;
    await article.save();

    return ApiResponse.success(res, 'Question answered successfully', {
      question,
      answer,
      cached: false
    });
  }),

  /**
   * GET /api/news/:id/deltas
   * Get what changed since yesterday for recurring topics
   */
  getDeltas: asyncHandler(async (req, res) => {
    const { id } = req.params;

    const article = await News.findById(id).lean();

    if (!article) {
      return ApiResponse.notFound(res, 'News article not found');
    }

    if (!article.deltas || article.deltas.length === 0) {
      return ApiResponse.success(res, 'No changes tracked for this topic', {
        hasDeltas: false,
        deltas: []
      });
    }

    // Get last 3 deltas
    const recentDeltas = article.deltas.slice(-3);

    return ApiResponse.success(res, 'Changes retrieved successfully', {
      hasDeltas: true,
      deltas: recentDeltas
    });
  }),

  /**
   * POST /api/news/sync
   * Manual sync of news from external sources
   */
  syncNews: asyncHandler(async (req, res) => {
    logger.info('Starting news sync...');

    const results = await newsFetchService.fetchFromAllSources();
    const savedCount = await newsFetchService.saveArticles(results);

    const message = `Successfully synced ${savedCount} news articles`;
    logger.info(message);

    if (req.manual !== false) {
      return ApiResponse.success(res, message, { savedCount });
    }
  }),

  /**
   * Select top articles for daily brief
   */
  selectDailyBrief: async () => {
    logger.info('Selecting daily brief articles...');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get top 5 articles from last 24 hours by engagement
    const topArticles = await News.find({
      publishedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
      .sort({ likesCount: -1, 'votes.total': -1 })
      .limit(5);

    // Mark as daily brief
    for (const article of topArticles) {
      article.isDailyBrief = true;
      article.dailyBriefDate = today;
      await article.save();
    }

    logger.info(`Selected ${topArticles.length} articles for daily brief`);
    return topArticles;
  },

  /**
   * GET /api/news/summaries/latest (Legacy endpoint)
   */
  getLatestSummaries: asyncHandler(async (req, res) => {
    const { category } = req.query;
    const query = category && category !== 'general' ? { category } : {};

    const news = await News.find(query)
      .sort({ publishedAt: -1 })
      .limit(10)
      .select('title description publishedAt imageUrl category source summary whyThisMatters')
      .lean();

    return ApiResponse.success(res, 'Latest summaries retrieved', news);
  })
};

module.exports = newsController;
