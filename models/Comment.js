const mongoose = require('mongoose');

/**
 * Comment Schema
 * Flat comments (no nesting) on news articles
 * Character-limited with optional AI rewrite
 */
const CommentSchema = new mongoose.Schema({
    // Reference to article
    articleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'News',
        required: [true, 'Article ID is required'],
        index: true
    },

    // Reference to user
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },

    // Comment content (max 280 characters like Twitter)
    content: {
        type: String,
        required: [true, 'Comment content is required'],
        trim: true,
        maxlength: [280, 'Comment cannot exceed 280 characters']
    },

    // Original content before AI rewrite (for transparency)
    originalContent: {
        type: String,
        trim: true,
        maxlength: [280, 'Original content cannot exceed 280 characters']
    },

    // Was this comment rewritten by AI?
    isRewritten: {
        type: Boolean,
        default: false
    },

    // Soft delete (for moderation)
    isDeleted: {
        type: Boolean,
        default: false
    },

    // User display name (anonymous identifier)
    displayName: {
        type: String,
        default: 'Anonymous'
    }
}, {
    timestamps: true
});

// Indexes
CommentSchema.index({ articleId: 1, createdAt: -1 });
CommentSchema.index({ userId: 1 });

// Pre-save: Generate anonymous display name if not set
CommentSchema.pre('save', function (next) {
    if (this.isNew && !this.displayName) {
        // Generate a friendly anonymous name
        const adjectives = ['Happy', 'Wise', 'Calm', 'Bright', 'Kind', 'Swift', 'Bold', 'Quiet'];
        const nouns = ['Reader', 'Thinker', 'Observer', 'Citizen', 'Voice', 'Mind', 'Soul', 'Spirit'];
        const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
        const noun = nouns[Math.floor(Math.random() * nouns.length)];
        this.displayName = `${adj}${noun}`;
    }
    next();
});

// Post-save: Update article comment count
CommentSchema.post('save', async function () {
    if (this.isNew) {
        const News = mongoose.model('News');
        await News.findByIdAndUpdate(this.articleId, {
            $inc: { commentsCount: 1 }
        });
    }
});

// Static method to get comments for article (non-deleted only)
CommentSchema.statics.getForArticle = async function (articleId, limit = 50, skip = 0) {
    return this.find({
        articleId,
        isDeleted: false
    })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'deviceId');
};

// Transform output
CommentSchema.set('toJSON', {
    transform: function (doc, ret) {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        delete ret.userId; // Don't expose user IDs
        return ret;
    }
});

module.exports = mongoose.model('Comment', CommentSchema);
