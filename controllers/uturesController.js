const FuturesTrade = require('../models/FuturesTrade');
const User = require('../models/User');
const axios = require('axios');

exports.placeFuturesTrade = async (req, res) => {
    try {
        const { symbol, type, amount, leverage } = req.body;
        const userId = req.user._id;

        // ১. ইউজারের ব্যালেন্স চেক করা
        const user = await User.findById(userId);
        if (!user || user.balance < amount) {
            return res.status(400).json({ message: "আপনার পর্যাপ্ত ব্যালেন্স নেই (Insufficient Balance)" });
        }

        // ২. রিয়েল-টাইম প্রাইস আনা (Binance API থেকে)
        // symbol 'BTC' হলে 'BTCUSDT' ফরম্যাটে কনভার্ট করা
        const tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
        const priceRes = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${tradingSymbol.toUpperCase()}`);
        const currentPrice = parseFloat(priceRes.data.price);

        if (!currentPrice) {
            return res.status(400).json({ message: "প্রাইস ডাটা পাওয়া যায়নি (Price fetch failed)" });
        }

        // ৩. ট্রেড ডাটাবেজে সেভ করা
        const newTrade = new FuturesTrade({
            user: userId,
            symbol: symbol.toUpperCase(),
            type,
            amount: parseFloat(amount),
            leverage: parseInt(leverage),
            entryPrice: currentPrice, // এখন আর ৫০০ এরর আসবে না
            status: 'open'
        });

        await newTrade.save();

        // ৪. ইউজারের মেইন ব্যালেন্স থেকে ট্রেড অ্যামাউন্ট কেটে নেওয়া
        user.balance -= parseFloat(amount);
        await user.save();

        res.status(201).json({
            message: "Futures trade successful!",
            trade: newTrade,
            currentBalance: user.balance
        });

    } catch (err) {
        console.error("Futures Error:", err.response?.data || err.message);
        res.status(500).json({ 
            message: "সার্ভারে সমস্যা হয়েছে (Internal Server Error)", 
            error: err.message 
        });
    }
};