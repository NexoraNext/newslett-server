// Blog Model - From backend/
const mongoose = require('mongoose');

const blogSchema = new mongoose.Schema({
    // Author reference
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Content
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true
    },
    summary: {
        type: String,
        maxlength: 500
    },
    content: {
        type: String,
        required: true
    },
    coverImage: {
        type: String,
        default: null
    },

    // Categorization
    category: {
        type: String,
        enum: ['technology', 'politics', 'sports', 'entertainment', 'business', 'health', 'science', 'lifestyle', 'opinion', 'other'],
        default: 'other'
    },
    tags: [{
        type: String,
        trim: true
    }],

    // Status
    isPublished: {
        type: Boolean,
        default: false
    },
    publishedAt: {
        type: Date,
        default: null
    },

    // Analytics
    views: {
        type: Number,
        default: 0
    },
    uniqueViews: {
        type: Number,
        default: 0
    },

    // Likes - array of user IDs who liked this blog
    likes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    likesCount: {
        type: Number,
        default: 0
    },

    // Dislikes - array of user IDs who disliked this blog
    dislikes: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    dislikesCount: {
        type: Number,
        default: 0
    },

    // Author display info (denormalized for performance)
    authorName: {
        type: String
    },
    authorAvatar: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Generate slug before saving
blogSchema.pre('save', function (next) {
    if (this.isModified('title') || !this.slug) {
        this.slug = this.title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/(^-|-$)/g, '') +
            '-' + Date.now().toString(36);
    }
    next();
});

// Indexes
blogSchema.index({ author: 1, isPublished: 1 });
blogSchema.index({ slug: 1 });
blogSchema.index({ category: 1, isPublished: 1 });
blogSchema.index({ publishedAt: -1 });

module.exports = mongoose.model('Blog', blogSchema);
