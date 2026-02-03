const crypto = require('crypto');
const Story = require('../models/Story');
const StorySource = require('../models/StorySource');
const Source = require('../models/Source');
const News = require('../models/News');
const { logger } = require('../middleware/logger');
const gemmaApiService = require('./gemmaApiService');

/**
 * Clustering Service
 * Handles story deduplication and grouping similar articles
 */
const clusteringService = {
    // Similarity threshold for grouping articles (0-1)
    SIMILARITY_THRESHOLD: 0.65,

    /**
     * Calculate text similarity using a simple but effective approach
     * Uses normalized word overlap (Jaccard similarity on significant words)
     */
    calculateSimilarity(text1, text2) {
        if (!text1 || !text2) return 0;

        // Normalize and extract significant words (>3 chars, no stopwords)
        const stopwords = new Set([
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
            'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought',
            'used', 'said', 'says', 'that', 'this', 'these', 'those', 'what', 'which',
            'who', 'whom', 'whose', 'when', 'where', 'why', 'how', 'all', 'each',
            'every', 'both', 'few', 'more', 'most', 'other', 'some', 'such', 'only',
            'own', 'same', 'than', 'too', 'very', 'just', 'also', 'now', 'here'
        ]);

        const extractWords = (text) => {
            return text
                .toLowerCase()
                .replace(/[^\w\s]/g, ' ')
                .split(/\s+/)
                .filter(word => word.length > 3 && !stopwords.has(word));
        };

        const words1 = new Set(extractWords(text1));
        const words2 = new Set(extractWords(text2));

        if (words1.size === 0 || words2.size === 0) return 0;

        // Jaccard similarity: intersection / union
        const intersection = [...words1].filter(w => words2.has(w)).length;
        const union = new Set([...words1, ...words2]).size;

        return intersection / union;
    },

    /**
     * Calculate title similarity (weighted higher for clustering decisions)
     */
    calculateTitleSimilarity(title1, title2) {
        // Titles are more important, so we use stricter matching
        const similarity = this.calculateSimilarity(title1, title2);

        // Bonus for exact phrase matches
        const t1 = title1.toLowerCase();
        const t2 = title2.toLowerCase();

        // Check for shared significant phrases (3+ word sequences)
        const phrases1 = this.extractPhrases(t1, 3);
        const phrases2 = this.extractPhrases(t2, 3);

        const sharedPhrases = phrases1.filter(p => phrases2.includes(p)).length;
        const phraseBonus = Math.min(sharedPhrases * 0.1, 0.3);

        return Math.min(similarity + phraseBonus, 1);
    },

    /**
     * Extract n-word phrases from text
     */
    extractPhrases(text, n) {
        const words = text.split(/\s+/).filter(w => w.length > 2);
        const phrases = [];

        for (let i = 0; i <= words.length - n; i++) {
            phrases.push(words.slice(i, i + n).join(' '));
        }

        return phrases;
    },

    /**
     * Calculate overall similarity score for two articles
     */
    calculateArticleSimilarity(article1, article2) {
        const titleWeight = 0.6;
        const contentWeight = 0.4;

        const titleSim = this.calculateTitleSimilarity(
            article1.title || '',
            article2.title || ''
        );

        const contentSim = this.calculateSimilarity(
            (article1.description || '') + ' ' + (article1.content || ''),
            (article2.description || '') + ' ' + (article2.content || '')
        );

        // Must have at least some title similarity to be considered same story
        if (titleSim < 0.3) return 0;

        return titleWeight * titleSim + contentWeight * contentSim;
    },

    /**
     * Find if an article matches an existing story
     */
    async findMatchingStory(article) {
        // Get recent stories (last 48 hours) in the same category
        const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);

        const recentStories = await Story.find({
            firstSeen: { $gte: cutoff },
            category: article.category || 'general'
        }).lean();

        let bestMatch = null;
        let bestScore = 0;

        for (const story of recentStories) {
            const similarity = this.calculateTitleSimilarity(
                article.title || '',
                story.canonicalTitle || ''
            );

            if (similarity > this.SIMILARITY_THRESHOLD && similarity > bestScore) {
                bestScore = similarity;
                bestMatch = story;
            }
        }

        return bestMatch ? { story: bestMatch, score: bestScore } : null;
    },

    /**
     * Create a new story from an article
     */
    async createStoryFromArticle(article) {
        try {
            // Get or create source for credibility
            const source = await Source.getOrCreate(article.source);

            // Create the story
            const story = await Story.create({
                canonicalTitle: article.title,
                summary: article.summary || '',
                whyThisMatters: article.whyThisMatters || '',
                mood: article.mood || 'neutral',
                category: article.category || 'general',
                imageUrl: article.imageUrl || '',
                contentType: this.detectContentType(article),
                sourceCount: 1,
                sourceDiversity: 0,
                averageCredibility: source.credibilityScore,
                importanceScore: source.credibilityScore * 0.25, // Initial score
                firstSeen: article.publishedAt || new Date(),
                lastUpdated: new Date()
            });

            // Create the story-source link
            await StorySource.create({
                storyId: story._id,
                articleId: article._id,
                sourceName: article.source,
                originalHeadline: article.title,
                url: article.url,
                publishedAt: article.publishedAt,
                credibilityScore: source.credibilityScore,
                isPrimary: true,
                similarityScore: 1.0
            });

            logger.info(`Created new story: "${story.canonicalTitle}" from ${article.source}`);

            return story;
        } catch (error) {
            logger.error('Error creating story from article:', error);
            throw error;
        }
    },

    /**
     * Add an article to an existing story
     */
    async addArticleToStory(storyId, article, similarityScore) {
        try {
            const story = await Story.findById(storyId);
            if (!story) throw new Error('Story not found');

            // Get source credibility
            const source = await Source.getOrCreate(article.source);

            // Check if this source already exists for this story
            const existing = await StorySource.findOne({
                storyId: storyId,
                sourceName: article.source
            });

            if (existing) {
                logger.info(`Source ${article.source} already in story, skipping`);
                return story;
            }

            // Add the source link
            await StorySource.create({
                storyId: storyId,
                articleId: article._id,
                sourceName: article.source,
                originalHeadline: article.title,
                url: article.url,
                publishedAt: article.publishedAt,
                credibilityScore: source.credibilityScore,
                isPrimary: false,
                similarityScore: similarityScore
            });

            // Update story statistics
            story.sourceCount += 1;
            story.lastUpdated = new Date();

            // Recalculate diversity and average credibility
            story.sourceDiversity = await StorySource.calculateSourceDiversity(storyId);
            story.averageCredibility = await StorySource.calculateAverageCredibility(storyId);

            await story.save();

            // Recalculate importance score
            await Story.recalculateImportance(storyId);

            logger.info(`Added ${article.source} to story "${story.canonicalTitle}" (${story.sourceCount} sources)`);

            return story;
        } catch (error) {
            logger.error('Error adding article to story:', error);
            throw error;
        }
    },

    /**
     * Process a batch of articles and cluster them
     */
    async clusterArticles(articles) {
        const results = {
            newStories: 0,
            mergedArticles: 0,
            skipped: 0,
            errors: 0
        };

        for (const article of articles) {
            try {
                // Check if article is already linked to a story
                const existingLink = await StorySource.findOne({ articleId: article._id });
                if (existingLink) {
                    results.skipped++;
                    continue;
                }

                // Try to find a matching story
                const match = await this.findMatchingStory(article);

                if (match) {
                    // Add to existing story
                    await this.addArticleToStory(match.story._id, article, match.score);
                    results.mergedArticles++;
                } else {
                    // Create new story
                    await this.createStoryFromArticle(article);
                    results.newStories++;
                }
            } catch (error) {
                logger.error(`Error processing article ${article._id}:`, error);
                results.errors++;
            }
        }

        logger.info(`Clustering complete: ${results.newStories} new stories, ${results.mergedArticles} merged, ${results.skipped} skipped, ${results.errors} errors`);

        return results;
    },

    /**
     * Detect content type based on article characteristics
     */
    detectContentType(article) {
        const title = (article.title || '').toLowerCase();
        const content = (article.content || article.description || '').toLowerCase();
        const text = title + ' ' + content;

        // Opinion indicators
        const opinionWords = ['opinion', 'editorial', 'commentary', 'op-ed', 'perspective', 'my view', 'i think', 'i believe'];
        if (opinionWords.some(word => text.includes(word))) {
            return 'OPINION';
        }

        // Analysis indicators
        const analysisWords = ['analysis', 'explains', 'what it means', 'breakdown', 'deep dive', 'in-depth', 'explainer'];
        if (analysisWords.some(word => text.includes(word))) {
            return 'ANALYSIS';
        }

        return 'NEWS';
    },

    /**
     * Run clustering on all unprocessed articles
     */
    async processUnclusteredArticles() {
        // Find articles not yet linked to stories
        const linkedArticleIds = await StorySource.distinct('articleId');

        const unclusteredArticles = await News.find({
            _id: { $nin: linkedArticleIds }
        })
            .sort({ publishedAt: -1 })
            .limit(100) // Process in batches
            .lean();

        if (unclusteredArticles.length === 0) {
            logger.info('No unclustered articles to process');
            return { processed: 0 };
        }

        logger.info(`Processing ${unclusteredArticles.length} unclustered articles`);

        return this.clusterArticles(unclusteredArticles);
    }
};

module.exports = clusteringService;
