const Story = require('../models/Story');
const StorySource = require('../models/StorySource');
const { logger } = require('../middleware/logger');

/**
 * Calm Ranking Service
 * Ranks stories based on understanding value, NOT engagement
 * 
 * Philosophy:
 * - Source diversity > virality
 * - Credibility > clicks  
 * - Importance > recency (capped recency)
 * - NO engagement metrics (likes, shares, time-on-page)
 */
const calmRankingService = {
    // Ranking weights
    WEIGHTS: {
        SOURCE_COUNT: 0.30,      // More sources = more important
        SOURCE_DIVERSITY: 0.25,  // Different types of sources
        CREDIBILITY: 0.25,       // Average source credibility
        RECENCY: 0.20            // Capped, not purely chronological
    },

    // Maximum age for recency boost (after this, recency = 0)
    MAX_RECENCY_HOURS: 24,

    /**
     * Calculate importance score for a story
     * This replaces engagement-based ranking
     */
    calculateImportanceScore(story) {
        const { SOURCE_COUNT, SOURCE_DIVERSITY, CREDIBILITY, RECENCY } = this.WEIGHTS;

        // Source count score (normalized, cap at 10)
        const sourceScore = Math.min(story.sourceCount / 10, 1);

        // Source diversity (already 0-1)
        const diversityScore = story.sourceDiversity || 0;

        // Credibility (already 0-1)
        const credibilityScore = story.averageCredibility || 0.5;

        // Recency score (decays linearly, capped at MAX_RECENCY_HOURS)
        const ageHours = (Date.now() - new Date(story.firstSeen)) / (1000 * 60 * 60);
        const recencyScore = Math.max(0, 1 - (ageHours / this.MAX_RECENCY_HOURS));

        // Calculate weighted score
        const score = (
            sourceScore * SOURCE_COUNT +
            diversityScore * SOURCE_DIVERSITY +
            credibilityScore * CREDIBILITY +
            recencyScore * RECENCY
        );

        return Math.round(score * 1000) / 1000; // 3 decimal places
    },

    /**
     * Rank an array of stories by calm importance
     */
    rankStories(stories) {
        return stories
            .map(story => ({
                ...story,
                importanceScore: this.calculateImportanceScore(story)
            }))
            .sort((a, b) => b.importanceScore - a.importanceScore);
    },

    /**
     * Get paginated stories with calm ranking
     */
    async getStoriesWithCalmRanking(options = {}) {
        const {
            page = 1,
            limit = 20,
            category,
            mood,
            maxAgeHours = 72
        } = options;

        // Build query
        const query = {};

        if (category && category !== 'all') {
            query.category = category;
        }

        if (mood && mood !== 'all') {
            query.mood = mood;
        }

        // Only show stories from last maxAgeHours
        const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
        query.firstSeen = { $gte: cutoff };

        // Get total count for pagination
        const total = await Story.countDocuments(query);

        // Get stories sorted by importance
        const stories = await Story.find(query)
            .sort({ importanceScore: -1, lastUpdated: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .lean();

        // Recalculate scores (in case they're stale)
        const rankedStories = this.rankStories(stories);

        return {
            stories: rankedStories,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasMore: page * limit < total
            }
        };
    },

    /**
     * Update importance scores for all stories
     * Run periodically to keep scores fresh
     */
    async refreshAllScores() {
        const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000);

        const stories = await Story.find({
            firstSeen: { $gte: cutoff }
        });

        let updated = 0;

        for (const story of stories) {
            const newScore = this.calculateImportanceScore(story);

            if (Math.abs(story.importanceScore - newScore) > 0.01) {
                story.importanceScore = newScore;
                await story.save();
                updated++;
            }
        }

        logger.info(`Refreshed importance scores for ${updated} stories`);

        return { updated, total: stories.length };
    },

    /**
     * Get stories that need verification (high importance but unverified)
     */
    async getStoriesNeedingVerification(limit = 10) {
        return Story.find({
            verificationLevel: 'UNVERIFIED',
            importanceScore: { $gte: 0.5 }
        })
            .sort({ importanceScore: -1 })
            .limit(limit)
            .lean();
    },

    /**
     * Get ranking explanation for a story (for transparency)
     */
    getRankingExplanation(story) {
        const { SOURCE_COUNT, SOURCE_DIVERSITY, CREDIBILITY, RECENCY } = this.WEIGHTS;

        const sourceScore = Math.min(story.sourceCount / 10, 1);
        const diversityScore = story.sourceDiversity || 0;
        const credibilityScore = story.averageCredibility || 0.5;
        const ageHours = (Date.now() - new Date(story.firstSeen)) / (1000 * 60 * 60);
        const recencyScore = Math.max(0, 1 - (ageHours / this.MAX_RECENCY_HOURS));

        return {
            totalScore: this.calculateImportanceScore(story),
            breakdown: {
                sourceCount: {
                    weight: SOURCE_COUNT,
                    rawValue: story.sourceCount,
                    normalizedScore: sourceScore,
                    contribution: sourceScore * SOURCE_COUNT
                },
                sourceDiversity: {
                    weight: SOURCE_DIVERSITY,
                    rawValue: diversityScore,
                    contribution: diversityScore * SOURCE_DIVERSITY
                },
                credibility: {
                    weight: CREDIBILITY,
                    rawValue: credibilityScore,
                    contribution: credibilityScore * CREDIBILITY
                },
                recency: {
                    weight: RECENCY,
                    ageHours: Math.round(ageHours * 10) / 10,
                    normalizedScore: recencyScore,
                    contribution: recencyScore * RECENCY
                }
            },
            explanation: this.generateHumanReadableExplanation(story)
        };
    },

    /**
     * Generate human-readable ranking explanation
     */
    generateHumanReadableExplanation(story) {
        const parts = [];

        if (story.sourceCount >= 5) {
            parts.push(`Widely covered (${story.sourceCount} sources)`);
        } else if (story.sourceCount >= 3) {
            parts.push(`Multiple sources (${story.sourceCount})`);
        }

        if (story.sourceDiversity >= 0.5) {
            parts.push('Diverse source types');
        }

        if (story.averageCredibility >= 0.8) {
            parts.push('High credibility sources');
        }

        const ageHours = (Date.now() - new Date(story.firstSeen)) / (1000 * 60 * 60);
        if (ageHours < 6) {
            parts.push('Breaking story');
        } else if (ageHours < 24) {
            parts.push('Recent story');
        }

        return parts.length > 0 ? parts.join(' • ') : 'Standard importance';
    }
};

module.exports = calmRankingService;
