const mongoose = require('mongoose');

/**
 * Story Model - Clustered articles from multiple sources
 * Represents a single story that may be covered by multiple news sources
 */
const StorySchema = new mongoose.Schema({
  // Canonical representation of the story
  canonicalTitle: {
    type: String,
    required: [true, 'Canonical title is required'],
    trim: true,
    maxlength: [500, 'Title cannot exceed 500 characters']
  },
  
  // AI-generated content
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
  
  // Importance scoring (replaces engagement metrics)
  importanceScore: {
    type: Number,
    default: 0,
    index: true
  },
  sourceCount: {
    type: Number,
    default: 1
  },
  sourceDiversity: {
    type: Number,
    default: 0,
    min: 0,
    max: 1
  },
  averageCredibility: {
    type: Number,
    default: 0.5,
    min: 0,
    max: 1
  },
  
  // Content classification
  contentType: {
    type: String,
    enum: ['NEWS', 'ANALYSIS', 'OPINION'],
    default: 'NEWS'
  },
  verificationLevel: {
    type: String,
    enum: ['VERIFIED', 'UNVERIFIED', 'DEVELOPING'],
    default: 'DEVELOPING'
  },
  mood: {
    type: String,
    enum: ['calm', 'neutral', 'serious'],
    default: 'neutral'
  },
  category: {
    type: String,
    enum: ['general', 'business', 'entertainment', 'health', 'science', 'sports', 'technology'],
    default: 'general'
  },
  
  // Primary image for the story
  imageUrl: {
    type: String,
    default: ''
  },
  
  // Timestamps
  firstSeen: {
    type: Date,
    default: Date.now
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  
  // Related stories for context timeline
  relatedStories: [{
    storyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
    relationship: { type: String, enum: ['PRECEDES', 'FOLLOWS', 'RELATED'] },
    addedAt: { type: Date, default: Date.now }
  }],
  
  // Context timeline entries
  timeline: [{
    date: { type: Date },
    description: { type: String },
    sourceStoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' }
  }],
  
  // AI processing status
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
StorySchema.index({ importanceScore: -1 });
StorySchema.index({ lastUpdated: -1 });
StorySchema.index({ category: 1, importanceScore: -1 });
StorySchema.index({ mood: 1, importanceScore: -1 });
StorySchema.index({ firstSeen: -1 });

// Virtual for read time estimation
StorySchema.virtual('readTimeSeconds').get(function() {
  const wordCount = (this.summary || '').split(/\s+/).length;
  return Math.ceil((wordCount / 150) * 60);
});

// Static method to get stories with calm ranking
StorySchema.statics.getWithCalmRanking = async function(options = {}) {
  const {
    limit = 20,
    page = 1,
    category,
    mood,
    maxAgeHours = 72
  } = options;
  
  const query = {};
  
  if (category && category !== 'general') {
    query.category = category;
  }
  
  if (mood) {
    query.mood = mood;
  }
  
  // Cap recency - only show stories from last X hours
  const cutoffDate = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
  query.firstSeen = { $gte: cutoffDate };
  
  const total = await this.countDocuments(query);
  
  const stories = await this.find(query)
    .sort({ importanceScore: -1, lastUpdated: -1 })
    .skip((page - 1) * limit)
    .limit(limit)
    .lean();
  
  return {
    stories,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasMore: page * limit < total
    }
  };
};

// Static method to recalculate importance score
StorySchema.statics.recalculateImportance = async function(storyId) {
  const story = await this.findById(storyId);
  if (!story) return null;
  
  // Importance factors (NO engagement metrics!)
  const sourceWeight = 0.30;
  const diversityWeight = 0.25;
  const credibilityWeight = 0.25;
  const recencyWeight = 0.20;
  
  // Calculate recency score (0-1, decays over 24 hours)
  const ageHours = (Date.now() - story.firstSeen) / (1000 * 60 * 60);
  const recencyScore = Math.max(0, 1 - (ageHours / 24));
  
  // Normalize source count (cap at 10 sources)
  const sourceScore = Math.min(story.sourceCount / 10, 1);
  
  const importanceScore = (
    sourceScore * sourceWeight +
    story.sourceDiversity * diversityWeight +
    story.averageCredibility * credibilityWeight +
    recencyScore * recencyWeight
  );
  
  story.importanceScore = importanceScore;
  await story.save();
  
  return story;
};

module.exports = mongoose.model('Story', StorySchema);
