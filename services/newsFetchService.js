const axios = require('axios');
const crypto = require('crypto');
const News = require('../models/News');
const gemmaApiService = require('./gemmaApiService');
const { logger } = require('../middleware/logger');

/**
 * Generate a unique ID for each article
 */
const generateArticleId = (title, source) => {
  return crypto.createHash('md5').update(title + source).digest('hex');
};

/**
 * News Fetch Service
 * Fetches news from multiple sources and processes them
 */
const newsFetchService = {
  /**
   * Fetch from all configured sources
   */
  fetchFromAllSources: async () => {
    try {
      logger.info('Fetching news from all sources...');

      const sources = [];

      // Only fetch from sources with valid API keys
      if (process.env.NEWS_API_KEY) {
        sources.push(newsFetchService.fetchFromNewsAPI());
      }
      if (process.env.NYT_API_KEY) {
        sources.push(newsFetchService.fetchFromNYT());
      }

      if (sources.length === 0) {
        logger.warn('No API keys configured. Using mock data.');
        return generateMockArticles();
      }

      const results = await Promise.allSettled(sources);

      const articles = results
        .filter(r => r.status === 'fulfilled')
        .flatMap(r => r.value);

      logger.info(`Fetched ${articles.length} total articles`);
      return articles;
    } catch (error) {
      logger.error('Failed to fetch from all sources', error);
      return [];
    }
  },

  /**
   * Fetch from NewsAPI
   */
  fetchFromNewsAPI: async () => {
    try {
      const response = await axios.get('https://newsapi.org/v2/top-headlines', {
        params: {
          country: 'us',
          pageSize: 30,
          apiKey: process.env.NEWS_API_KEY
        },
        timeout: 10000
      });

      logger.info(`Fetched ${response.data.articles?.length || 0} articles from NewsAPI`);

      return (response.data.articles || []).map(article => ({
        id: generateArticleId(article.title, article.source?.name || 'NewsAPI'),
        title: article.title,
        description: article.description || '',
        content: article.content || article.description || '',
        imageUrl: article.urlToImage || '',
        source: article.source?.name || 'Unknown',
        author: article.author || 'Unknown',
        publishedAt: new Date(article.publishedAt),
        url: article.url,
        category: 'general'
      }));
    } catch (error) {
      logger.error('Failed to fetch from NewsAPI', error);
      return [];
    }
  },

  /**
   * Fetch from NYT
   */
  fetchFromNYT: async () => {
    try {
      const response = await axios.get('https://api.nytimes.com/svc/topstories/v2/home.json', {
        params: { 'api-key': process.env.NYT_API_KEY },
        timeout: 10000
      });

      logger.info(`Fetched ${response.data.results?.length || 0} articles from NYT`);

      return (response.data.results || []).map(article => ({
        id: generateArticleId(article.title, 'NYT'),
        title: article.title,
        description: article.abstract || '',
        content: article.abstract || '',
        imageUrl: article.multimedia?.[0]?.url || '',
        source: 'New York Times',
        author: article.byline || 'NYT Staff',
        publishedAt: new Date(article.published_date),
        url: article.url,
        category: mapNYTSection(article.section)
      }));
    } catch (error) {
      logger.error('Failed to fetch from NYT', error);
      return [];
    }
  },

  /**
   * Save articles to database with AI processing
   */
  saveArticles: async (articles) => {
    try {
      let savedCount = 0;

      for (const article of articles) {
        if (!article.title || !article.url) continue;

        // Check if article already exists
        const existing = await News.findOne({ url: article.url });
        if (existing) {
          // Track deltas for existing articles
          await trackDeltas(existing, article);
          continue;
        }

        // Generate AI content
        logger.info(`🤖 Generating AI content for: ${article.title.substring(0, 50)}...`);
        logger.info(`   Using: ${huggingFaceService.isEnabled() ? 'HuggingFace API (Free)' : 'Fallback/Simulation'}`);

        const [summary, whyThisMatters, mood] = await Promise.all([
          gemmaApiService.generateSummary(article.title, article.content),
          gemmaApiService.generateWhyThisMatters(article.title, article.content),
          gemmaApiService.classifyMood(article.title, article.content)
        ]);

        logger.info(`✅ AI content generated for: ${article.title.substring(0, 30)}...`);
        logger.debug(`   Summary: ${summary ? summary.substring(0, 50) + '...' : 'Failed'}`);

        // Create new article
        const newsItem = new News({
          title: article.title,
          description: article.description,
          content: article.content,
          url: article.url,
          imageUrl: article.imageUrl,
          source: article.source,
          author: article.author,
          publishedAt: article.publishedAt,
          category: article.category,
          summary,
          whyThisMatters,
          mood,
          aiProcessed: true,
          processedAt: new Date(),
          previousVersionHash: crypto.createHash('md5').update(article.content || '').digest('hex')
        });

        await newsItem.save();
        savedCount++;

        logger.debug(`Saved article: ${article.title.substring(0, 50)}...`);
      }

      logger.info(`Saved ${savedCount} new articles`);
      return savedCount;
    } catch (error) {
      logger.error('Failed to save articles', error);
      throw error;
    }
  }
};

