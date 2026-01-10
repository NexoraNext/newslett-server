const mongoose = require('mongoose');

const newsArticleSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: String,
  description: String,
  content: String,
  imageUrl: String,
  source: String,
  publishedAt: Date,
  url: String,
  summary: String,
  processedAt: Date
});

module.exports = mongoose.model('NewsArticle', newsArticleSchema);
