const mongoose = require('mongoose');

const futuresTradeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', 
        required: true
    },
    symbol: {
        type: String,
        required: true,
        uppercase: true 
    },
    type: {
        type: String,
        enum: ['buy', 'sell'], 
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    leverage: {
        type: Number,
        default: 1
    },
    entryPrice: {
        type: Number,
        required: true
    },
    // --- নতুন যোগ করা ফিল্ড ---
    tp: {
        type: Number, // Take Profit Price
        default: null
    },
    sl: {
        type: Number, // Stop Loss Price
        default: null
    },
    pnl: {
        type: Number, // Profit or Loss amount
        default: 0
    },
    // ------------------------
    status: {
        type: String,
        enum: ['open', 'closed'],
        default: 'open'
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('FuturesTrade', futuresTradeSchema);