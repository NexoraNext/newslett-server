const express = require('express');
const router = express.Router();
const commentController = require('../controllers/commentController');

/**
 * Comment Routes
 * All routes prefixed with /api/comments
 */

// GET comments for article
router.get('/:articleId', commentController.getComments);

// POST add comment to article
router.post('/:articleId', commentController.addComment);

// POST rewrite comment politely (AI-assisted)
router.post('/:id/rewrite', commentController.rewritePolitely);

// DELETE soft delete comment
router.delete('/:id', commentController.deleteComment);

module.exports = router;
