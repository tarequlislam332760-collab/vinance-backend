const express = require('express');
const router = express.Router();
const User = require('../models/User'); 
const Transaction = require('../models/Transaction');
const auth = require('../middleware/auth'); // আপনার অথেন্টিকেশন মিডেলওয়্যার

// @route   POST /api/withdraw
// @desc    ইউজার উইথড্র রিকোয়েস্ট করলে ব্যালেন্স আপডেট এবং ট্রানজেকশন সেভ হবে
router.post('/withdraw', auth, async (req, res) => {
  try {
    const { amount, address } = req.body;
    const userId = req.user.id;

    // ১. ভ্যালিডেশন
    if (!amount || amount <= 0) return res.status(400).json({ message: "Invalid amount" });
    if (!address) return res.status(400).json({ message: "Wallet address is required" });

    // ২. ইউজার এবং ব্যালেন্স চেক
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance!" });
    }

    // ৩. ইউজারের মেইন ব্যালেন্স থেকে টাকা কাটা
    user.balance -= amount;
    await user.save();

    // ৪. ট্রানজেকশন রেকর্ড তৈরি (এটিই ওয়ালেট পেজে দেখাবে)
    const newTransaction = new Transaction({
      userId: user._id,
      type: 'withdraw',
      amount: amount,
      symbol: 'USDT',
      status: 'pending', // অ্যাডমিন অ্যাপ্রুভ করার আগ পর্যন্ত পেন্ডিং থাকবে
      date: new Date()
    });

    await newTransaction.save();

    // ৫. সাকসেস রেসপন্স
    res.status(200).json({
      message: "Withdrawal request submitted",
      newBalance: user.balance,
      transaction: newTransaction
    });

  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: "Server error" });
  }
});

// @route   GET /api/transactions
// @desc    ওয়ালেট পেজে সব ট্রানজেকশন দেখানোর জন্য
router.get('/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id }).sort({ date: -1 });
    res.json(transactions);
  } catch (err) {
    res.status(500).json({ message: "Error fetching history" });
  }
});

module.exports = router;