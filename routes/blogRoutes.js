// Blog Routes - CRUD for verified creators
const express = require('express');
const router = express.Router();
const Blog = require('../models/Blog');
const Analytics = require('../models/Analytics');
const Follow = require('../models/Follow');
const { authMiddleware, optionalAuth, requireVerified } = require('../middleware/auth');

/**
 * GET /api/blogs
 * Get all published blogs (with pagination)
 */
router.get('/', optionalAuth, async (req, res) => {
    try {
        const { page = 1, limit = 20, category, author } = req.query;

        const query = { isPublished: true };
        if (category) query.category = category;
        if (author) query.author = author;

        const blogs = await Blog.find(query)
            .populate('author', 'name displayName avatar photoUrl isVerified')
            .sort({ publishedAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Blog.countDocuments(query);

        res.json({
            blogs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Get blogs error:', error);
        res.status(500).json({ error: 'Failed to get blogs' });
    }
});

/**
 * GET /api/blogs/my
 * Get current user's blogs
 */
router.get('/my', authMiddleware, async (req, res) => {
    try {
        const blogs = await Blog.find({ author: req.user._id })
            .sort({ createdAt: -1 });

        res.json({ blogs });
    } catch (error) {
        console.error('Get my blogs error:', error);
        res.status(500).json({ error: 'Failed to get blogs' });
    }
});

/**
 * GET /api/blogs/:slug
 * Get single blog by slug
 */
router.get('/:slug', optionalAuth, async (req, res) => {
    try {
        const blog = await Blog.findOne({ slug: req.params.slug })
            .populate('author', 'name displayName avatar photoUrl bio isVerified followersCount');

        if (!blog) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        if (!blog.isPublished && (!req.user || req.user._id.toString() !== blog.author._id.toString())) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        // Increment view count
        blog.views += 1;
        await blog.save();

        // Track analytics
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        await Analytics.findOneAndUpdate(
            { blog: blog._id, date: today },
            {
                $inc: { views: 1 },
                $setOnInsert: { author: blog.author._id }
            },
            { upsert: true }
        );

        const blogObj = blog.toObject();
        blogObj.userLiked = false;
        blogObj.userDisliked = false;
        blogObj.isFollowing = false;

        if (req.user) {
            blogObj.userLiked = blog.likes.some(id => id.toString() === req.user._id.toString());
            blogObj.userDisliked = blog.dislikes.some(id => id.toString() === req.user._id.toString());

            const follow = await Follow.findOne({
                follower: req.user._id,
                following: blog.author._id
            });
            blogObj.isFollowing = !!follow;
        }

        res.json({ blog: blogObj });
    } catch (error) {
        console.error('Get blog error:', error);
        res.status(500).json({ error: 'Failed to get blog' });
    }
});

/**
 * POST /api/blogs
 * Create new blog (verified users only)
 */
router.post('/', authMiddleware, requireVerified, async (req, res) => {
    try {
        const { title, summary, content, coverImage, category, tags, isPublished } = req.body;

        if (!title || !content) {
            return res.status(400).json({ error: 'Title and content required' });
        }

        const blog = await Blog.create({
            author: req.user._id,
            title,
            summary,
            content,
            coverImage,
            category: category || 'other',
            tags: tags || [],
            isPublished: isPublished || false,
            publishedAt: isPublished ? new Date() : null,
            authorName: req.user.name || req.user.displayName,
            authorAvatar: req.user.avatar || req.user.photoUrl
        });

        res.status(201).json({ success: true, blog });
    } catch (error) {
        console.error('Create blog error:', error);
        res.status(500).json({ error: 'Failed to create blog' });
    }
});

/**
 * PUT /api/blogs/:id
 * Update blog
 */
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const { title, summary, content, coverImage, category, tags, isPublished } = req.body;

        if (isPublished && !blog.publishedAt) {
            blog.publishedAt = new Date();
        }

        if (title) blog.title = title;
        if (summary !== undefined) blog.summary = summary;
        if (content) blog.content = content;
        if (coverImage !== undefined) blog.coverImage = coverImage;
        if (category) blog.category = category;
        if (tags) blog.tags = tags;
        if (isPublished !== undefined) blog.isPublished = isPublished;

        await blog.save();

        res.json({ success: true, blog });
    } catch (error) {
        console.error('Update blog error:', error);
        res.status(500).json({ error: 'Failed to update blog' });
    }
});

/**
 * DELETE /api/blogs/:id
 * Delete blog
 */
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        await Blog.findByIdAndDelete(req.params.id);
        await Analytics.deleteMany({ blog: req.params.id });

        res.json({ success: true });
    } catch (error) {
        console.error('Delete blog error:', error);
        res.status(500).json({ error: 'Failed to delete blog' });
    }
});

/**
 * POST /api/blogs/:id/like
 * Like a blog
 */
router.post('/:id/like', authMiddleware, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        const userId = req.user._id;
        const hasLiked = blog.likes.includes(userId);
        const hasDisliked = blog.dislikes.includes(userId);

        if (hasLiked) {
            blog.likes.pull(userId);
            blog.likesCount = Math.max(0, blog.likesCount - 1);
        } else {
            blog.likes.push(userId);
            blog.likesCount += 1;

            if (hasDisliked) {
                blog.dislikes.pull(userId);
                blog.dislikesCount = Math.max(0, blog.dislikesCount - 1);
            }
        }

        await blog.save();

        res.json({
            success: true,
            liked: !hasLiked,
            disliked: false,
            likesCount: blog.likesCount,
            dislikesCount: blog.dislikesCount
        });
    } catch (error) {
        console.error('Like blog error:', error);
        res.status(500).json({ error: 'Failed to like blog' });
    }
});

/**
 * POST /api/blogs/:id/dislike
 * Dislike a blog
 */
router.post('/:id/dislike', authMiddleware, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);
        if (!blog) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        const userId = req.user._id;
        const hasLiked = blog.likes.includes(userId);
        const hasDisliked = blog.dislikes.includes(userId);

        if (hasDisliked) {
            blog.dislikes.pull(userId);
            blog.dislikesCount = Math.max(0, blog.dislikesCount - 1);
        } else {
            blog.dislikes.push(userId);
            blog.dislikesCount += 1;

            if (hasLiked) {
                blog.likes.pull(userId);
                blog.likesCount = Math.max(0, blog.likesCount - 1);
            }
        }

        await blog.save();

        res.json({
            success: true,
            liked: false,
            disliked: !hasDisliked,
            likesCount: blog.likesCount,
            dislikesCount: blog.dislikesCount
        });
    } catch (error) {
        console.error('Dislike blog error:', error);
        res.status(500).json({ error: 'Failed to dislike blog' });
    }
});

/**
 * GET /api/blogs/categories/stats
 * Get blog count per category
 */
router.get('/categories/stats', async (req, res) => {
    try {
        const stats = await Blog.aggregate([
            { $match: { isPublished: true } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        const categoryStats = {};
        stats.forEach(s => {
            categoryStats[s._id] = s.count;
        });

        res.json({ categories: categoryStats });
    } catch (error) {
        console.error('Get category stats error:', error);
        res.status(500).json({ error: 'Failed to get category stats' });
    }
});

module.exports = router;
