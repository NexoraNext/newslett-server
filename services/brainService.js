/**
 * Brain Service - The Central AI Orchestrator
 * 
 * Coordinates all AI services to process news articles intelligently.
 * Enforces isolation between decision-making (Phi-2) and translation (Qwen).
 * 
 * ARCHITECTURE:
 * 1. Detect language → if non-English, translate via Qwen (ISOLATED)
 * 2. Decision via Phi-2 (receives ONLY English text)
 * 3. If PROCESS → Heavy lifting via BART/RoBERTa/MiniLM
 * 4. If original was non-English → translate results back
 */

const { logger } = require('../middleware/logger');
const decisionMakerService = require('./decisionMakerService');
const multilingualService = require('./multilingualService');
const huggingFaceService = require('./huggingFaceService');

const brainService = {
    /**
     * Check if brain architecture is enabled
     */
    isEnabled: () => {
        return process.env.USE_BRAIN_ARCHITECTURE === 'true';
    },

    /**
     * Process an article through the full AI pipeline
     * 
     * @param {Object} article - Article to process
     * @param {string} article.title - Article title
     * @param {string} article.content - Article content
     * @param {string} article.source - Source name
     * @param {string} article.category - Category
     * @returns {Promise<Object>} Processed article with AI enhancements
     */
    processArticle: async (article) => {
        const startTime = Date.now();
        const result = {
            original: article,
            decision: null,
            processed: false,
            summary: null,
            mood: null,
            whyThisMatters: null,
            sourceLanguage: 'en',
            processingTime: null,
            errors: []
        };

        try {
            const { title, content } = article;

            if (!title || !content) {
                result.decision = 'SKIP';
                result.errors.push('Missing title or content');
                return result;
            }

            // ==========================================
            // STEP 1: Language Detection & Translation
            // ==========================================
            let englishTitle = title;
            let englishContent = content;
            let sourceLang = 'en';

            if (multilingualService.needsTranslation(title) ||
                multilingualService.needsTranslation(content)) {

                logger.info('🌍 Non-English content detected, translating...');

                // Translate title
                const titleResult = await multilingualService.translateToEnglish(title);
                englishTitle = titleResult.text;
                sourceLang = titleResult.sourceLang;

                // Translate content
                const contentResult = await multilingualService.translateToEnglish(content);
                englishContent = contentResult.text;

                result.sourceLanguage = sourceLang;
                logger.info(`✅ Translation complete: ${sourceLang} → en`);
            }

            // ==========================================
            // STEP 2: Decision Making (Phi-2)
            // ISOLATED: Only sees English text
            // ==========================================
            const decision = await decisionMakerService.makeDecision(
                englishTitle,
                englishContent
            );
            result.decision = decision;

            logger.info(`🧠 Decision: ${decision}`);

            // ==========================================
            // STEP 3: Handle Decision
            // ==========================================
            if (decision === 'SKIP') {
                result.processingTime = Date.now() - startTime;
                logger.info(`⏭️ Skipping article: "${title.substring(0, 50)}..."`);
                return result;
            }

            if (decision === 'CACHE') {
                result.processingTime = Date.now() - startTime;
                logger.info(`📋 Using cached data for: "${title.substring(0, 50)}..."`);
                return result;
            }

            // ==========================================
            // STEP 4: Heavy Lifting (PROCESS decision)
            // ==========================================
            result.processed = true;

            // Run all heavy lifting in parallel
            const [summary, mood, bias] = await Promise.all([
                // BART for summarization
                huggingFaceService.isEnabled()
                    ? huggingFaceService.generateSummary(englishTitle, englishContent)
                    : null,

                // RoBERTa for mood classification
                huggingFaceService.isEnabled()
                    ? huggingFaceService.classifyMood(`${englishTitle} ${englishContent}`)
                    : null,

                // BART-MNLI for bias detection (used for "why this matters")
                huggingFaceService.isEnabled()
                    ? huggingFaceService.detectBias(`${englishTitle} ${englishContent}`)
                    : null
            ]);

            result.summary = summary;
            result.mood = mood || 'neutral';

            // Generate "Why This Matters" from bias analysis
            if (bias) {
                result.whyThisMatters = brainService.generateWhyThisMatters(
                    englishTitle,
                    bias
                );
            }

            // ==========================================
            // STEP 5: Translate Back (if needed)
            // ==========================================
            if (sourceLang !== 'en' && result.summary) {
                logger.info(`🌍 Translating results back to ${sourceLang}...`);

                result.summary = await multilingualService.translateFromEnglish(
                    result.summary,
                    sourceLang
                );

                if (result.whyThisMatters) {
                    result.whyThisMatters = await multilingualService.translateFromEnglish(
                        result.whyThisMatters,
                        sourceLang
                    );
                }
            }

            result.processingTime = Date.now() - startTime;
            logger.info(`✅ Article processed in ${result.processingTime}ms`);

            return result;

        } catch (error) {
            result.errors.push(error.message);
            logger.error(`❌ Brain processing failed: ${error.message}`);
            result.processingTime = Date.now() - startTime;
            return result;
        }
    },

    /**
     * Generate "Why This Matters" explanation from bias analysis
     */
    generateWhyThisMatters: (title, biasResult) => {
        const topicArea = brainService.detectTopicArea(title);
        const biasLevel = biasResult.topLabel || 'neutral';

        const templates = {
            neutral: `This balanced report helps readers understand ${topicArea}.`,
            balanced: `This well-sourced story provides context on ${topicArea}.`,
            biased: `Consider multiple sources when evaluating this ${topicArea} coverage.`,
            'one-sided': `This perspective on ${topicArea} may benefit from additional viewpoints.`
        };

        return templates[biasLevel] || templates.neutral;
    },

    /**
     * Detect topic area from title
     */
    detectTopicArea: (title) => {
        const titleLower = title.toLowerCase();

        if (titleLower.match(/tech|ai|software|computer|digital/)) return 'technology trends';
        if (titleLower.match(/health|medical|doctor|hospital/)) return 'public health';
        if (titleLower.match(/economy|market|stock|finance|money/)) return 'economic conditions';
        if (titleLower.match(/politic|government|election|vote/)) return 'political developments';
        if (titleLower.match(/climate|environment|green|carbon/)) return 'environmental issues';
        if (titleLower.match(/sport|game|team|player|match/)) return 'sports news';
        if (titleLower.match(/science|research|study|discover/)) return 'scientific developments';

        return 'current affairs';
    },

    /**
     * Process a batch of articles
     */
    processBatch: async (articles, options = {}) => {
        const { concurrency = 3, skipDecision = false } = options;

        const results = [];
        const batches = [];

        // Split into batches for concurrency control
        for (let i = 0; i < articles.length; i += concurrency) {
            batches.push(articles.slice(i, i + concurrency));
        }

        for (const batch of batches) {
            const batchResults = await Promise.all(
                batch.map(article =>
                    skipDecision
                        ? brainService.processArticleForced(article)
                        : brainService.processArticle(article)
                )
            );
            results.push(...batchResults);
        }

        const stats = {
            total: results.length,
            processed: results.filter(r => r.processed).length,
            skipped: results.filter(r => r.decision === 'SKIP').length,
            cached: results.filter(r => r.decision === 'CACHE').length,
            errors: results.filter(r => r.errors.length > 0).length
        };

        logger.info(`📊 Batch complete: ${stats.processed} processed, ${stats.skipped} skipped, ${stats.cached} cached`);

        return { results, stats };
    },

    /**
     * Force process an article (bypass decision maker)
     * Used for manually triggered processing
     */
    processArticleForced: async (article) => {
        const result = await brainService.processArticle(article);
        result.decision = 'PROCESS';
        result.processed = true;
        return result;
    },

    /**
     * Get brain status
     */
    getStatus: () => {
        return {
            enabled: brainService.isEnabled(),
            services: {
                decisionMaker: decisionMakerService.getStatus(),
                multilingual: multilingualService.getStatus(),
                huggingFace: {
                    enabled: huggingFaceService.isEnabled()
                }
            }
        };
    }
};

module.exports = brainService;
