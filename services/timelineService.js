/**
 * Timeline Service
 * Fetches historical news from the internet for timeline feature
 * Uses NewsAPI "everything" endpoint for historical search
 */

const axios = require('axios');
const { logger } = require('../middleware/logger');
const keywordService = require('./keywordService');
const News = require('../models/News');

const timelineService = {
    /**
     * Fetch historical news from internet based on article keywords
     * @param {Object} article - Source article
     * @param {Object} options - Search options
     * @returns {Promise<Array>} - Array of timeline events
     */
    async fetchHistoricalNews(article, options = {}) {
        const {
            limit = 20,
            maxAgeDays = 365, // Search up to 1 year back
            includeLocal = true // Also include local database results
        } = options;

        // Extract keywords from the article
        const keywords = keywordService.extract(
            article.title,
            article.content || article.description || article.summary
        );

        if (keywords.length === 0) {
            logger.warn('No keywords extracted for timeline search');
            return {
                title: 'Timeline',
                keywords: [],
                events: [],
                totalEvents: 0,
                sources: { internet: 0, local: 0 }
            };
        }

        // Generate timeline title
        const timelineTitle = keywordService.generateTimelineTitle(keywords, article.title);

        // Build search query
        const searchQuery = keywords.slice(0, 5).join(' '); // Top 5 keywords

        logger.info('Timeline search', {
            articleId: article._id,
            keywords,
            searchQuery,
            maxAgeDays
        });

        // Fetch from multiple sources in parallel
        const [internetResults, localResults] = await Promise.all([
            this.searchNewsAPI(searchQuery, maxAgeDays, limit),
            includeLocal ? this.searchLocalDatabase(article._id, keywords, limit) : Promise.resolve([])
        ]);

        // Merge and deduplicate results
        const allResults = this.mergeAndDeduplicate(internetResults, localResults, article.url);

        // Sort by date (oldest first for timeline)
        allResults.sort((a, b) => new Date(a.date) - new Date(b.date));

        return {
            title: timelineTitle,
            keywords,
            events: allResults.slice(0, limit),
            totalEvents: allResults.length,
            sources: {
                internet: internetResults.length,
                local: localResults.length
            }
        };
    },

    /**
     * Search NewsAPI for historical articles
     */
    async searchNewsAPI(query, maxAgeDays, limit) {
        try {
            const apiKey = process.env.NEWS_API_KEY;

            if (!apiKey) {
                logger.warn('NEWS_API_KEY not configured, skipping internet search');
                return [];
            }

            // Calculate date range (NewsAPI free tier limited to 30 days)
            const toDate = new Date();
            const fromDate = new Date();
            fromDate.setDate(fromDate.getDate() - Math.min(maxAgeDays, 30)); // Free tier limit

            const response = await axios.get('https://newsapi.org/v2/everything', {
                params: {
                    q: query,
                    from: fromDate.toISOString().split('T')[0],
                    to: toDate.toISOString().split('T')[0],
                    sortBy: 'relevancy',
                    pageSize: Math.min(limit, 100),
                    language: 'en',
                    apiKey
                },
                timeout: 15000
            });

            logger.info(`NewsAPI returned ${response.data.articles?.length || 0} articles`);

            return (response.data.articles || []).map(article => ({
                id: this.generateId(article.title, article.source?.name),
                date: article.publishedAt,
                year: new Date(article.publishedAt).getFullYear(),
                month: new Date(article.publishedAt).toLocaleString('en-US', { month: 'short' }),
                title: article.title,
                summary: article.description || '',
                imageUrl: article.urlToImage || '',
                source: article.source?.name || 'Unknown',
                url: article.url,
                mood: 'neutral',
                category: 'general',
                isExternal: true // Mark as external source
            }));

        } catch (error) {
            if (error.response?.status === 426) {
                logger.warn('NewsAPI requires paid plan for historical search');
            } else {
                logger.error('NewsAPI search failed', { error: error.message });
            }
            return [];
        }
    },

    /**
     * Search Google News via web scraping (fallback)
     * Uses Google News RSS for free historical search
     */
    async searchGoogleNews(query, limit) {
        try {
            const encodedQuery = encodeURIComponent(query);
            const rssUrl = `https://news.google.com/rss/search?q=${encodedQuery}&hl=en-US&gl=US&ceid=US:en`;

            logger.info('Searching Google News RSS', { query: encodedQuery });

            const response = await axios.get(rssUrl, {
                timeout: 10000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (compatible)'
                }
            });

            // Parse RSS XML (handle both CDATA and non-CDATA formats)
            const items = [];
            const itemRegex = /<item>([\s\S]*?)<\/item>/g;
            // Try both CDATA and non-CDATA title formats
            const titleRegex = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/;
            const linkRegex = /<link>(.*?)<\/link>/;
            const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/;
            const sourceRegex = /<source[^>]*>(.*?)<\/source>/;
            // Extract description for summary
            const descRegex = /<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/;

            let match;
            while ((match = itemRegex.exec(response.data)) !== null && items.length < limit) {
                const itemXml = match[1];

                const titleMatch = titleRegex.exec(itemXml);
                const linkMatch = linkRegex.exec(itemXml);
                const dateMatch = pubDateRegex.exec(itemXml);
                const sourceMatch = sourceRegex.exec(itemXml);
                const descMatch = descRegex.exec(itemXml);

                if (titleMatch && linkMatch) {
                    const publishDate = dateMatch ? new Date(dateMatch[1]) : new Date();
                    let title = titleMatch[1].replace(/\]\]>$/, '').trim();

                    // Clean up title - remove source suffix like " - The New York Times"
                    const sourceSuffix = title.lastIndexOf(' - ');
                    const cleanTitle = sourceSuffix > 0 ? title.substring(0, sourceSuffix) : title;

                    // Extract and clean summary from description
                    let summary = '';
                    if (descMatch) {
                        let rawDesc = descMatch[1].replace(/\]\]>$/, '');

                        // 1. Decode HTML entities FIRST to reveal actual tags
                        rawDesc = rawDesc
                            .replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&#39;/g, "'")
                            .replace(/&amp;/g, '&')
                            .replace(/&nbsp;/g, ' ');

                        // 2. Strip ALL HTML tags
                        summary = rawDesc.replace(/<[^>]+>/g, '').trim();

                        // 3. Check if the result is just a URL or too short/generic
                        if (summary.startsWith('http') || summary.length < 20 || summary === 'Google News') {
                            summary = ''; // Clear it if it's just a link or junk
                        } else {
                            summary = summary.substring(0, 300);
                        }
                    }

                    if (cleanTitle && !cleanTitle.includes('[CDATA')) {
                        items.push({
                            id: this.generateId(cleanTitle, sourceMatch?.[1] || 'Google News'),
                            date: publishDate.toISOString(),
                            year: publishDate.getFullYear(),
                            month: publishDate.toLocaleString('en-US', { month: 'short' }),
                            title: cleanTitle,
                            summary: summary || `Related news from ${sourceMatch?.[1] || 'various sources'} about this topic.`,
                            imageUrl: '',
                            source: sourceMatch?.[1] || 'Google News',
                            url: linkMatch[1],
                            mood: 'neutral',
                            category: 'general',
                            isExternal: true
                        });
                    }
                }
            }

            logger.info(`Google News RSS returned ${items.length} articles for query: ${query}`);
            return items;

        } catch (error) {
            logger.error('Google News search failed', { error: error.message, stack: error.stack });
            return [];
        }
    },

    /**
     * Search local database for related articles
     */
    async searchLocalDatabase(excludeId, keywords, limit) {
        try {
            const searchQuery = keywordService.toSearchQuery(keywords);

            let articles = [];

            try {
                // Try text search first
                articles = await News.find(
                    {
                        $text: { $search: searchQuery },
                        _id: { $ne: excludeId }
                    },
                    { score: { $meta: 'textScore' } }
                )
                    .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
                    .limit(limit)
                    .select('title summary description publishedAt imageUrl mood category source url')
                    .lean();
            } catch (textSearchError) {
                // Fallback to regex search
                const regexPattern = keywords.slice(0, 3).join('|');
                articles = await News.find({
                    _id: { $ne: excludeId },
                    title: { $regex: regexPattern, $options: 'i' }
                })
                    .sort({ publishedAt: -1 })
                    .limit(limit)
                    .select('title summary description publishedAt imageUrl mood category source url')
                    .lean();
            }

            return articles.map(article => ({
                id: article._id.toString(),
                date: article.publishedAt,
                year: new Date(article.publishedAt).getFullYear(),
                month: new Date(article.publishedAt).toLocaleString('en-US', { month: 'short' }),
                title: article.title,
                summary: article.summary || article.description || '',
                imageUrl: article.imageUrl || '',
                source: article.source,
                url: article.url,
                mood: article.mood || 'neutral',
                category: article.category || 'general',
                isExternal: false // Local source
            }));

        } catch (error) {
            logger.error('Local database search failed', { error: error.message });
            return [];
        }
    },

    /**
     * Merge internet and local results, deduplicate by URL
     */
    mergeAndDeduplicate(internetResults, localResults, excludeUrl) {
        const seenUrls = new Set();
        const merged = [];

        // Add local results first (higher priority)
        for (const item of localResults) {
            if (item.url && !seenUrls.has(item.url) && item.url !== excludeUrl) {
                seenUrls.add(item.url);
                merged.push(item);
            }
        }

        // Add internet results
        for (const item of internetResults) {
            if (item.url && !seenUrls.has(item.url) && item.url !== excludeUrl) {
                seenUrls.add(item.url);
                merged.push(item);
            }
        }

        return merged;
    },

    /**
     * Generate unique ID from title and source
     */
    generateId(title, source) {
        const crypto = require('crypto');
        return crypto
            .createHash('md5')
            .update(`${title}-${source}`)
            .digest('hex')
            .substring(0, 16);
    }
};

module.exports = timelineService;
