const express = require('express');
const router = express.Router();
const Trader = require('../models/Trader');

// সব ট্রেডারদের ডাটা গেট করা
router.get('/all', async (req, res) => {
  try {
    const traders = await Trader.find().sort({ roi: -1 });
    res.json(traders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// নতুন ট্রেডার অ্যাড করা (Admin Only logic পরে যোগ করতে পারেন)
router.post('/add', async (req, res) => {
  const trader = new Trader(req.body);
  try {
    const newTrader = await trader.save();
    res.status(201).json(newTrader);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;