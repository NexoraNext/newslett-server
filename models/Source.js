const mongoose = require('mongoose');

/**
 * Source Model - News source credibility tracking
 * Maintains credibility scores and metadata for each news source
 */
const SourceSchema = new mongoose.Schema({
    // Source identification
    name: {
        type: String,
        required: true,
        unique: true,
        trim: true
    },
    domain: {
        type: String,
        trim: true
    },

    // Credibility scoring (0-1 scale)
    credibilityScore: {
        type: Number,
        default: 0.5,
        min: 0,
        max: 1
    },

    // Bias indicator (for transparency, not filtering)
    biasIndicator: {
        type: String,
        enum: ['left', 'center-left', 'center', 'center-right', 'right', 'unknown'],
        default: 'unknown'
    },

    // Verification status
    isVerified: {
        type: Boolean,
        default: false
    },

    // Content type this source typically produces
    primaryContentType: {
        type: String,
        enum: ['NEWS', 'ANALYSIS', 'OPINION', 'MIXED'],
        default: 'MIXED'
    },

    // Category this source specializes in
    primaryCategory: {
        type: String,
        enum: ['general', 'business', 'entertainment', 'health', 'science', 'sports', 'technology', 'mixed'],
        default: 'mixed'
    },

    // Source type for diversity calculation
    sourceType: {
        type: String,
        enum: ['wire', 'public', 'cable', 'newspaper', 'digital', 'tech', 'other'],
        default: 'other'
    },

    // Coverage statistics
    totalArticles: {
        type: Number,
        default: 0
    },
    lastSeenAt: {
        type: Date,
        default: Date.now
    },

    // Logo/branding for UI
    logoUrl: {
        type: String,
        default: ''
    }
}, {
    timestamps: true
});

// Indexes
// SourceSchema.index({ name: 1 }, { unique: true }); // Removed duplicate index
SourceSchema.index({ credibilityScore: -1 });
SourceSchema.index({ sourceType: 1 });

// Pre-defined credibility scores for known sources
const KNOWN_SOURCE_SCORES = {
    // Wire services (highest credibility)
    'Reuters': { score: 0.95, type: 'wire', bias: 'center' },
    'Associated Press': { score: 0.95, type: 'wire', bias: 'center' },
    'AFP': { score: 0.90, type: 'wire', bias: 'center' },

    // Public broadcasters
    'BBC': { score: 0.90, type: 'public', bias: 'center' },
    'NPR': { score: 0.85, type: 'public', bias: 'center-left' },
    'PBS': { score: 0.85, type: 'public', bias: 'center' },

    // Major newspapers
    'New York Times': { score: 0.85, type: 'newspaper', bias: 'center-left' },
    'Washington Post': { score: 0.85, type: 'newspaper', bias: 'center-left' },
    'Wall Street Journal': { score: 0.85, type: 'newspaper', bias: 'center-right' },
    'The Guardian': { score: 0.80, type: 'newspaper', bias: 'center-left' },
    'Los Angeles Times': { score: 0.80, type: 'newspaper', bias: 'center-left' },

    // Cable news
    'CNN': { score: 0.70, type: 'cable', bias: 'center-left' },
    'Fox News': { score: 0.65, type: 'cable', bias: 'right' },
    'MSNBC': { score: 0.65, type: 'cable', bias: 'left' },

    // Tech publications
    'TechCrunch': { score: 0.75, type: 'tech', bias: 'center' },
    'The Verge': { score: 0.75, type: 'tech', bias: 'center' },
    'Wired': { score: 0.80, type: 'tech', bias: 'center' },
    'Ars Technica': { score: 0.80, type: 'tech', bias: 'center' },

    // Digital native
    'Axios': { score: 0.80, type: 'digital', bias: 'center' },
    'Politico': { score: 0.75, type: 'digital', bias: 'center' },
    'The Hill': { score: 0.70, type: 'digital', bias: 'center' }
};

// Static method to get or create a source with known defaults
SourceSchema.statics.getOrCreate = async function (sourceName) {
    let source = await this.findOne({ name: sourceName });

    if (!source) {
        const knownData = KNOWN_SOURCE_SCORES[sourceName];

        source = await this.create({
            name: sourceName,
            credibilityScore: knownData?.score || 0.5,
            sourceType: knownData?.type || 'other',
            biasIndicator: knownData?.bias || 'unknown',
            isVerified: !!knownData
        });
    }

    // Update last seen
    source.lastSeenAt = new Date();
    source.totalArticles += 1;
    await source.save();

    return source;
};

// Static method to get credibility for a source name
SourceSchema.statics.getCredibility = async function (sourceName) {
    // Check known sources first (fast path)
    const known = KNOWN_SOURCE_SCORES[sourceName];
    if (known) return known.score;

    // Check database
    const source = await this.findOne({ name: sourceName });
    return source?.credibilityScore || 0.5;
};

module.exports = mongoose.model('Source', SourceSchema);
