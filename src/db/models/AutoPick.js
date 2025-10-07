import mongoose from "mongoose";
const schema = new mongoose.Schema({
  date: { type: String, index: true },
  runType: { type: String, enum: ["preopen","midday","eod"] },
  symbol: { type: String, index: true },
  totalScore: Number,
  breakdown: {
    sentiment: Number, catalyst: Number, momentum: Number, liquidity: Number, fundamentals: Number
  },
  inputs: {
    topFactors: [String],
    articles: [{ articleId: String, url: String, headline: String }]
  },
  tieBreakers: [String],
  decidedAt: { type: Date, default: Date.now }
}, { timestamps: true });

export default mongoose.model("AutoPick", schema);
