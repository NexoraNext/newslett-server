/**
 * Decision Maker Service (Phi-2)
 * 
 * The "brain" that decides what to do with each article.
 * Uses Microsoft Phi-2 via HuggingFace Inference API.
 * 
 * ISOLATION GUARANTEE: This service is NOT influenced by Qwen or any other LLM.
 * It only receives English text and makes independent decisions.
 * 
 * Decisions:
 * - PROCESS: Article needs full AI processing (summary, mood, etc.)
 * - SKIP: Low-value content (clickbait, spam, irrelevant)
 * - CACHE: Similar content recently processed, use cached version
 */

const axios = require('axios');
const { logger } = require('../middleware/logger');

const HF_API_KEY = process.env.HF_API_KEY;
const HF_BASE_URL = 'https://api-inference.huggingface.co/models';

// Use a model with good HuggingFace Inference API support
// Phi-2 returns 410 (not available on free inference), so we use a reliable alternative
const PHI2_MODEL = process.env.PHI2_MODEL || 'mistralai/Mistral-7B-Instruct-v0.3';

// Decision timeout (default 30 seconds)
const DECISION_TIMEOUT = parseInt(process.env.DECISION_TIMEOUT_MS) || 30000;

// Decision prompt - forces single-word response
const DECISION_PROMPT = `Task: Decide if this news article requires deep AI processing.

Rules:
- Answer with EXACTLY ONE word.
- Allowed answers: PROCESS, SKIP, CACHE.

Definitions:
- PROCESS: Important news that needs AI summarization and analysis. Breaking news, significant events, policy changes, scientific discoveries.
- SKIP: Low-value content. Clickbait, listicles, celebrity gossip, spam, advertisements, duplicate content.
- CACHE: Very similar to recently processed articles. Updates to existing stories without major new information.

Quality indicators for PROCESS:
- Has specific facts, dates, names
- Reports on significant events
- Contains original reporting
- Affects many people

Quality indicators for SKIP:
- Sensational language ("SHOCKING", "You won't believe")
- Vague or unverifiable claims
- Primarily opinion without facts
- Promotional content

Article Title: {title}
Article Content: {content}

Decision:`;

// Cache for recent decisions (simple in-memory LRU)
const decisionCache = new Map();
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Generate a content hash for caching
 */
function generateContentHash(title, content) {
    const crypto = require('crypto');
    const text = `${title}|${content}`.substring(0, 500);
    return crypto.createHash('md5').update(text).digest('hex');
}

/**
 * Check if similar content was recently processed
 */
function checkCache(title, content) {
    const hash = generateContentHash(title, content);
    const cached = decisionCache.get(hash);

    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        logger.info(`📋 Decision cache hit for: "${title.substring(0, 50)}..."`);
        return cached.decision;
    }

    return null;
}

/**
 * Store decision in cache
 */
function cacheDecision(title, content, decision) {
    const hash = generateContentHash(title, content);

    // Simple LRU: remove oldest if at capacity
    if (decisionCache.size >= MAX_CACHE_SIZE) {
        const oldestKey = decisionCache.keys().next().value;
        decisionCache.delete(oldestKey);
    }

    decisionCache.set(hash, {
        decision,
        timestamp: Date.now()
    });
}

