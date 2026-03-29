const mongoose = require('mongoose');

const planSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g., Gold Plan
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  profitPercent: { type: Number, required: true }, // e.g., 10%
  durationHours: { type: Number, required: true }, // e.g., 24
}, { timestamps: true });

module.exports = mongoose.model('Plan', planSchema);