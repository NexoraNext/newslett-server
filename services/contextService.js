const Story = require('../models/Story');
const StorySource = require('../models/StorySource');
const { logger } = require('../middleware/logger');
const gemmaApiService = require('./gemmaApiService');

/**
 * Context Service
 * Builds "What happened before" timelines and generates context explanations
 */
const contextService = {
    /**
     * Build a timeline of related events for a story
     * Looking back up to 30 days for related stories
     */
    async buildTimeline(storyId, days = 30) {
        try {
            const story = await Story.findById(storyId);
            if (!story) return null;

            const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            // Find related stories in the same category
            const relatedStories = await Story.find({
                _id: { $ne: storyId },
                category: story.category,
                firstSeen: { $gte: cutoff, $lt: story.firstSeen }
            })
                .sort({ firstSeen: -1 })
                .limit(10)
                .lean();

            // Calculate relevance to current story
            const timelineEntries = [];

            for (const related of relatedStories) {
                const relevance = this.calculateRelevance(story, related);

                if (relevance > 0.3) {
                    timelineEntries.push({
                        date: related.firstSeen,
                        title: related.canonicalTitle,
                        summary: related.summary || `Related ${story.category} story`,
                        storyId: related._id,
                        relevanceScore: relevance,
                        relationship: this.determineRelationship(story, related)
                    });
                }
            }

            // Sort by date descending (most recent first)
            timelineEntries.sort((a, b) => new Date(b.date) - new Date(a.date));

            return {
                currentStory: {
                    id: story._id,
                    title: story.canonicalTitle,
                    date: story.firstSeen
                },
                timeline: timelineEntries.slice(0, 5), // Max 5 entries
                totalRelated: timelineEntries.length
            };
        } catch (error) {
            logger.error('Error building timeline:', error);
            return null;
        }
    },

    /**
     * Calculate relevance between two stories
     * Uses title and category similarity
     */
    calculateRelevance(story1, story2) {
        // Same category is a prerequisite
        if (story1.category !== story2.category) return 0;

        // Extract significant words from titles
        const words1 = this.extractSignificantWords(story1.canonicalTitle);
        const words2 = this.extractSignificantWords(story2.canonicalTitle);

        // Calculate word overlap
        const intersection = words1.filter(w => words2.includes(w));
        const union = new Set([...words1, ...words2]);

        if (union.size === 0) return 0;

        return intersection.length / union.size;
    },

    /**
     * Extract significant words (no stopwords, >3 chars)
     */
    extractSignificantWords(text) {
        if (!text) return [];

        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
            'have', 'has', 'had', 'will', 'would', 'could', 'should', 'said', 'says'
        ]);

        return text
            .toLowerCase()
            .replace(/[^\w\s]/g, '')
            .split(/\s+/)
            .filter(w => w.length > 3 && !stopwords.has(w));
    },

    /**
     * Determine the relationship between stories
     */
    determineRelationship(current, related) {
        const currentDate = new Date(current.firstSeen);
        const relatedDate = new Date(related.firstSeen);

        if (relatedDate < currentDate) {
            return 'PRECEDES';
        } else if (relatedDate > currentDate) {
            return 'FOLLOWS';
        } else {
            return 'RELATED';
        }
    },

    /**
     * Generate "Why this matters" explanation for a story
     * Uses AI if available, falls back to template-based
     */
    async generateExplanation(storyId) {
        try {
            const story = await Story.findById(storyId);
            if (!story) return null;

            // If already has explanation, return it
            if (story.whyThisMatters && story.whyThisMatters.length > 10) {
                return {
                    explanation: story.whyThisMatters,
                    source: 'cached'
                };
            }

            // Try AI generation
            try {
                const aiExplanation = await gemmaApiService.generateWhyThisMatters(
                    story.canonicalTitle,
                    story.summary
                );

                if (aiExplanation) {
                    // Cache it
                    story.whyThisMatters = aiExplanation;
                    await story.save();

                    return {
                        explanation: aiExplanation,
                        source: 'ai'
                    };
                }
            } catch (aiError) {
                logger.warn('AI explanation failed, using template:', aiError.message);
            }

            // Fallback to template-based explanation
            const explanation = this.generateTemplateExplanation(story);

            return {
                explanation,
                source: 'template'
            };
        } catch (error) {
            logger.error('Error generating explanation:', error);
            return null;
        }
    },

    /**
     * Generate template-based explanation
     */
    generateTemplateExplanation(story) {
        const categoryImpact = {
            technology: 'how we use technology in daily life',
            business: 'economic conditions and market trends',
            health: 'public health and medical decisions',
            science: 'scientific understanding and research',
            sports: 'the sports world and athletics',
            entertainment: 'media and entertainment industry',
            general: 'current events and society'
        };

        const impact = categoryImpact[story.category] || 'current affairs';

        const templates = [
            `This story affects ${impact} and may influence related developments.`,
            `Understanding this helps readers stay informed about ${impact}.`,
            `This development could impact how people approach ${impact}.`
        ];

        return templates[Math.floor(Math.random() * templates.length)];
    },

    /**
     * Get full context for a story (timeline + explanation + sources)
     */
    async getFullContext(storyId) {
        const [timeline, explanation, sources] = await Promise.all([
            this.buildTimeline(storyId),
            this.generateExplanation(storyId),
            StorySource.getSourcesForStory(storyId)
        ]);

        const story = await Story.findById(storyId).lean();

        return {
            story: {
                id: story._id,
                title: story.canonicalTitle,
                summary: story.summary,
                category: story.category,
                mood: story.mood,
                contentType: story.contentType,
                verificationLevel: story.verificationLevel,
                firstSeen: story.firstSeen,
                sourceCount: story.sourceCount
            },
            whatHappened: story.summary,
            whatHappenedBefore: timeline?.timeline || [],
            whyThisMatters: explanation?.explanation || '',
            sources: sources.map(s => ({
                name: s.sourceName,
                headline: s.originalHeadline,
                url: s.url,
                credibility: s.credibilityScore,
                publishedAt: s.publishedAt
            }))
        };
    },

    /**
     * Find stories that need timeline updates
     */
    async findStoriesNeedingContext() {
        return Story.find({
            whyThisMatters: { $in: ['', null] },
            aiProcessed: false
        })
            .sort({ importanceScore: -1 })
            .limit(20)
            .lean();
    }
};

module.exports = contextService;
