import mongoose from "mongoose";
const schema = new mongoose.Schema({
  symbol: String,
  source: String,
  url: { type: String, unique: true },
  headline: String,
  body: String,
  ts: Date,
  hash: { type: String, unique: true }
}, { timestamps: true });

export default mongoose.model("NewsArticle", schema);
