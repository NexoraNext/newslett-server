const Comment = require('../models/Comment');
const User = require('../models/User');
const News = require('../models/News');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');
const gemmaApiService = require('../services/gemmaApiService');

/**
 * Comment Controller
 * Handles flat comments on news articles
 */
const commentController = {
    /**
     * GET /api/comments/:articleId
     * Get comments for an article
     */
    getComments: asyncHandler(async (req, res) => {
        const { articleId } = req.params;
        const { page = 1, limit = 20 } = req.query;

        logger.debug('Fetching comments for article', { articleId, page, limit });

        // Verify article exists
        const article = await News.findById(articleId);
        if (!article) {
            return ApiResponse.notFound(res, 'Article not found');
        }

        const total = await Comment.countDocuments({ articleId, isDeleted: false });
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const comments = await Comment.find({ articleId, isDeleted: false })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return ApiResponse.paginated(res, 'Comments retrieved successfully', comments, {
            page: parseInt(page),
            limit: parseInt(limit),
            total
        });
    }),

    /**
     * POST /api/comments/:articleId
     * Add a comment to an article
     */
    addComment: asyncHandler(async (req, res) => {
        const { articleId } = req.params;
        const { content } = req.body;
        const deviceId = req.headers['x-device-id'];

        // Validate content
        if (!content || typeof content !== 'string') {
            return ApiResponse.badRequest(res, 'Comment content is required');
        }

        if (content.length > 280) {
            return ApiResponse.badRequest(res, 'Comment cannot exceed 280 characters');
        }

        if (content.trim().length < 2) {
            return ApiResponse.badRequest(res, 'Comment must be at least 2 characters');
        }

        if (!deviceId) {
            return ApiResponse.unauthorized(res, 'Device ID required');
        }

        logger.debug('Adding comment', { articleId, contentLength: content.length });

        // Verify article exists
        const article = await News.findById(articleId);
        if (!article) {
            return ApiResponse.notFound(res, 'Article not found');
        }

        // Get user (rate limiting)
        const user = await User.getOrCreate(deviceId);

        // Rate limit: max 5 comments per minute
        const lastComment = user.lastCommentAt;
        const cooldown = 12 * 1000; // 12 seconds between comments

        if (lastComment && (Date.now() - new Date(lastComment).getTime()) < cooldown) {
            return ApiResponse.rateLimited(res, 'Please wait before posting another comment');
        }

        // Create comment
        const comment = await Comment.create({
            articleId,
            userId: user._id,
            content: content.trim(),
            displayName: user.displayName || user.name || 'Anonymous'
        });

        // Update user stats
        user.commentsPosted += 1;
        user.lastCommentAt = new Date();
        await user.save();

        return ApiResponse.created(res, 'Comment posted successfully', {
            id: comment._id,
            content: comment.content,
            displayName: comment.displayName,
            createdAt: comment.createdAt,
            isRewritten: false
        });
    }),

    /**
     * POST /api/comments/:id/rewrite
     * AI-assisted polite rewrite of a comment
     * DISABLED BY USER REQUEST
     */
    rewritePolitely: asyncHandler(async (req, res) => {
        return ApiResponse.badRequest(res, 'This feature is currently disabled');
        /*
        const { id } = req.params;
        const deviceId = req.headers['x-device-id'];

        if (!deviceId) {
            return ApiResponse.unauthorized(res, 'Device ID required');
        }

        logger.debug('Rewriting comment politely', { commentId: id });

        const comment = await Comment.findById(id);

        if (!comment) {
            return ApiResponse.notFound(res, 'Comment not found');
        }

        // Only allow rewriting own comments (by checking if user is the author)
        const user = await User.findOne({ deviceId });
        if (!user || comment.userId.toString() !== user._id.toString()) {
            return ApiResponse.forbidden(res, 'You can only rewrite your own comments');
        }

        // Already rewritten?
        if (comment.isRewritten) {
            return ApiResponse.badRequest(res, 'Comment has already been rewritten');
        }

        // Store original and rewrite
        const originalContent = comment.content;
        const rewrittenContent = await gemmaApiService.rewritePolitely(originalContent);

        comment.originalContent = originalContent;
        comment.content = rewrittenContent;
        comment.isRewritten = true;
        await comment.save();

        return ApiResponse.success(res, 'Comment rewritten politely', {
            id: comment._id,
            originalContent,
            content: rewrittenContent,
            isRewritten: true
        });
        */
    }),

    /**
     * DELETE /api/comments/:id
     * Soft delete a comment (for moderation)
     */
    deleteComment: asyncHandler(async (req, res) => {
        const { id } = req.params;
        const deviceId = req.headers['x-device-id'];

        if (!deviceId) {
            return ApiResponse.unauthorized(res, 'Device ID required');
        }

        const comment = await Comment.findById(id);

        if (!comment) {
            return ApiResponse.notFound(res, 'Comment not found');
        }

        // Only allow deleting own comments
        const user = await User.findOne({ deviceId });
        if (!user || comment.userId.toString() !== user._id.toString()) {
            return ApiResponse.forbidden(res, 'You can only delete your own comments');
        }

        comment.isDeleted = true;
        await comment.save();

        // Decrement article comment count
        await News.findByIdAndUpdate(comment.articleId, {
            $inc: { commentsCount: -1 }
        });

        return ApiResponse.success(res, 'Comment deleted successfully');
    })
};

module.exports = commentController;
