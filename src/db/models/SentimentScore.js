import mongoose from "mongoose";
const schema = new mongoose.Schema({
  articleId: { type: mongoose.Schema.Types.ObjectId, ref: "NewsArticle" },
  symbol: String,
  model: String,
  gradedAt: { type: Date, default: Date.now },
  scores: {
    bullishness: Number, relevance: Number, catalyst_strength: Number, freshness_hours: Number, risk_flags: [String]
  },
  rationale: String
}, { timestamps: true });

export default mongoose.model("SentimentScore", schema);
