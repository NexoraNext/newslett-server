const User = require('../models/User');
const News = require('../models/News');
const ApiResponse = require('../utils/apiResponse');
const { asyncHandler } = require('../middleware/errorHandler');
const { logger } = require('../middleware/logger');

/**
 * User Controller
 * Handles authenticated user identification, voting, likes, and saves
 */
const userController = {
    /**
     * POST /api/users/sync
     * Sync user data on login/app start
     * Replaces old 'identify' endpoint
     */
    sync: asyncHandler(async (req, res) => {
        // req.user is verified by auth middleware
        const firebaseUser = req.user;

        logger.debug('User sync', { uid: firebaseUser.uid });

        const user = await User.getOrCreateByFirebase(firebaseUser);

        return ApiResponse.success(res, 'User synced successfully', {
            id: user._id,
            displayName: user.displayName,
            photoUrl: user.photoUrl,
            role: user.role,
            email: user.email,
            preferences: user.preferences,
            stats: {
                votesCount: user.votedArticles?.size || 0,
                likesCount: user.likedArticles?.length || 0,
                savesCount: user.savedArticles?.length || 0
            }
        });
    }),

    /**
     * POST /api/users/vote/:articleId
     * Cast vote on an article (Agree/Disagree/Unsure)
     */
    vote: asyncHandler(async (req, res) => {
        const { articleId } = req.params;
        const { vote } = req.body;
        // Migration: Check for authenticated user OR device ID fallback
        const firebaseUser = req.user;
        const deviceId = req.headers['x-device-id'];

        // Validate vote type
        if (!['agree', 'disagree', 'unsure'].includes(vote)) {
            return ApiResponse.badRequest(res, 'Vote must be agree, disagree, or unsure');
        }

        let user;
        if (firebaseUser) {
            user = await User.findOne({ firebaseUid: firebaseUser.uid });
        } else if (deviceId) {
            // Fallback for unmigrated clients
            user = await User.getOrCreate(deviceId);
        } else {
            return ApiResponse.unauthorized(res, 'Authentication required');
        }

        if (!user) return ApiResponse.notFound(res, 'User not found');

        logger.debug('User voting', { articleId, vote, userId: user._id });

        // Get article
        const article = await News.findById(articleId);
        if (!article) {
            return ApiResponse.notFound(res, 'Article not found');
        }

        // Check if user already voted
        const previousVote = user.votedArticles.get(articleId);

        if (previousVote) {
            // User is changing their vote
            article.votes[previousVote] = Math.max(0, article.votes[previousVote] - 1);
        }

        // Add new vote
        article.votes[vote] += 1;
        await article.save();

        // Update user's vote record
        user.votedArticles.set(articleId, vote);
        await user.save();

        // Calculate percentages
        const total = article.votes.total || 1;
        const percentages = {
            agree: Math.round((article.votes.agree / total) * 100),
            disagree: Math.round((article.votes.disagree / total) * 100),
            unsure: Math.round((article.votes.unsure / total) * 100)
        };

        return ApiResponse.success(res, previousVote ? 'Vote changed successfully' : 'Vote recorded successfully', {
            articleId,
            userVote: vote,
            previousVote: previousVote || null,
            percentages,
            totalVotes: article.votes.total
        });
    }),

    /**
     * POST /api/users/like/:articleId
     * Toggle like on an article
     */
    toggleLike: asyncHandler(async (req, res) => {
        const { articleId } = req.params;
        const firebaseUser = req.user;
        const deviceId = req.headers['x-device-id'];

        let user;
        if (firebaseUser) {
            user = await User.findOne({ firebaseUid: firebaseUser.uid });
        } else if (deviceId) {
            user = await User.getOrCreate(deviceId);
        } else {
            return ApiResponse.unauthorized(res, 'Authentication required');
        }

        if (!user) return ApiResponse.notFound(res, 'User not found');

        logger.debug('User toggling like', { articleId, userId: user._id });

        const article = await News.findById(articleId);
        if (!article) {
            return ApiResponse.notFound(res, 'Article not found');
        }

        const isLiked = user.likedArticles.includes(articleId);

        if (isLiked) {
            // Unlike
            user.likedArticles = user.likedArticles.filter(id => id.toString() !== articleId);
            article.likesCount = Math.max(0, article.likesCount - 1);
        } else {
            // Like
            user.likedArticles.push(articleId);
            article.likesCount += 1;
        }

        await Promise.all([user.save(), article.save()]);

        return ApiResponse.success(res, isLiked ? 'Article unliked' : 'Article liked', {
            articleId,
            liked: !isLiked,
            likesCount: article.likesCount
        });
    }),

    /**
     * POST /api/users/save/:articleId
     * Toggle save/bookmark on an article
     */
    toggleSave: asyncHandler(async (req, res) => {
        const { articleId } = req.params;
        const firebaseUser = req.user;
        const deviceId = req.headers['x-device-id'];

        let user;
        if (firebaseUser) {
            user = await User.findOne({ firebaseUid: firebaseUser.uid });
        } else if (deviceId) {
            user = await User.getOrCreate(deviceId);
        } else {
            return ApiResponse.unauthorized(res, 'Authentication required');
        }

        if (!user) return ApiResponse.notFound(res, 'User not found');

        logger.debug('User toggling save', { articleId, userId: user._id });

        const article = await News.findById(articleId);
        if (!article) {
            return ApiResponse.notFound(res, 'Article not found');
        }

        const isSaved = user.savedArticles.includes(articleId);

        if (isSaved) {
            // Unsave
            user.savedArticles = user.savedArticles.filter(id => id.toString() !== articleId);
            article.savesCount = Math.max(0, article.savesCount - 1);
        } else {
            // Save
            user.savedArticles.push(articleId);
            article.savesCount += 1;
        }

        await Promise.all([user.save(), article.save()]);

        return ApiResponse.success(res, isSaved ? 'Article unsaved' : 'Article saved', {
            articleId,
            saved: !isSaved,
            savesCount: article.savesCount
        });
    }),

    /**
     * GET /api/users/me
     * Get current user's stats and preferences
     * Auto-creates guest user by device ID if not found
     */
    getMe: asyncHandler(async (req, res) => {
        const firebaseUser = req.user;
        const deviceId = req.headers['x-device-id'];

        let user;
        if (firebaseUser) {
            user = await User.findOne({ firebaseUid: firebaseUser.uid })
                .populate('likedArticles', 'title imageUrl')
                .populate('savedArticles', 'title imageUrl');
        } else if (deviceId) {
            // Auto-create guest user by device ID if not found
            user = await User.findOne({ deviceId })
                .populate('likedArticles', 'title imageUrl')
                .populate('savedArticles', 'title imageUrl');

            if (!user) {
                // Create a new guest user
                user = await User.getOrCreate(deviceId);
                logger.debug('Created new guest user', { deviceId, userId: user._id });
            }
        } else {
            return ApiResponse.unauthorized(res, 'Authentication required');
        }

        if (!user) {
            return ApiResponse.notFound(res, 'User not found');
        }

        return ApiResponse.success(res, 'User data retrieved', {
            id: user._id,
            displayName: user.displayName || (user.email?.split('@')[0]) || 'Guest',
            email: user.email,
            photoUrl: user.photoUrl,
            role: user.role,
            isGuest: !user.email && !user.firebaseUid,
            preferences: user.preferences,
            stats: {
                votesCount: user.votedArticles?.size || 0,
                likesCount: user.likedArticles?.length || 0,
                savesCount: user.savedArticles?.length || 0,
                commentsCount: user.commentsPosted
            },
            likedArticles: user.likedArticles || [],
            savedArticles: user.savedArticles || [],
            createdAt: user.createdAt,
            lastActiveAt: user.lastActiveAt
        });
    }),

    /**
     * PUT /api/users/preferences
     * Update user preferences
     */
    updatePreferences: asyncHandler(async (req, res) => {
        const firebaseUser = req.user;
        const deviceId = req.headers['x-device-id'];
        const { mood, anchorSpeed, categories } = req.body;

        let user;
        if (firebaseUser) {
            user = await User.findOne({ firebaseUid: firebaseUser.uid });
        } else if (deviceId) {
            user = await User.findOne({ deviceId });
        } else {
            return ApiResponse.unauthorized(res, 'Authentication required');
        }

        if (!user) {
            return ApiResponse.notFound(res, 'User not found');
        }

        // Update preferences
        if (mood && ['calm', 'neutral', 'serious'].includes(mood)) {
            user.preferences.mood = mood;
        }
        if (anchorSpeed && [1, 1.25, 1.5].includes(anchorSpeed)) {
            user.preferences.anchorSpeed = anchorSpeed;
        }
        if (categories && Array.isArray(categories)) {
            user.preferences.categories = categories;
        }

        await user.save();

        return ApiResponse.success(res, 'Preferences updated', {
            preferences: user.preferences
        });
    }),

    /**
     * GET /api/users/saved
     * Get user's saved articles
     */
    getSavedArticles: asyncHandler(async (req, res) => {
        const firebaseUser = req.user;
        const deviceId = req.headers['x-device-id'];
        const { page = 1, limit = 20 } = req.query;

        let user;
        if (firebaseUser) {
            user = await User.findOne({ firebaseUid: firebaseUser.uid });
        } else if (deviceId) {
            user = await User.findOne({ deviceId });
            if (!user) {
                // Create guest user if not found
                user = await User.getOrCreate(deviceId);
            }
        } else {
            return ApiResponse.unauthorized(res, 'Authentication required');
        }

        if (!user) {
            return ApiResponse.notFound(res, 'User not found');
        }

        const total = user.savedArticles.length;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const articles = await News.find({
            _id: { $in: user.savedArticles }
        })
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        return ApiResponse.paginated(res, 'Saved articles retrieved', articles, {
            page: parseInt(page),
            limit: parseInt(limit),
            total
        });
    }),

    /**
     * POST /api/users/identify (LEGACY)
     * Kept for backward compatibility, routes to sync logic or device-id logic
     */
    identify: asyncHandler(async (req, res) => {
        const { deviceId } = req.body;
        if (!deviceId) return ApiResponse.badRequest(res, 'Device ID required');

        logger.debug('Legacy identification', { deviceId });
        const user = await User.getOrCreate(deviceId);

        return ApiResponse.success(res, 'User identified successfully', {
            id: user._id,
            preferences: user.preferences,
            stats: {
                votesCount: user.votedArticles?.size || 0,
                likesCount: user.likedArticles?.length || 0,
                savesCount: user.savedArticles?.length || 0
            }
        });
    })
};

module.exports = userController;
