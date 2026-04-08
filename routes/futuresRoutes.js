const express = require('express');
const router = express.Router();
const { placeFuturesTrade } = require('../controllers/futuresController');
const { protect } = require('../middleware/authMiddleware');

// @route   POST /api/futures/trade
// @desc    Place a new futures trade
// @access  Private
router.post('/trade', protect, placeFuturesTrade);

module.exports = router;