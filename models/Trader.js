const mongoose = require('mongoose');

const traderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  avatar: { type: String },
  roi: { type: Number, default: 0 },
  pnl: { type: Number, default: 0 },
  aum: { type: Number, default: 0 },
  days: { type: Number, default: 0 },
  followers: { type: Number, default: 0 },
  maxFollowers: { type: Number, default: 300 },
  isApiEnabled: { type: Boolean, default: true },
  chartData: [Number],
  
  // ✅ এই নতুন ফিল্ডগুলো যোগ করা হলো যা আপনি ফ্রন্টএন্ড থেকে পাঠাচ্ছেন
  experience: { type: Number }, 
  capital: { type: Number },
  status: { type: String, default: 'pending' }, // আবেদনের অবস্থা: pending, approved, rejected
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' } // আবেদনকারী ইউজারের রেফারেন্স
}, { timestamps: true });

module.exports = mongoose.model('Trader', traderSchema);