const mongoose = require('mongoose');

const investmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan', required: true },
  amount: { type: Number, required: true },
  profit: { type: Number, default: 0 },
  status: { type: String, enum: ['active', 'completed'], default: 'active' },
  expireAt: { type: Date, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Investment', investmentSchema);