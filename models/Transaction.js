const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['buy', 'sell'], required: true },
  symbol: { type: String, required: true },
  amount: { type: Number, required: true }, // এটি মূলত কত ডলারের ট্রেড
  priceAtTrade: { type: Number }, // ঐ সময়ের কয়েন প্রাইস
  status: { type: String, default: 'completed' },
  date: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Transaction', TransactionSchema);