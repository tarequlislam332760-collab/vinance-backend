// models/FuturesTrade.js
const mongoose = require('mongoose');

const futuresTradeSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User', // আপনার User মডেলের নাম যদি 'User' হয়
        required: true
    },
    symbol: {
        type: String,
        required: true,
        uppercase: true // যেমন: BTC, ETH
    },
    type: {
        type: String,
        enum: ['buy', 'sell'], // buy মানে Long, sell মানে Short
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