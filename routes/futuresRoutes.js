const express = require('express');
const router = express.Router();
const { placeFuturesTrade } = require('../controllers/futuresController');
const { protect } = require('../middleware/authMiddleware'); // আপনার টোকেন ভেরিফাই করার মিডলওয়্যার

router.post('/trade', protect, placeFuturesTrade);

module.exports = router;