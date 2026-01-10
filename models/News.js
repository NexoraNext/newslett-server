const mongoose = require('mongoose');

/**
 * Enhanced News Schema
 * Optimized for ultra-short summaries and user interactions
 */
const NewsSchema = new mongoose.Schema({
  // Core content
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [500, 'Title cannot exceed 500 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
  },
  content: {
    type: String
  },

  // AI-generated content (cached permanently)
  summary: {
    type: String,
    maxlength: [300, 'Summary should be 50-120 words (~300 chars max)'],
    default: ''
  },
  whyThisMatters: {
    type: String,
    maxlength: [200, 'Why this matters should be one line'],
    default: ''
  },

  // Mood classification (for mood-based feed)
  mood: {
    type: String,
    enum: ['calm', 'neutral', 'serious'],
    default: 'neutral'
  },

  // Source information
  url: {
    type: String,
    required: [true, 'URL is required'],
    unique: true
  },
  imageUrl: {
    type: String,
    default: ''
  },
  source: {
    type: String,
    required: [true, 'Source is required'],
    trim: true
  },
  author: {
    type: String,
    default: 'Unknown'
  },

  // Categories
  category: {
    type: String,
    enum: ['general', 'business', 'entertainment', 'health', 'science', 'sports', 'technology'],
    default: 'general'
  },

  // Timestamps
  publishedAt: {
    type: Date,
    default: Date.now
  },

  // Voting system (aggregate counts)
  votes: {
    agree: { type: Number, default: 0 },
    disagree: { type: Number, default: 0 },
    unsure: { type: Number, default: 0 },
    total: { type: Number, default: 0 }
  },

  // Engagement metrics
  likesCount: {
    type: Number,
    default: 0
  },
  savesCount: {
    type: Number,
    default: 0
  },
  commentsCount: {
    type: Number,
    default: 0
  },

  // AI Q&A cache (one question per article)
  aiQuestion: {
    type: String,
    default: ''
  },
  aiAnswer: {
    type: String,
    default: ''
  },

  // Delta tracking for recurring topics
  deltas: [{
    date: { type: Date },
    changes: [{ type: String }]
  }],
  previousVersionHash: {
    type: String,
    default: ''
  },

  // Daily brief selection
  isDailyBrief: {
    type: Boolean,
    default: false
  },
  dailyBriefDate: {
    type: Date
  },

  // Processing status
  aiProcessed: {
    type: Boolean,
    default: false
  },
  processedAt: {
    type: Date
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for performance
NewsSchema.index({ publishedAt: -1 });
NewsSchema.index({ category: 1, publishedAt: -1 });
NewsSchema.index({ mood: 1, publishedAt: -1 });
NewsSchema.index({ isDailyBrief: 1, dailyBriefDate: -1 });
NewsSchema.index({ url: 1 }, { unique: true });

// Virtual for vote percentages
NewsSchema.virtual('votePercentages').get(function () {
  const total = this.votes.total || 1; // Avoid division by zero
  return {
    agree: Math.round((this.votes.agree / total) * 100),
    disagree: Math.round((this.votes.disagree / total) * 100),
    unsure: Math.round((this.votes.unsure / total) * 100)
  };
});

// Virtual for read time (based on summary length)
NewsSchema.virtual('readTimeSeconds').get(function () {
  const wordCount = (this.summary || this.description || '').split(/\s+/).length;
  // Average reading speed: 150 words per minute for audio
  return Math.ceil((wordCount / 150) * 60);
});

// Pre-save middleware to update total votes
NewsSchema.pre('save', function (next) {
  this.votes.total = this.votes.agree + this.votes.disagree + this.votes.unsure;
  next();
});

// Static method to get daily brief articles
NewsSchema.statics.getDailyBrief = async function (limit = 5) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // First try to get pre-selected daily brief articles
  let articles = await this.find({
    isDailyBrief: true,
    dailyBriefDate: { $gte: today }
  }).sort({ publishedAt: -1 }).limit(limit);

  // If no pre-selected, get top articles by engagement
  if (articles.length < limit) {
    articles = await this.find({
      publishedAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
    })
      .sort({
        likesCount: -1,
        'votes.total': -1,
        publishedAt: -1
      })
      .limit(limit);
  }

  return articles;
};

// Static method to get news by mood
NewsSchema.statics.getByMood = async function (mood, limit = 20) {
  return this.find({ mood })
    .sort({ publishedAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('News', NewsSchema);
