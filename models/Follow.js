// Follow Model - for follower/following relationships
const mongoose = require('mongoose');

const followSchema = new mongoose.Schema({
    // Who is following
    follower: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Who is being followed
    following: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to prevent duplicate follows
followSchema.index({ follower: 1, following: 1 }, { unique: true });
// Indexes for faster lookups
followSchema.index({ follower: 1 });
followSchema.index({ following: 1 });

module.exports = mongoose.model('Follow', followSchema);
