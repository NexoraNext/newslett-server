const express = require('express');
const router = express.Router();
const Story = require('../models/Story');
const StorySource = require('../models/StorySource');
const Source = require('../models/Source');
const clusteringService = require('../services/clusteringService');
const calmRankingService = require('../services/calmRankingService');
const contextService = require('../services/contextService');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');

/**
 * Stories Routes
 * Provides deduplicated, clustered story feed with calm ranking
 */

// GET /api/stories/clustered - Get deduplicated story feed with calm ranking
router.get('/clustered', asyncHandler(async (req, res) => {
    const {
        page = 1,
        limit = 20,
        category,
        mood,
        maxAgeHours = 72
    } = req.query;

    const result = await calmRankingService.getStoriesWithCalmRanking({
        page: parseInt(page),
        limit: parseInt(limit),
        category,
        mood,
        maxAgeHours: parseInt(maxAgeHours)
    });

    // Add source summaries to each story
    const storiesWithSources = await Promise.all(
        result.stories.map(async (story) => {
            const sources = await StorySource.find({ storyId: story._id })
                .select('sourceName credibilityScore')
                .lean();

            return {
                ...story,
                id: story._id,
                sourceNames: sources.map(s => s.sourceName),
                // Ranking explanation for transparency
                rankingExplanation: calmRankingService.generateHumanReadableExplanation(story)
            };
        })
    );

    return ApiResponse.paginated(
        res,
        'Clustered stories retrieved successfully',
        storiesWithSources,
        result.pagination
    );
}));

// GET /api/stories/:id - Get single story with full details
router.get('/:id', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const story = await Story.findById(id).lean();

    if (!story) {
        return ApiResponse.notFound(res, 'Story not found');
    }

    const sources = await StorySource.getSourcesForStory(id);

    return ApiResponse.success(res, 'Story retrieved successfully', {
        ...story,
        id: story._id,
        sources: sources.map(s => ({
            name: s.sourceName,
            headline: s.originalHeadline,
            url: s.url,
            credibility: s.credibilityScore,
            publishedAt: s.publishedAt,
            isPrimary: s.isPrimary
        })),
        rankingExplanation: calmRankingService.getRankingExplanation(story)
    });
}));

// GET /api/stories/:id/sources - Get all sources for a story
router.get('/:id/sources', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const sources = await StorySource.getSourcesForStory(id);

    if (sources.length === 0) {
        return ApiResponse.notFound(res, 'No sources found for this story');
    }

    // Get full source info for each
    const enrichedSources = await Promise.all(
        sources.map(async (s) => {
            const sourceInfo = await Source.findOne({ name: s.sourceName }).lean();

            return {
                name: s.sourceName,
                headline: s.originalHeadline,
                url: s.url,
                publishedAt: s.publishedAt,
                isPrimary: s.isPrimary,
                credibility: {
                    score: s.credibilityScore,
                    biasIndicator: sourceInfo?.biasIndicator || 'unknown',
                    isVerified: sourceInfo?.isVerified || false,
                    sourceType: sourceInfo?.sourceType || 'other'
                }
            };
        })
    );

    return ApiResponse.success(res, 'Sources retrieved successfully', {
        storyId: id,
        sourceCount: sources.length,
        sources: enrichedSources
    });
}));

// GET /api/stories/:id/context - Get historical context and timeline
router.get('/:id/context', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { days = 30 } = req.query;

    const context = await contextService.getFullContext(id);

    if (!context) {
        return ApiResponse.notFound(res, 'Story not found');
    }

    return ApiResponse.success(res, 'Context retrieved successfully', context);
}));

// GET /api/stories/:id/explanation - Get "Why this matters" explanation
router.get('/:id/explanation', asyncHandler(async (req, res) => {
    const { id } = req.params;

    const explanation = await contextService.generateExplanation(id);

    if (!explanation) {
        return ApiResponse.notFound(res, 'Story not found');
    }

    return ApiResponse.success(res, 'Explanation generated successfully', explanation);
}));

// GET /api/stories/:id/timeline - Get "What happened before" timeline
router.get('/:id/timeline', asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { days = 30 } = req.query;

    const timeline = await contextService.buildTimeline(id, parseInt(days));

    if (!timeline) {
        return ApiResponse.notFound(res, 'Story not found');
    }

    return ApiResponse.success(res, 'Timeline retrieved successfully', timeline);
}));

// POST /api/stories/cluster - Trigger clustering of unclustered articles (admin)
router.post('/cluster', asyncHandler(async (req, res) => {
    logger.info('Manual clustering triggered');

    const result = await clusteringService.processUnclusteredArticles();

    return ApiResponse.success(res, 'Clustering completed', result);
}));

// POST /api/stories/refresh-scores - Refresh all importance scores (admin)
router.post('/refresh-scores', asyncHandler(async (req, res) => {
    logger.info('Refreshing importance scores');

    const result = await calmRankingService.refreshAllScores();

    return ApiResponse.success(res, 'Scores refreshed', result);
}));

// GET /api/stories/stats - Get clustering statistics
router.get('/stats', asyncHandler(async (req, res) => {
    const totalStories = await Story.countDocuments();
    const totalSources = await StorySource.countDocuments();
    const uniqueSources = await StorySource.distinct('sourceName');

    // Stories by source count
    const multiSourceStories = await Story.countDocuments({ sourceCount: { $gte: 2 } });

    // Stories by category
    const byCategory = await Story.aggregate([
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
    ]);

    // Average importance score
    const avgImportance = await Story.aggregate([
        { $group: { _id: null, avg: { $avg: '$importanceScore' } } }
    ]);

    return ApiResponse.success(res, 'Stats retrieved', {
        totalStories,
        totalArticleLinks: totalSources,
        uniqueSourceNames: uniqueSources.length,
        storiesWithMultipleSources: multiSourceStories,
        storiesBySingle: totalStories - multiSourceStories,
        byCategory: byCategory.reduce((acc, c) => ({ ...acc, [c._id]: c.count }), {}),
        averageImportanceScore: avgImportance[0]?.avg?.toFixed(3) || 0
    });
}));

module.exports = router;
