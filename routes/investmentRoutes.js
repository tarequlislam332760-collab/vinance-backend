const express = require('express');
const router = express.Router();
const { createInvestment } = require('../controllers/investmentController');
const { protect } = require('../middleware/auth'); // আপনার প্রোজেক্টের Auth Middleware

// ইনভেস্টমেন্ট তৈরি করার রুট
router.post('/invest', protect, createInvestment);

module.exports = router;