const decisionMakerService = {
    /**
     * Check if Phi-2 API is available
     */
    isEnabled: () => {
        return process.env.USE_BRAIN_ARCHITECTURE === 'true' && !!HF_API_KEY;
    },

    /**
     * Make a decision about an article
     * 
     * @param {string} title - Article title (MUST be in English)
     * @param {string} content - Article content (MUST be in English)
     * @returns {Promise<'PROCESS'|'SKIP'|'CACHE'>}
     */
    makeDecision: async (title, content) => {
        // Check if enabled
        if (!decisionMakerService.isEnabled()) {
            logger.info('🧠 Brain architecture disabled, defaulting to PROCESS');
            return 'PROCESS';
        }

        // Check cache first
        const cachedDecision = checkCache(title, content);
        if (cachedDecision) {
            return cachedDecision === 'PROCESS' ? 'CACHE' : cachedDecision;
        }

        try {
            // Build the prompt with article content
            const prompt = DECISION_PROMPT
                .replace('{title}', title.substring(0, 200))
                .replace('{content}', content.substring(0, 1000));

            logger.info(`🧠 Phi-2 analyzing: "${title.substring(0, 50)}..."`);

            // Call Phi-2 via HuggingFace
            const response = await axios.post(
                `${HF_BASE_URL}/${PHI2_MODEL}`,
                {
                    inputs: prompt,
                    parameters: {
                        max_new_tokens: 10,
                        temperature: 0.1,  // Low for consistent decisions
                        do_sample: false,
                        return_full_text: false
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${HF_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: DECISION_TIMEOUT
                }
            );

            // Extract decision from response
            const output = response.data[0]?.generated_text || '';
            const decision = decisionMakerService.parseDecision(output);

            logger.info(`🧠 Phi-2 decision: ${decision} for "${title.substring(0, 50)}..."`);

            // Cache the decision
            cacheDecision(title, content, decision);

            return decision;

        } catch (error) {
            // Handle model loading (cold start)
            if (error.response?.status === 503) {
                const estimatedTime = error.response.data?.estimated_time || 20;
                logger.info(`⏳ Phi-2 model loading, waiting ${estimatedTime}s...`);
                await sleep(Math.min(estimatedTime * 1000, 30000));

                // Retry once
                return decisionMakerService.makeDecision(title, content);
            }

            logger.error(`❌ Phi-2 decision failed: ${error.message}`);

            // Handle 410 Gone error (model not available on free inference)
            if (error.response?.status === 410) {
                logger.info('⚠️ Model not available on free tier, using heuristics');
            }

            // Fallback to heuristic decision
            return decisionMakerService.heuristicDecision(title, content);
        }
    },

    /**
     * Parse the model output to extract decision
     */
    parseDecision: (output) => {
        const cleaned = output.trim().toUpperCase();

        // Direct match
        if (cleaned === 'PROCESS' || cleaned === 'SKIP' || cleaned === 'CACHE') {
            return cleaned;
        }

        // Extract from longer response
        if (cleaned.includes('PROCESS')) return 'PROCESS';
        if (cleaned.includes('SKIP')) return 'SKIP';
        if (cleaned.includes('CACHE')) return 'CACHE';

        // Default to PROCESS if unclear
        return 'PROCESS';
    },

    /**
     * Heuristic-based decision (fallback when Phi-2 unavailable)
     */
    heuristicDecision: (title, content) => {
        const text = `${title} ${content}`.toLowerCase();

        // SKIP indicators
        const skipPatterns = [
            /you won't believe/i,
            /shocking:/i,
            /click here/i,
            /sponsored/i,
            /advertisement/i,
            /\d+\s+things\s+you/i,
            /doctors hate/i,
            /one weird trick/i,
            /celebrity\s+\w+\s+photos/i
        ];

        for (const pattern of skipPatterns) {
            if (pattern.test(text)) {
                logger.info('🔧 Heuristic decision: SKIP (clickbait pattern)');
                return 'SKIP';
            }
        }

        // PROCESS indicators (important news)
        const processPatterns = [
            /breaking:/i,
            /announced/i,
            /government/i,
            /president/i,
            /minister/i,
            /million|billion/i,
            /percent/i,
            /study\s+finds/i,
            /research/i,
            /court\s+rules/i,
            /election/i
        ];

        let processScore = 0;
        for (const pattern of processPatterns) {
            if (pattern.test(text)) {
                processScore++;
            }
        }

        if (processScore >= 2) {
            logger.info(`🔧 Heuristic decision: PROCESS (score: ${processScore})`);
            return 'PROCESS';
        }

        // Default to PROCESS for uncertain cases
        logger.info('🔧 Heuristic decision: PROCESS (default)');
        return 'PROCESS';
    },

    /**
     * Get service status information
     */
    getStatus: () => {
        return {
            enabled: decisionMakerService.isEnabled(),
            model: PHI2_MODEL,
            cacheSize: decisionCache.size,
            maxCacheSize: MAX_CACHE_SIZE,
            cacheTTL: CACHE_TTL_MS
        };
    },

    /**
     * Clear decision cache
     */
    clearCache: () => {
        const size = decisionCache.size;
        decisionCache.clear();
        logger.info(`🗑️ Cleared ${size} cached decisions`);
        return size;
    }
};

module.exports = decisionMakerService;
