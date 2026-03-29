const express = require('express');
const router = express.Router();
const { createInvestment } = require('../controllers/investmentController');
const Plan = require('../models/Plan');
const { auth } = require('../middleware/auth'); // আপনার মিডলওয়্যার নাম অনুযায়ী পরিবর্তন করুন

router.get('/plans', async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/invest', auth, createInvestment);

module.exports = router;