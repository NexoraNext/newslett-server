// Authentication Routes - Google OAuth & Local Auth
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { generateToken, authMiddleware } = require('../middleware/auth');

const SALT_ROUNDS = 10;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/**
 * POST /api/auth/google
 * Authenticate with Google ID token
 */
router.post('/google', async (req, res) => {
    try {
        const { credential } = req.body;

        if (!credential) {
            return res.status(400).json({ error: 'Google credential required' });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email, name, picture } = payload;

        let user = await User.findOne({
            $or: [{ googleId }, { email: email.toLowerCase() }]
        });

        if (user) {
            user.googleId = googleId;
            user.authProvider = 'google';
            user.avatar = picture || user.avatar;
            user.lastLoginAt = new Date();
            await user.save();
        } else {
            user = await User.create({
                googleId,
                email: email.toLowerCase(),
                name,
                displayName: name,
                avatar: picture,
                authProvider: 'google',
                lastLoginAt: new Date()
            });
        }

        const token = generateToken(user._id);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                isPremium: user.isPremium,
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error('Google auth error:', error);
        res.status(401).json({ error: 'Google authentication failed' });
    }
});

/**
 * POST /api/auth/register
 * Register with email/password
 */
router.post('/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email and password required' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        const user = await User.create({
            name,
            displayName: name,
            email: email.toLowerCase(),
            password: hashedPassword,
            authProvider: 'local',
            lastLoginAt: new Date()
        });

        const token = generateToken(user._id);

        res.status(201).json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                isPremium: user.isPremium,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
});

/**
 * POST /api/auth/login
 * Login with email/password
 */
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await User.findOne({ email: email.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (!user.password) {
            return res.status(401).json({ error: 'Please sign in with Google' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        user.lastLoginAt = new Date();
        await user.save();

        const token = generateToken(user._id);

        res.json({
            success: true,
            token,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                isPremium: user.isPremium,
                isVerified: user.isVerified,
                verificationStatus: user.verificationStatus,
                isAdmin: user.isAdmin
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});

/**
 * GET /api/auth/me
 * Get current user
 */
router.get('/me', authMiddleware, (req, res) => {
    res.json({
        user: {
            id: req.user._id,
            name: req.user.name || req.user.displayName,
            email: req.user.email,
            avatar: req.user.avatar || req.user.photoUrl,
            isPremium: req.user.isPremium,
            isVerified: req.user.isVerified,
            verificationStatus: req.user.verificationStatus,
            bio: req.user.bio,
            followersCount: req.user.followersCount,
            followingCount: req.user.followingCount,
            isAdmin: req.user.isAdmin,
            createdAt: req.user.createdAt
        }
    });
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { name, bio, avatar } = req.body;

        const updates = {};
        if (name) {
            updates.name = name;
            updates.displayName = name;
        }
        if (bio !== undefined) updates.bio = bio;
        if (avatar) updates.avatar = avatar;

        const user = await User.findByIdAndUpdate(
            req.user._id,
            updates,
            { new: true }
        );

        res.json({
            success: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                avatar: user.avatar,
                bio: user.bio,
                isVerified: user.isVerified
            }
        });
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Profile update failed' });
    }
});

module.exports = router;
