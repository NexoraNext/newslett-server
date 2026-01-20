// Blog Analytics Model - for detailed view tracking
const mongoose = require('mongoose');

const analyticsSchema = new mongoose.Schema({
    blog: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Blog',
        required: true
    },
    author: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Daily aggregated data
    date: {
        type: Date,
        required: true
    },
    views: {
        type: Number,
        default: 0
    },
    uniqueViews: {
        type: Number,
        default: 0
    },
    likes: {
        type: Number,
        default: 0
    }
});

// Compound index for efficient queries
analyticsSchema.index({ blog: 1, date: 1 }, { unique: true });
analyticsSchema.index({ author: 1, date: 1 });

module.exports = mongoose.model('Analytics', analyticsSchema);
