/**
 * Keyword Extraction Service
 * Extracts key terms from article title and content for timeline search
 */

// Common stop words to filter out
const STOP_WORDS = new Set([
    'a', 'an', 'the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of',
    'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have',
    'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
    'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'it', 'its',
    'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she', 'we', 'they', 'me',
    'him', 'her', 'us', 'them', 'my', 'your', 'his', 'our', 'their', 'what', 'which',
    'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both',
    'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only',
    'own', 'same', 'so', 'than', 'too', 'very', 'just', 'also', 'now', 'here',
    'there', 'then', 'once', 'if', 'because', 'until', 'while', 'about', 'after',
    'before', 'during', 'above', 'below', 'between', 'into', 'through', 'under',
    'again', 'further', 'against', 'says', 'said', 'new', 'first', 'last', 'year',
    'years', 'day', 'days', 'week', 'weeks', 'month', 'months', 'time', 'times',
    'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
    'many', 'much', 'get', 'gets', 'got', 'make', 'makes', 'made', 'go', 'goes',
    'went', 'going', 'come', 'comes', 'came', 'coming', 'take', 'takes', 'took',
    'taking', 'see', 'sees', 'saw', 'seen', 'know', 'knows', 'knew', 'known',
    'think', 'thinks', 'thought', 'want', 'wants', 'wanted', 'look', 'looks',
    'looked', 'use', 'uses', 'used', 'find', 'finds', 'found', 'give', 'gives',
    'gave', 'tell', 'tells', 'told', 'work', 'works', 'worked', 'call', 'calls',
    'called', 'try', 'tries', 'tried', 'ask', 'asks', 'asked', 'put', 'puts',
    'keep', 'keeps', 'kept', 'let', 'lets', 'begin', 'begins', 'began', 'seem',
    'seems', 'seemed', 'help', 'helps', 'helped', 'show', 'shows', 'showed',
    'hear', 'hears', 'heard', 'play', 'plays', 'played', 'run', 'runs', 'ran',
    'move', 'moves', 'moved', 'live', 'lives', 'lived', 'believe', 'believes',
    'hold', 'holds', 'held', 'bring', 'brings', 'brought', 'happen', 'happens',
    'write', 'writes', 'wrote', 'provide', 'provides', 'sit', 'sits', 'sat',
    'stand', 'stands', 'stood', 'lose', 'loses', 'lost', 'pay', 'pays', 'paid',
    'meet', 'meets', 'met', 'include', 'includes', 'continue', 'continues', 'set',
    'learn', 'learns', 'change', 'changes', 'lead', 'leads', 'understand', 'watch',
    'follow', 'follows', 'stop', 'stops', 'create', 'creates', 'speak', 'speaks',
    'read', 'reads', 'allow', 'allows', 'add', 'adds', 'spend', 'spends', 'grow',
    'open', 'opens', 'walk', 'walks', 'win', 'wins', 'offer', 'offers', 'remember',
    'love', 'loves', 'consider', 'appear', 'appears', 'buy', 'buys', 'wait', 'waits',
    'serve', 'serves', 'die', 'dies', 'send', 'sends', 'expect', 'expects', 'build',
    'stay', 'stays', 'fall', 'falls', 'cut', 'cuts', 'reach', 'reaches', 'kill',
    'remain', 'suggest', 'raise', 'pass', 'sell', 'require', 'report', 'decide',
    'pull', 'breaking', 'latest', 'update', 'updates', 'news', 'today', 'yesterday'
]);

const keywordService = {
    /**
     * Extract keywords from title and content
     * @param {string} title - Article title
     * @param {string} content - Article content/description
     * @param {number} maxKeywords - Maximum keywords to return
     * @returns {string[]} - Array of keywords
     */
    extract(title, content = '', maxKeywords = 8) {
        // Combine title (weighted higher) and content
        const text = `${title} ${title} ${title} ${content}`.toLowerCase();

        // Tokenize and clean
        const words = text
            .replace(/[^a-zA-Z0-9\s'-]/g, ' ')
            .split(/\s+/)
            .filter(word => word.length > 2)
            .filter(word => !STOP_WORDS.has(word))
            .filter(word => !/^\d+$/.test(word)); // Remove pure numbers

        // Count word frequencies
        const wordFreq = {};
        words.forEach(word => {
            wordFreq[word] = (wordFreq[word] || 0) + 1;
        });

        // Sort by frequency and get top keywords
        const sortedWords = Object.entries(wordFreq)
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxKeywords)
            .map(([word]) => word);

        // Also extract capitalized words from original title (likely proper nouns)
        const properNouns = title
            .split(/\s+/)
            .filter(word => /^[A-Z][a-z]+/.test(word))
            .filter(word => word.length > 2)
            .filter(word => !STOP_WORDS.has(word.toLowerCase()))
            .map(word => word.toLowerCase());

        // Merge proper nouns at the front (more important)
        const combined = [...new Set([...properNouns, ...sortedWords])];

        return combined.slice(0, maxKeywords);
    },

    /**
     * Generate a timeline title from keywords
     * @param {string[]} keywords - Extracted keywords
     * @param {string} originalTitle - Original article title
     * @returns {string} - Timeline title
     */
    generateTimelineTitle(keywords, originalTitle) {
        if (keywords.length === 0) {
            return 'Related Stories Timeline';
        }

        // Use the first 1-2 most important keywords
        const mainKeyword = keywords[0];
        const capitalizedKeyword = mainKeyword.charAt(0).toUpperCase() + mainKeyword.slice(1);

        // Check for common patterns
        if (keywords.length >= 2) {
            const second = keywords[1].charAt(0).toUpperCase() + keywords[1].slice(1);
            return `${capitalizedKeyword} ${second} Timeline`;
        }

        return `${capitalizedKeyword} Timeline`;
    },

    /**
     * Create MongoDB text search query string
     * @param {string[]} keywords - Keywords to search
     * @returns {string} - Search query string
     */
    toSearchQuery(keywords) {
        // Quote phrases for exact matching of important terms
        return keywords.map(kw => `"${kw}"`).join(' ');
    }
};

module.exports = keywordService;
