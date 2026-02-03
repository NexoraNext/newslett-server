/**
 * HuggingFace Inference API Service
 * Uses HuggingFace's FREE API for ML models (0 GB local storage!)
 * 
 * BRAIN ARCHITECTURE ROLE: Heavy Lifting Layer
 * - BART → Summarization
 * - RoBERTa → Sentiment / Mood / Q&A
 * - MiniLM → Embeddings for similarity
 * 
 * Decision Making (Phi-2) and Translation (Qwen) are handled by
 * separate services to maintain isolation.
 * 
 * Free tier: ~30,000 requests/month, ~30 req/min per model
 * Models run on HuggingFace's GPUs = faster than local inference
 */

const axios = require('axios');
const { logger } = require('../middleware/logger');

const HF_API_KEY = process.env.HF_API_KEY;
const HF_BASE_URL = 'https://api-inference.huggingface.co/models';

// Heavy Lifting Models (all FREE tier compatible)
// Decision (Phi-2) and Translation (Qwen) are in separate services
const MODELS = {
  // Summarization - BART-CNN
  SUMMARIZATION: 'facebook/bart-large-cnn',           // 1.6 GB on HF GPU
  // Sentiment/Mood - RoBERTa
  SENTIMENT: 'cardiffnlp/twitter-roberta-base-sentiment', // 500 MB on HF GPU
  // Question Answering - RoBERTa-SQuAD
  QA: 'deepset/roberta-base-squad2',                  // 500 MB on HF GPU
  // Bias Detection - BART-MNLI (Zero-shot)
  BIAS: 'facebook/bart-large-mnli',                   // 1.6 GB on HF GPU
  // Embeddings - MiniLM (for similarity)
  EMBEDDINGS: 'sentence-transformers/all-MiniLM-L6-v2' // 90 MB on HF GPU
};

/**
 * Make API request to HuggingFace with retry logic
 */
async function callHuggingFaceAPI(model, payload, retries = 3) {
  if (!HF_API_KEY) {
    throw new Error('HuggingFace API key not configured');
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await axios.post(
        `${HF_BASE_URL}/${model}`,
        payload,
        {
          headers: {
            'Authorization': `Bearer ${HF_API_KEY}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      return response.data;
    } catch (error) {
      // Handle model loading (cold start)
      if (error.response?.status === 503) {
        const estimatedTime = error.response.data?.estimated_time || 20;
        logger.info(`⏳ Model ${model} is loading, waiting ${estimatedTime}s...`);
        await sleep(Math.min(estimatedTime * 1000, 30000));
        continue;
      }

      // Handle rate limiting
      if (error.response?.status === 429) {
        const waitTime = Math.pow(2, attempt) * 1000;
        logger.warn(`⚠️ Rate limited, retrying in ${waitTime / 1000}s...`);
        await sleep(waitTime);
        continue;
      }

      // Handle 410 Gone (model not available on free tier)
      if (error.response?.status === 410) {
        logger.warn(`⚠️ Model ${model} not available on free tier`);
        return null;
      }

      // Handle 401 Unauthorized (bad API key)
      if (error.response?.status === 401) {
        logger.error(`❌ Invalid HuggingFace API key`);
        throw error;
      }

      // Last attempt failed
      if (attempt === retries) {
        const errorDetail = error.response?.data?.error || error.response?.data || error.message;
        logger.error(`❌ HuggingFace API error for ${model}:`, errorDetail);
        return null; // Return null instead of throwing to allow fallbacks
      }
    }
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

const huggingFaceService = {
  /**
   * Check if HuggingFace API is enabled
   */
  isEnabled: () => {
    return process.env.USE_HUGGINGFACE_API === 'true' && !!HF_API_KEY;
  },

  /**
   * Generate summary using BART-CNN
   * Storage saved: 1.6 GB
   */
  generateSummary: async (title, content) => {
    try {
      const text = `${title}. ${content}`.substring(0, 1024); // BART max input

      const result = await callHuggingFaceAPI(MODELS.SUMMARIZATION, {
        inputs: text,
        parameters: {
          max_length: 150,
          min_length: 30,
          do_sample: false
        }
      });

      return result[0]?.summary_text || null;
    } catch (error) {
      logger.error('HuggingFace summarization failed:', error.message);
      return null;
    }
  },

  /**
   * Classify mood/sentiment using RoBERTa
   * Storage saved: 500 MB
   */
  classifyMood: async (text) => {
    try {
      const result = await callHuggingFaceAPI(MODELS.SENTIMENT, {
        inputs: text.substring(0, 512)
      });

      // Map RoBERTa sentiment labels to our mood system
      const topLabel = result[0]?.[0]?.label;
      const moodMap = {
        'LABEL_0': 'serious',  // negative
        'LABEL_1': 'neutral',  // neutral
        'LABEL_2': 'calm'      // positive
      };

      return moodMap[topLabel] || 'neutral';
    } catch (error) {
      logger.error('HuggingFace mood classification failed:', error.message);
      return null;
    }
  },

  /**
   * Answer question using RoBERTa Q&A
   * Storage saved: 500 MB
   */
  answerQuestion: async (context, question) => {
    try {
      const result = await callHuggingFaceAPI(MODELS.QA, {
        inputs: {
          question: question,
          context: context.substring(0, 1024)
        }
      });

      if (result.score > 0.1) {
        return result.answer;
      }
      return null;
    } catch (error) {
      logger.error('HuggingFace Q&A failed:', error.message);
      return null;
    }
  },

  /**
   * Detect bias using zero-shot classification
   * Storage saved: 1.6 GB
   */
  detectBias: async (text) => {
    try {
      const result = await callHuggingFaceAPI(MODELS.BIAS, {
        inputs: text.substring(0, 512),
        parameters: {
          candidate_labels: ['neutral', 'biased', 'one-sided', 'balanced']
        }
      });

      return {
        indicators: result.labels?.slice(0, 2) || ['neutral'],
        biasScore: result.scores ? (1.0 - result.scores[0]) : 0.0,
        topLabel: result.labels?.[0] || 'neutral'
      };
    } catch (error) {
      logger.error('HuggingFace bias detection failed:', error.message);
      return null;
    }
  },

  /**
   * Generate embeddings using MiniLM
   * Storage saved: 90 MB
   */
  getEmbeddings: async (text) => {
    try {
      const result = await callHuggingFaceAPI(MODELS.EMBEDDINGS, {
        inputs: text.substring(0, 512),
        options: { wait_for_model: true }
      });

      return result;
    } catch (error) {
      logger.error('HuggingFace embeddings failed:', error.message);
      return null;
    }
  },

  /**
   * Find similar articles using embeddings
   */
  findSimilar: async (query, candidates) => {
    try {
      const queryEmbedding = await huggingFaceService.getEmbeddings(query);
      if (!queryEmbedding) return null;

      // Compare with candidates
      let bestMatch = null;
      let bestScore = -1;

      for (const candidate of candidates.slice(0, 10)) {
        const candidateEmbedding = await huggingFaceService.getEmbeddings(candidate.text || candidate);
        if (candidateEmbedding) {
          const score = cosineSimilarity(queryEmbedding, candidateEmbedding);
          if (score > bestScore) {
            bestScore = score;
            bestMatch = candidate;
          }
        }
      }

      return {
        match: bestMatch,
        score: bestScore
      };
    } catch (error) {
      logger.error('HuggingFace similarity failed:', error.message);
      return null;
    }
  }
};

/**
 * Calculate cosine similarity between two vectors
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

module.exports = huggingFaceService;
