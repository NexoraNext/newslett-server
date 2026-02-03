const mongoose = require('mongoose');

/**
 * StorySource Model - Links individual articles to story clusters
 * Tracks which articles from which sources belong to each story
 */
const StorySourceSchema = new mongoose.Schema({
    // Reference to the parent story cluster
    storyId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Story',
        required: true,
        index: true
    },

    // Reference to the original article
    articleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'News',
        required: true,
        index: true
    },

    // Source information
    sourceName: {
        type: String,
        required: true,
        trim: true
    },
    originalHeadline: {
        type: String,
        trim: true
    },
    url: {
        type: String,
        required: true
    },

    // When this source published their version
    publishedAt: {
        type: Date,
        default: Date.now
    },

    // Source credibility (0-1 scale)
    credibilityScore: {
        type: Number,
        default: 0.5,
        min: 0,
        max: 1
    },

    // Whether this is the primary/canonical source for the story
    isPrimary: {
        type: Boolean,
        default: false
    },

    // Similarity score to the canonical story (for clustering verification)
    similarityScore: {
        type: Number,
        default: 1.0,
        min: 0,
        max: 1
    }
}, {
    timestamps: true
});

// Compound index for efficient lookups
StorySourceSchema.index({ storyId: 1, articleId: 1 }, { unique: true });
StorySourceSchema.index({ storyId: 1, isPrimary: 1 });
StorySourceSchema.index({ sourceName: 1 });

// Static method to get all sources for a story
StorySourceSchema.statics.getSourcesForStory = async function (storyId) {
    return this.find({ storyId })
        .sort({ isPrimary: -1, credibilityScore: -1, publishedAt: 1 })
        .lean();
};

// Static method to calculate source diversity for a story
StorySourceSchema.statics.calculateSourceDiversity = async function (storyId) {
    const sources = await this.find({ storyId }).distinct('sourceName');

    // Known source categories for diversity calculation
    const sourceCategories = {
        'Reuters': 'wire',
        'AP': 'wire',
        'AFP': 'wire',
        'BBC': 'public',
        'NPR': 'public',
        'PBS': 'public',
        'CNN': 'cable',
        'Fox News': 'cable',
        'MSNBC': 'cable',
        'New York Times': 'newspaper',
        'Washington Post': 'newspaper',
        'Wall Street Journal': 'newspaper',
        'The Guardian': 'newspaper',
        'TechCrunch': 'tech',
        'The Verge': 'tech',
        'Wired': 'tech'
    };

    const categoriesRepresented = new Set();
    sources.forEach(source => {
        const category = sourceCategories[source] || 'other';
        categoriesRepresented.add(category);
    });

    // Diversity score: number of unique categories / total possible categories
    const totalCategories = 6; // wire, public, cable, newspaper, tech, other
    return Math.min(categoriesRepresented.size / totalCategories, 1);
};

// Static method to calculate average credibility for a story
StorySourceSchema.statics.calculateAverageCredibility = async function (storyId) {
    const result = await this.aggregate([
        { $match: { storyId: new mongoose.Types.ObjectId(storyId) } },
        { $group: { _id: null, avgCredibility: { $avg: '$credibilityScore' } } }
    ]);

    return result.length > 0 ? result[0].avgCredibility : 0.5;
};

module.exports = mongoose.model('StorySource', StorySourceSchema);
