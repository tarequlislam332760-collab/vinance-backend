const mongoose = require('mongoose');

const traderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  avatar: { type: String }, // প্রোফাইল পিকচার ইউআরএল
  roi: { type: Number, default: 0 }, // Return on Investment
  pnl: { type: Number, default: 0 }, // Profit and Loss
  aum: { type: Number, default: 0 }, // Assets Under Management
  days: { type: Number, default: 0 }, // Trading Days
  followers: { type: Number, default: 0 },
  maxFollowers: { type: Number, default: 300 },
  isApiEnabled: { type: Boolean, default: true },
  chartData: [Number] // গ্রাফের জন্য ছোট একটি অ্যারে [10, 15, 8, 20...]
}, { timestamps: true });

module.exports = mongoose.model('Trader', traderSchema); 