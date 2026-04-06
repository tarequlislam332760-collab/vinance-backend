const express = require('express');
const router = express.Router();
const Trader = require('../models/Trader'); // নিশ্চিত করুন আপনার মডেলের পাথ ঠিক আছে
const { auth, admin } = require('../middleware/auth'); // এডমিন ভেরিফিকেশন মিডলওয়্যার

// ✅ নতুন ট্রেডার তৈরি করার রাউট (POST)
router.post('/create-trader', auth, admin, async (req, res) => {
  try {
    // ফ্রন্টএন্ড থেকে আসা ডাটা রিসিভ করা হচ্ছে
    const { 
      name, 
      avatar, 
      roi, 
      pnl, 
      aum, 
      days, 
      followers, 
      maxFollowers, 
      isApiEnabled, 
      chartData 
    } = req.body;

    // নতুন ট্রেডার অবজেক্ট তৈরি
    const newTrader = new Trader({
      name,
      avatar,
      roi,
      pnl,
      aum,
      days,
      followers,
      maxFollowers,
      isApiEnabled,
      chartData
    });

    // ডাটাবেজে সেভ করা
    await newTrader.save();
    
    res.status(201).json({ 
      success: true,
      message: "Trader created successfully", 
      trader: newTrader 
    });

  } catch (err) {
    console.error("Trader Creation Error:", err);
    res.status(500).json({ 
      success: false,
      message: "Server error while creating trader",
      error: err.message 
    });
  }
});

// ✅ সব ট্রেডার দেখার রাউট (ঐচ্ছিক - ফ্রন্টএন্ডে লিস্ট দেখানোর জন্য)
router.get('/all-traders', async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json(traders);
  } catch (err) {
    res.status(500).json({ message: "Error fetching traders" });
  }
});

module.exports = router;