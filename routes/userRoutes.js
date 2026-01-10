const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const { verifyToken, optionalAuth } = require('../middleware/auth');

/**
 * User Routes
 * All routes prefixed with /api/users
 */

// POST identify user (LEGACY - get or create by device ID)
router.post('/identify', userController.identify);

// POST sync user (NEW - Authenticated login/register)
router.post('/sync', verifyToken, userController.sync);

// GET current user's data
router.get('/me', optionalAuth, userController.getMe);

// GET user's saved articles
router.get('/saved', optionalAuth, userController.getSavedArticles);

// PUT update user preferences
router.put('/preferences', optionalAuth, userController.updatePreferences);

// POST vote on article (agree/disagree/unsure)
router.post('/vote/:articleId', optionalAuth, userController.vote);

// POST toggle like on article
router.post('/like/:articleId', optionalAuth, userController.toggleLike);

// POST toggle save on article
router.post('/save/:articleId', optionalAuth, userController.toggleSave);

module.exports = router;
