const FuturesTrade = require('../models/FuturesTrade');
const User = require('../models/User');
const axios = require('axios');

exports.placeFuturesTrade = async (req, res) => {
    try {
        const { symbol, type, amount, leverage, entryPrice } = req.body; // ফ্রন্টএন্ড থেকে entryPrice ও নিতে পারি
        const userId = req.user._id;

        // ১. ইউজারের ব্যালেন্স এবং ডেটা চেক
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: "ইউজার পাওয়া যায়নি (User not found)" });
        }
        
        const tradeAmount = parseFloat(amount);
        if (user.balance < tradeAmount) {
            return res.status(400).json({ message: "আপনার পর্যাপ্ত ব্যালেন্স নেই (Insufficient Balance)" });
        }

        // ২. প্রাইস লজিক (ফ্রন্টএন্ড থেকে না আসলে বাইনান্স থেকে নিবে)
        let finalEntryPrice = parseFloat(entryPrice);
        
        if (!finalEntryPrice) {
            const tradingSymbol = symbol.endsWith('USDT') ? symbol : `${symbol}USDT`;
            try {
                const priceRes = await axios.get(`https://api.binance.com/api/v3/ticker/price?symbol=${tradingSymbol.toUpperCase()}`, { timeout: 5000 });
                finalEntryPrice = parseFloat(priceRes.data.price);
            } catch (error) {
                return res.status(400).json({ message: "প্রাইস ডাটা আনা সম্ভব হয়নি (Price fetch failed)" });
            }
        }

        // ৩. ট্রেড ডাটাবেজে সেভ করা (আপনার মডেল অনুযায়ী)
        const newTrade = new FuturesTrade({
            user: userId,
            symbol: symbol.toUpperCase(),
            type: type.toLowerCase(), // 'buy' or 'sell'
            amount: tradeAmount,
            leverage: parseInt(leverage) || 20,
            entryPrice: finalEntryPrice,
            status: 'open'
        });

        await newTrade.save();

        // ৪. ইউজারের মেইন ব্যালেন্স আপডেট করা
        user.balance -= tradeAmount;
        await user.save();

        // ৫. (Optional) ট্রানজেকশন হিস্ট্রিতে রেকর্ড রাখা
        // যদি আপনার Transaction মডেল থাকে তবে এখানে একটি এন্ট্রি করতে পারেন।

        res.status(201).json({
            success: true,
            message: "Futures trade successful! 🚀",
            trade: newTrade,
            currentBalance: user.balance
        });

    } catch (err) {
        console.error("Futures Error:", err.response?.data || err.message);
        res.status(500).json({ 
            success: false,
            message: "সার্ভারে সমস্যা হয়েছে (Internal Server Error)", 
            error: err.message 
        });
    }
};