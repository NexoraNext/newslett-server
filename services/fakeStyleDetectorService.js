/**
 * Fake News Style Detector Service (LOCAL MODEL)
 * 
 * This is a placeholder for your custom-trained model.
 * Storage: ~260 MB (only local model needed)
 * 
 * When ready, place your trained model in:
 * server/models/ai_fake_style_detector/
 * 
 * Expected model structure:
 * models/
 * └── ai_fake_style_detector/
 *     ├── config.json
 *     ├── tokenizer.json
 *     ├── model.safetensors (or pytorch_model.bin)
 *     └── vocabulary.txt
 */

const { logger } = require('../middleware/logger');
const path = require('path');
const fs = require('fs');

const MODEL_PATH = process.env.FAKE_STYLE_MODEL_PATH || './models/ai_fake_style_detector';

const fakeStyleDetectorService = {
    /**
     * Check if the model is available
     */
    isModelAvailable: () => {
        const fullPath = path.resolve(__dirname, '..', MODEL_PATH);
        return fs.existsSync(fullPath);
    },

    /**
     * Analyze text for fake news style patterns
     * Returns confidence scores for various style indicators
     * 
     * @param {string} text - The article text to analyze
     * @returns {Object} Analysis results with style indicators
     */
    analyzeStyle: async (text) => {
        try {
            if (!fakeStyleDetectorService.isModelAvailable()) {
                logger.warn('⚠️ Fake-style detector model not available, using heuristics');
                return fakeStyleDetectorService.heuristicAnalysis(text);
            }

            // TODO: Load and run your trained model here
            // When you provide the trained model, implement actual inference:
            // 
            // const { pipeline } = require('@xenova/transformers');
            // const classifier = await pipeline('text-classification', MODEL_PATH);
            // const result = await classifier(text);
            // return { ... };

            // For now, return heuristic-based analysis
            return fakeStyleDetectorService.heuristicAnalysis(text);
        } catch (error) {
            logger.error('Fake-style detection failed:', error.message);
            return fakeStyleDetectorService.heuristicAnalysis(text);
        }
    },

    /**
     * Heuristic-based analysis (fallback when model not loaded)
     * Checks for common fake news style patterns
     */
    heuristicAnalysis: (text) => {
        const lowerText = text.toLowerCase();

        // Style indicators
        const styleIndicators = {
            sensationalLanguage: 0,
            clickbaitPatterns: 0,
            emotionalManipulation: 0,
            unverifiableClaims: 0,
            sourceCredibility: 1.0  // Default to credible
        };

        // Check for sensational language
        const sensationalWords = [
            'shocking', 'breaking', 'urgent', 'must see', 'you won\'t believe',
            'incredible', 'jaw-dropping', 'mind-blowing', 'exposed', 'scandal'
        ];
        styleIndicators.sensationalLanguage = sensationalWords.filter(w =>
            lowerText.includes(w)
        ).length / 10;

        // Check for clickbait patterns
        const clickbaitPatterns = [
            /what happens next/i,
            /you won't believe/i,
            /this is why/i,
            /doctors hate/i,
            /one weird trick/i,
            /\d+ reasons why/i,
            /the truth about/i
        ];
        styleIndicators.clickbaitPatterns = clickbaitPatterns.filter(p =>
            p.test(text)
        ).length / 7;

        // Check for emotional manipulation
        const emotionalWords = [
            'outrage', 'horrifying', 'devastating', 'terrifying', 'disgusting',
            'heartbreaking', 'infuriating', 'shocking', 'unbelievable'
        ];
        styleIndicators.emotionalManipulation = emotionalWords.filter(w =>
            lowerText.includes(w)
        ).length / 9;

        // Check for unverifiable claims
        const vagueSources = [
            'experts say', 'studies show', 'according to sources',
            'it has been reported', 'many believe', 'scientists claim'
        ];
        styleIndicators.unverifiableClaims = vagueSources.filter(s =>
            lowerText.includes(s)
        ).length / 6;

        // Calculate overall fake style score (0 = authentic, 1 = likely fake)
        const fakeStyleScore = (
            styleIndicators.sensationalLanguage * 0.3 +
            styleIndicators.clickbaitPatterns * 0.3 +
            styleIndicators.emotionalManipulation * 0.2 +
            styleIndicators.unverifiableClaims * 0.2
        );

        return {
            fakeStyleScore: Math.min(fakeStyleScore, 1),
            confidence: 0.6, // Lower confidence for heuristic analysis
            styleIndicators,
            method: 'heuristic',
            label: fakeStyleScore > 0.5 ? 'suspicious' : (fakeStyleScore > 0.3 ? 'cautious' : 'authentic'),
            note: 'Analysis based on heuristics. Custom model not loaded.'
        };
    },

    /**
     * Get model info
     */
    getModelInfo: () => {
        return {
            isLoaded: fakeStyleDetectorService.isModelAvailable(),
            modelPath: MODEL_PATH,
            expectedSize: '~260 MB',
            description: 'Custom-trained fake news style detector'
        };
    }
};

module.exports = fakeStyleDetectorService;
