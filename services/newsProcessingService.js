// Simulated Gemma API service (replace with your actual implementation)
const gemmaApiService = {
  generateSummary: async (title, content) => {
    // Simulate summary generation
    return `${title}: ${content.substring(0, 100)}...`;
  }
};

exports.processWithGemma = async (newsArticles) => {
  console.log('[INFO] Processing articles with Gemma API...');
  const processedArticles = await Promise.all(
    newsArticles.map(async (article) => {
      try {
        const summary = await gemmaApiService.generateSummary(article.title, article.content || article.description);
        return {
          ...article,
          summary,
          processedAt: new Date()
        };
      } catch (error) {
        console.error(`[ERROR] Failed to process article "${article.title}":`, error.message);
        return {
          ...article,
          summary: article.description || 'Processing failed',
          processedAt: new Date()
        };
      }
    })
  );
  console.log(`[INFO] Processed ${processedArticles.length} articles`);
  return processedArticles;
};
