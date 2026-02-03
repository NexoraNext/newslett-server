/**
 * Multilingual Service (Qwen 2.5)
 * 
 * Handles language detection and translation.
 * Uses Qwen 2.5 via HuggingFace Inference API.
 * 
 * ISOLATION GUARANTEE: This service is ONLY for translation.
 * It does NOT influence decision-making (Phi-2's job).
 * Qwen is called BEFORE Phi-2 (to translate) or AFTER heavy lifting (to translate back).
 */

const axios = require('axios');
const { logger } = require('../middleware/logger');

const HF_API_KEY = process.env.HF_API_KEY;
const HF_BASE_URL = 'https://api-inference.huggingface.co/models';

// Qwen 2.5 model for multilingual support
const QWEN_MODEL = process.env.QWEN_MODEL || 'Qwen/Qwen2.5-3B-Instruct';

// Translation timeout (default 60 seconds - translations can be slow)
const TRANSLATION_TIMEOUT = parseInt(process.env.TRANSLATION_TIMEOUT_MS) || 60000;

// Supported languages (ISO 639-1 codes)
const SUPPORTED_LANGUAGES = [
    'en', 'es', 'fr', 'de', 'it', 'pt', 'nl', 'ru', 'zh', 'ja', 'ko',
    'ar', 'hi', 'bn', 'ur', 'id', 'ms', 'th', 'vi', 'tr', 'pl', 'uk'
];

