// Analytics Routes - Dashboard data for creators
const express = require('express');
const router = express.Router();
const Blog = require('../models/Blog');
const Analytics = require('../models/Analytics');
const { authMiddleware } = require('../middleware/auth');

/**
 * GET /api/analytics/overview
 * Get overview stats for dashboard
 */
router.get('/overview', authMiddleware, async (req, res) => {
    try {
        const userId = req.user._id;

        const blogs = await Blog.find({ author: userId });

        const totalBlogs = blogs.length;
        const publishedBlogs = blogs.filter(b => b.isPublished).length;
        const totalViews = blogs.reduce((sum, b) => sum + b.views, 0);
        const totalLikes = blogs.reduce((sum, b) => sum + b.likesCount, 0);

        res.json({
            totalBlogs,
            publishedBlogs,
            draftBlogs: totalBlogs - publishedBlogs,
            totalViews,
            totalLikes,
            followers: req.user.followersCount || 0,
            following: req.user.followingCount || 0
        });
    } catch (error) {
        console.error('Analytics overview error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

/**
 * GET /api/analytics/blogs
 * Get per-blog analytics
 */
router.get('/blogs', authMiddleware, async (req, res) => {
    try {
        const blogs = await Blog.find({ author: req.user._id })
            .select('title slug views likesCount isPublished publishedAt createdAt')
            .sort({ createdAt: -1 });

        res.json({ blogs });
    } catch (error) {
        console.error('Blog analytics error:', error);
        res.status(500).json({ error: 'Failed to get blog analytics' });
    }
});

/**
 * GET /api/analytics/timeline
 * Get views over time (last 30 days)
 */
router.get('/timeline', authMiddleware, async (req, res) => {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const analytics = await Analytics.aggregate([
            {
                $match: {
                    author: req.user._id,
                    date: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: '$date',
                    views: { $sum: '$views' },
                    likes: { $sum: '$likes' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const result = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 29; i >= 0; i--) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            const dateStr = date.toISOString().split('T')[0];

            const data = analytics.find(a =>
                a._id.toISOString().split('T')[0] === dateStr
            );

            result.push({
                date: dateStr,
                views: data?.views || 0,
                likes: data?.likes || 0
            });
        }

        res.json({ timeline: result });
    } catch (error) {
        console.error('Timeline error:', error);
        res.status(500).json({ error: 'Failed to get timeline' });
    }
});

/**
 * GET /api/analytics/blog/:id
 * Get analytics for a specific blog
 */
router.get('/blog/:id', authMiddleware, async (req, res) => {
    try {
        const blog = await Blog.findById(req.params.id);

        if (!blog) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        if (blog.author.toString() !== req.user._id.toString()) {
            return res.status(403).json({ error: 'Not authorized' });
        }

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const analytics = await Analytics.find({
            blog: req.params.id,
            date: { $gte: thirtyDaysAgo }
        }).sort({ date: 1 });

        res.json({
            blog: {
                title: blog.title,
                views: blog.views,
                likesCount: blog.likesCount
            },
            timeline: analytics
        });
    } catch (error) {
        console.error('Blog analytics error:', error);
        res.status(500).json({ error: 'Failed to get analytics' });
    }
});

module.exports = router;
