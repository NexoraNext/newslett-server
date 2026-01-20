// Verification Routes - Creator verification system
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { authMiddleware, requireAdmin } = require('../middleware/auth');

/**
 * POST /api/verification/request
 * Submit verification request
 */
router.post('/request', authMiddleware, async (req, res) => {
    try {
        const { certificateUrl, reason } = req.body;

        if (req.user.verificationStatus === 'pending') {
            return res.status(400).json({ error: 'Verification already pending' });
        }

        if (req.user.isVerified) {
            return res.status(400).json({ error: 'Already verified' });
        }

        await User.findByIdAndUpdate(req.user._id, {
            verificationStatus: 'pending',
            certificateUrl: certificateUrl || null,
            verificationNotes: reason || null,
            verificationSubmittedAt: new Date()
        });

        res.json({
            success: true,
            message: 'Verification request submitted',
            status: 'pending'
        });
    } catch (error) {
        console.error('Verification request error:', error);
        res.status(500).json({ error: 'Failed to submit request' });
    }
});

/**
 * GET /api/verification/status
 * Check verification status
 */
router.get('/status', authMiddleware, (req, res) => {
    res.json({
        isVerified: req.user.isVerified,
        status: req.user.verificationStatus,
        submittedAt: req.user.verificationSubmittedAt,
        reviewedAt: req.user.verificationReviewedAt,
        notes: req.user.verificationNotes
    });
});

/**
 * GET /api/verification/pending
 * Get all pending verification requests (admin only)
 */
router.get('/pending', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const users = await User.find({ verificationStatus: 'pending' })
            .select('name email avatar certificateUrl verificationNotes verificationSubmittedAt')
            .sort({ verificationSubmittedAt: 1 });

        res.json({ users });
    } catch (error) {
        console.error('Get pending error:', error);
        res.status(500).json({ error: 'Failed to get pending requests' });
    }
});

/**
 * POST /api/verification/approve/:userId
 * Approve verification (admin only)
 */
router.post('/approve/:userId', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const user = await User.findByIdAndUpdate(
            req.params.userId,
            {
                isVerified: true,
                verificationStatus: 'approved',
                verificationReviewedAt: new Date(),
                isCreator: true
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            message: `${user.name} has been verified`
        });
    } catch (error) {
        console.error('Approve error:', error);
        res.status(500).json({ error: 'Failed to approve' });
    }
});

/**
 * POST /api/verification/reject/:userId
 * Reject verification (admin only)
 */
router.post('/reject/:userId', authMiddleware, requireAdmin, async (req, res) => {
    try {
        const { reason } = req.body;

        const user = await User.findByIdAndUpdate(
            req.params.userId,
            {
                verificationStatus: 'rejected',
                verificationReviewedAt: new Date(),
                verificationNotes: reason || 'Request rejected'
            },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            message: `Verification rejected for ${user.name}`
        });
    } catch (error) {
        console.error('Reject error:', error);
        res.status(500).json({ error: 'Failed to reject' });
    }
});

module.exports = router;
