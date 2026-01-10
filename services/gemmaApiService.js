const axios = require('axios');
const { logger } = require('../middleware/logger');

/**
 * Gemma AI API Service
 * Handles all AI-related operations with caching and fallbacks
 */
const gemmaApiService = {
  /**
   * Generate ultra-short summary (50-120 words)
   */
  generateSummary: async (title, content) => {
    try {
      if (process.env.NODE_ENV === 'development' || !process.env.GEMMA3_API_ENDPOINT) {
        return generateSimulatedSummary(content);
      }

      const response = await axios.post(
        process.env.GEMMA3_API_ENDPOINT,
        {
          model: "gemma-3-7b-instruct",
          prompt: `Summarize this news article in 50-120 words. Be factual, neutral, no opinions. Title: ${title}. Content: ${content}`,
          max_tokens: 150,
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GEMMA3_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data.response;
    } catch (error) {
      logger.error("Error generating summary with Gemma", error);
      return generateSimulatedSummary(content);
    }
  },

  /**
   * Generate "Why this matters" one-liner
   */
  generateWhyThisMatters: async (title, content) => {
    try {
      if (process.env.NODE_ENV === 'development' || !process.env.GEMMA3_API_ENDPOINT) {
        return generateSimulatedWhyThisMatters(title);
      }

      const response = await axios.post(
        process.env.GEMMA3_API_ENDPOINT,
        {
          model: "gemma-3-7b-instruct",
          prompt: `In one short sentence (max 20 words), explain why this news matters to the average reader. Be neutral, factual. Title: ${title}. Content: ${content}`,
          max_tokens: 50,
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GEMMA3_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data.response;
    } catch (error) {
      logger.error("Error generating why this matters", error);
      return generateSimulatedWhyThisMatters(title);
    }
  },

  /**
   * Classify article mood (calm/neutral/serious)
   */
  classifyMood: async (title, content) => {
    try {
      // Deterministic classification based on keywords (no AI needed)
      const text = `${title} ${content}`.toLowerCase();

      const seriousKeywords = ['death', 'killed', 'war', 'crisis', 'emergency', 'attack', 'disaster', 'terror', 'violence', 'shooting', 'explosion', 'crash'];
      const calmKeywords = ['discovery', 'success', 'celebration', 'breakthrough', 'achievement', 'award', 'innovation', 'happy', 'joy', 'peace', 'milestone'];

      const seriousScore = seriousKeywords.filter(kw => text.includes(kw)).length;
      const calmScore = calmKeywords.filter(kw => text.includes(kw)).length;

      if (seriousScore > calmScore) return 'serious';
      if (calmScore > seriousScore) return 'calm';
      return 'neutral';
    } catch (error) {
      logger.error("Error classifying mood", error);
      return 'neutral';
    }
  },

  /**
   * Answer a single question about an article (token-limited)
   */
  answerQuestion: async (title, content, question) => {
    try {
      if (process.env.NODE_ENV === 'development' || !process.env.GEMMA3_API_ENDPOINT) {
        return generateSimulatedAnswer(question, content);
      }

      const response = await axios.post(
        process.env.GEMMA3_API_ENDPOINT,
        {
          model: "gemma-3-7b-instruct",
          prompt: `Based on this news article, answer the following question in 2-3 sentences max. Be factual and concise.

Article Title: ${title}
Article Content: ${content}

Question: ${question}

Answer:`,
          max_tokens: 100,
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GEMMA3_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 15000
        }
      );

      return response.data.response;
    } catch (error) {
      logger.error("Error answering question with Gemma", error);
      return "I couldn't find a specific answer to that question in the article.";
    }
  },

  /**
   * Rewrite comment politely (improve tone only)
   */
  rewritePolitely: async (comment) => {
    try {
      if (process.env.NODE_ENV === 'development' || !process.env.GEMMA3_API_ENDPOINT) {
        return rewriteSimulated(comment);
      }

      const response = await axios.post(
        process.env.GEMMA3_API_ENDPOINT,
        {
          model: "gemma-3-7b-instruct",
          prompt: `Rewrite this comment to be more polite and constructive while keeping the same meaning. Only improve the tone, don't change the message. Keep similar length.

Original: "${comment}"

Polite version:`,
          max_tokens: 100,
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GEMMA3_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      return response.data.response.replace(/^["']|["']$/g, '').trim();
    } catch (error) {
      logger.error("Error rewriting comment", error);
      return comment; // Return original if rewrite fails
    }
  },

  /**
   * Verify article factual accuracy
   */
  verifyArticle: async (title, content) => {
    try {
      if (process.env.NODE_ENV === 'development') {
        return {
          isVerified: Math.random() > 0.1,
          analysis: "This article has been cross-referenced with established sources and appears to contain factually accurate information."
        };
      }

      const response = await axios.post(
        process.env.GEMMA3_API_ENDPOINT,
        {
          model: "gemma-3-7b-instruct",
          prompt: `Verify the factual accuracy of this news article. Provide brief analysis. Title: ${title}. Content: ${content}`,
          max_tokens: 200
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.GEMMA3_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const analysis = response.data.response;
      const isVerified = !analysis.toLowerCase().includes('incorrect') &&
        !analysis.toLowerCase().includes('misleading') &&
        !analysis.toLowerCase().includes('false');

      return { isVerified, analysis };
    } catch (error) {
      logger.error("Error verifying article", error);
      return {
        isVerified: false,
        analysis: "Verification could not be completed."
      };
    }
  }
};

// =====================
// SIMULATED RESPONSES
// =====================

function generateSimulatedSummary(content) {
  if (!content) return "No content available to summarize.";

  // Extract first 2 sentences for summary (50-120 words target)
  const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);

  if (sentences.length <= 2) {
    return content.substring(0, 300);
  }

  let summary = sentences.slice(0, 2).join('. ') + '.';

  // Trim to ~100 words if too long
  const words = summary.split(/\s+/);
  if (words.length > 120) {
    summary = words.slice(0, 100).join(' ') + '...';
  }

  return summary;
}

function generateSimulatedWhyThisMatters(title) {
  const templates = [
    `This development could impact how people ${getImpactArea(title)}.`,
    `Understanding this helps readers stay informed about ${getTopicArea(title)}.`,
    `This news affects discussions around ${getTopicArea(title)}.`,
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

function getImpactArea(title) {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('tech') || titleLower.includes('ai')) return 'use technology';
  if (titleLower.includes('health') || titleLower.includes('medical')) return 'approach healthcare decisions';
  if (titleLower.includes('economy') || titleLower.includes('market')) return 'manage their finances';
  if (titleLower.includes('climate') || titleLower.includes('environment')) return 'think about sustainability';
  return 'understand current events';
}

function getTopicArea(title) {
  const titleLower = title.toLowerCase();
  if (titleLower.includes('tech')) return 'technology trends';
  if (titleLower.includes('health')) return 'public health';
  if (titleLower.includes('economy')) return 'economic conditions';
  if (titleLower.includes('politics')) return 'political developments';
  return 'current affairs';
}

function generateSimulatedAnswer(question, content) {
  if (!content) return "I don't have enough information from the article to answer that.";

  // Simple keyword matching for simulated answers
  const questionLower = question.toLowerCase();
  const contentLower = content.toLowerCase();

  // Extract relevant sentence
  const sentences = content.split(/[.!?]+/);
  const relevantSentence = sentences.find(s => {
    const words = questionLower.split(/\s+/).filter(w => w.length > 3);
    return words.some(word => s.toLowerCase().includes(word));
  });

  if (relevantSentence) {
    return `Based on the article: ${relevantSentence.trim()}.`;
  }

  return "The article doesn't directly address this question, but provides related context that might be helpful.";
}

function rewriteSimulated(comment) {
  // Simple simulation: add polite prefix/suffix
  const politeStarters = [
    "I think that ",
    "In my view, ",
    "I believe ",
    "It seems to me that "
  ];

  // Remove aggressive words
  let polite = comment
    .replace(/\b(stupid|dumb|idiot|hate|terrible|awful)\b/gi, 'concerning')
    .replace(/!+/g, '.')
    .replace(/YOU'RE/gi, "this is")
    .replace(/YOU ARE/gi, "this seems");

  // Add polite starter if needed
  if (!polite.match(/^(I think|I believe|In my|Perhaps|Maybe)/i)) {
    const starter = politeStarters[Math.floor(Math.random() * politeStarters.length)];
    polite = starter + polite.charAt(0).toLowerCase() + polite.slice(1);
  }

  return polite;
}

module.exports = gemmaApiService;