/**
 * Track content changes for "What changed since yesterday" feature
 */
async function trackDeltas(existingArticle, newArticle) {
  const newContentHash = crypto.createHash('md5').update(newArticle.content || '').digest('hex');

  if (existingArticle.previousVersionHash !== newContentHash) {
    // Content changed - detect what's different
    const changes = detectChanges(existingArticle.content, newArticle.content);

    if (changes.length > 0) {
      existingArticle.deltas.push({
        date: new Date(),
        changes: changes.slice(0, 3) // Max 3 changes
      });

      // Keep only last 5 delta entries
      if (existingArticle.deltas.length > 5) {
        existingArticle.deltas = existingArticle.deltas.slice(-5);
      }

      existingArticle.previousVersionHash = newContentHash;
      existingArticle.content = newArticle.content;
      await existingArticle.save();

      logger.debug(`Tracked ${changes.length} changes for: ${existingArticle.title.substring(0, 30)}...`);
    }
  }
}

/**
 * Simple text diff for change detection (no heavy AI)
 */
function detectChanges(oldContent, newContent) {
  if (!oldContent || !newContent) return [];

  const changes = [];

  // Split into sentences
  const oldSentences = new Set(oldContent.split(/[.!?]+/).map(s => s.trim().toLowerCase()));
  const newSentences = newContent.split(/[.!?]+/).map(s => s.trim());

  // Find new sentences
  for (const sentence of newSentences) {
    if (sentence.length > 20 && !oldSentences.has(sentence.toLowerCase())) {
      changes.push(`New: ${sentence.substring(0, 100)}...`);
    }
    if (changes.length >= 3) break;
  }

  return changes;
}

/**
 * Map NYT sections to our categories
 */
function mapNYTSection(section) {
  const mapping = {
    'business': 'business',
    'technology': 'technology',
    'science': 'science',
    'health': 'health',
    'sports': 'sports',
    'arts': 'entertainment',
    'movies': 'entertainment',
    'theater': 'entertainment',
    'style': 'entertainment'
  };
  return mapping[section?.toLowerCase()] || 'general';
}

/**
 * Generate mock articles for development
 */
function generateMockArticles() {
  const mockArticles = [
    {
      id: 'mock-1',
      title: 'Technology Giants Report Strong Quarterly Earnings',
      description: 'Major tech companies exceed Wall Street expectations with impressive revenue growth.',
      content: 'Leading technology companies have reported their quarterly earnings, surpassing analyst expectations. The strong performance was driven by increased cloud computing demand and digital advertising revenue. Investors responded positively to the news.',
      imageUrl: 'https://via.placeholder.com/800x400?text=Tech+News',
      source: 'Mock News',
      author: 'Development Team',
      publishedAt: new Date(),
      url: 'https://example.com/mock-1',
      category: 'technology'
    },
    {
      id: 'mock-2',
      title: 'Global Climate Summit Reaches Historic Agreement',
      description: 'World leaders commit to ambitious new targets for reducing carbon emissions.',
      content: 'After weeks of negotiations, representatives from over 190 countries have agreed on new climate targets. The agreement includes commitments to reduce emissions by 50% by 2030 and achieve carbon neutrality by 2050.',
      imageUrl: 'https://via.placeholder.com/800x400?text=Climate+News',
      source: 'Mock News',
      author: 'Development Team',
      publishedAt: new Date(Date.now() - 3600000),
      url: 'https://example.com/mock-2',
      category: 'science'
    },
    {
      id: 'mock-3',
      title: 'Healthcare Innovation: New Treatment Shows Promise',
      description: 'Researchers announce breakthrough in treatment for chronic conditions.',
      content: 'A team of medical researchers has developed a new treatment approach that shows significant promise in early trials. The treatment could benefit millions of patients worldwide suffering from chronic conditions.',
      imageUrl: 'https://via.placeholder.com/800x400?text=Health+News',
      source: 'Mock News',
      author: 'Development Team',
      publishedAt: new Date(Date.now() - 7200000),
      url: 'https://example.com/mock-3',
      category: 'health'
    }
  ];

  logger.info('Generated mock articles for development');
  return mockArticles;
}

module.exports = newsFetchService;