/**
 * Sleep utility
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

const multilingualService = {
    /**
     * Check if Qwen API is available
     */
    isEnabled: () => {
        return process.env.USE_BRAIN_ARCHITECTURE === 'true' && !!HF_API_KEY;
    },

    /**
     * Detect the language of text
     * Uses simple heuristic detection (fast, no API call)
     * 
     * @param {string} text - Text to analyze
     * @returns {string} ISO 639-1 language code
     */
    detectLanguage: (text) => {
        if (!text || text.length < 10) return 'en';

        const sample = text.substring(0, 500);
        const sampleLower = sample.toLowerCase();

        // Character set detection (check original case for proper detection)
        const hasArabic = /[\u0600-\u06FF]/.test(sample);
        const hasJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/.test(sample) &&
            /[\u3040-\u309F\u30A0-\u30FF]/.test(sample); // Must have hiragana/katakana
        const hasChinese = /[\u4E00-\u9FFF]/.test(sample) && !hasJapanese;
        const hasKorean = /[\uAC00-\uD7AF]/.test(sample);
        const hasCyrillic = /[\u0400-\u04FF]/.test(sample);
        const hasDevanagari = /[\u0900-\u097F]/.test(sample);
        const hasThai = /[\u0E00-\u0E7F]/.test(sample);

        if (hasArabic) return 'ar';
        if (hasJapanese) return 'ja';
        if (hasChinese) return 'zh';
        if (hasKorean) return 'ko';
        if (hasCyrillic) return 'ru';
        if (hasDevanagari) return 'hi';
        if (hasThai) return 'th';

        // Common word detection for European languages
        // Increased word lists for better accuracy
        const frenchWords = ['le', 'la', 'les', 'de', 'du', 'des', 'est', 'sont', 'avec', 'pour', 'dans', 'sur', 'un', 'une', 'ce', 'cette', 'cet', 'qui', 'que', 'français', 'presse', 'article'];
        const spanishWords = ['el', 'la', 'los', 'las', 'de', 'del', 'es', 'son', 'con', 'para', 'en', 'sobre', 'un', 'una', 'que', 'este', 'esta', 'artículo', 'noticias', 'español'];
        const germanWords = ['der', 'die', 'das', 'und', 'ist', 'sind', 'mit', 'für', 'auf', 'aus', 'bei', 'nach', 'ein', 'eine', 'dieser', 'diese', 'artikel', 'nachrichten', 'deutsch'];
        const italianWords = ['il', 'la', 'le', 'di', 'del', 'è', 'sono', 'con', 'per', 'in', 'su', 'da', 'un', 'una', 'questo', 'questa', 'articolo', 'notizie', 'italiano'];
        const portugueseWords = ['o', 'a', 'os', 'as', 'de', 'do', 'é', 'são', 'com', 'para', 'em', 'no', 'um', 'uma', 'este', 'esta', 'artigo', 'notícias', 'português'];

        const words = sampleLower.split(/\s+/);

        const countMatches = (wordList) => words.filter(w => wordList.includes(w)).length;

        const scores = {
            'fr': countMatches(frenchWords),
            'es': countMatches(spanishWords),
            'de': countMatches(germanWords),
            'it': countMatches(italianWords),
            'pt': countMatches(portugueseWords)
        };

        const topLang = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];

        // Lower threshold for shorter texts (1 match for short, 2 for medium, 3 for long)
        const threshold = words.length < 10 ? 1 : (words.length < 20 ? 2 : 3);

        if (topLang[1] >= threshold) {
            return topLang[0];
        }

        // Default to English
        return 'en';
    },

    /**
     * Check if text needs translation
     * 
     * @param {string} text - Text to check
     * @returns {boolean} True if translation needed
     */
    needsTranslation: (text) => {
        const lang = multilingualService.detectLanguage(text);
        return lang !== 'en';
    },

    /**
     * Translate text to English using Qwen 2.5
     * 
     * @param {string} text - Text to translate
     * @param {string} sourceLang - Source language code (optional, auto-detected)
     * @returns {Promise<{text: string, sourceLang: string}>}
     */
    translateToEnglish: async (text, sourceLang = null) => {
        if (!text || text.length < 5) {
            return { text, sourceLang: 'en' };
        }

        // Detect language if not provided
        if (!sourceLang) {
            sourceLang = multilingualService.detectLanguage(text);
        }

        // Already English
        if (sourceLang === 'en') {
            return { text, sourceLang: 'en' };
        }

        // If Qwen not available, return original
        if (!multilingualService.isEnabled()) {
            logger.warn('⚠️ Multilingual service disabled, returning original text');
            return { text, sourceLang };
        }

        try {
            logger.info(`🌍 Translating from ${sourceLang} to English...`);

            const messages = [
                {
                    role: 'system',
                    content: 'You are a professional translator. Translate the following text to English. Only output the translation, nothing else. Preserve the original meaning and tone.'
                },
                {
                    role: 'user',
                    content: text.substring(0, 2000) // Limit input size
                }
            ];

            const response = await axios.post(
                `${HF_BASE_URL}/${QWEN_MODEL}`,
                {
                    inputs: messages,
                    parameters: {
                        max_new_tokens: 2000,
                        temperature: 0.3,
                        do_sample: false,
                        return_full_text: false
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${HF_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: TRANSLATION_TIMEOUT
                }
            );

            const translated = response.data[0]?.generated_text || text;

            logger.info(`✅ Translation complete (${sourceLang} → en)`);

            return {
                text: translated.trim(),
                sourceLang
            };

        } catch (error) {
            // Handle model loading
            if (error.response?.status === 503) {
                const estimatedTime = error.response.data?.estimated_time || 30;
                logger.info(`⏳ Qwen model loading, waiting ${estimatedTime}s...`);
                await sleep(Math.min(estimatedTime * 1000, 60000));
                return multilingualService.translateToEnglish(text, sourceLang);
            }

            logger.error(`❌ Translation failed: ${error.message}`);
            return { text, sourceLang };
        }
    },

    /**
     * Translate text from English to target language
     * 
     * @param {string} text - English text to translate
     * @param {string} targetLang - Target language code
     * @returns {Promise<string>}
     */
    translateFromEnglish: async (text, targetLang) => {
        if (!text || targetLang === 'en') {
            return text;
        }

        if (!multilingualService.isEnabled()) {
            return text;
        }

        try {
            logger.info(`🌍 Translating from English to ${targetLang}...`);

            const langNames = {
                'es': 'Spanish', 'fr': 'French', 'de': 'German', 'it': 'Italian',
                'pt': 'Portuguese', 'ru': 'Russian', 'zh': 'Chinese', 'ja': 'Japanese',
                'ko': 'Korean', 'ar': 'Arabic', 'hi': 'Hindi', 'nl': 'Dutch'
            };

            const targetName = langNames[targetLang] || targetLang;

            const messages = [
                {
                    role: 'system',
                    content: `You are a professional translator. Translate the following text to ${targetName}. Only output the translation, nothing else.`
                },
                {
                    role: 'user',
                    content: text.substring(0, 2000)
                }
            ];

            const response = await axios.post(
                `${HF_BASE_URL}/${QWEN_MODEL}`,
                {
                    inputs: messages,
                    parameters: {
                        max_new_tokens: 2000,
                        temperature: 0.3,
                        do_sample: false,
                        return_full_text: false
                    }
                },
                {
                    headers: {
                        'Authorization': `Bearer ${HF_API_KEY}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: TRANSLATION_TIMEOUT
                }
            );

            const translated = response.data[0]?.generated_text || text;

            logger.info(`✅ Translation complete (en → ${targetLang})`);

            return translated.trim();

        } catch (error) {
            logger.error(`❌ Translation to ${targetLang} failed: ${error.message}`);
            return text;
        }
    },

    /**
     * Get supported languages
     */
    getSupportedLanguages: () => {
        return SUPPORTED_LANGUAGES;
    },

    /**
     * Get service status
     */
    getStatus: () => {
        return {
            enabled: multilingualService.isEnabled(),
            model: QWEN_MODEL,
            supportedLanguages: SUPPORTED_LANGUAGES.length
        };
    }
};

module.exports = multilingualService;
