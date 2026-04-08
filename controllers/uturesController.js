const FuturesTrade = require('../models/FuturesTrade');
const User = require('../models/User');

exports.placeFuturesTrade = async (req, res) => {
    try {
        const { symbol, type, amount, leverage, entryPrice } = req.body;
        const userId = req.user._id;

        // ১. ইউজারের ব্যালেন্স চেক করা
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ success: false, message: "ইউজার পাওয়া যায়নি" });
        }

        const tradeAmount = parseFloat(amount);
        if (user.balance < tradeAmount) {
            return res.status(400).json({ 
                success: false, 
                message: "আপনার পর্যাপ্ত ব্যালেন্স নেই (Insufficient Balance)" 
            });
        }

        // ২. প্রাইস ভেরিফিকেশন (ফ্রন্টএন্ড থেকে না আসলে ডিফল্ট ০)
        const finalPrice = entryPrice ? parseFloat(entryPrice) : 0;

        // ৩. ট্রেড ডাটাবেজে সেভ করা
        const newTrade = new FuturesTrade({
            user: userId,
            symbol: symbol.toUpperCase(),
            type: type, // 'buy' or 'sell'
            amount: tradeAmount,
            leverage: parseInt(leverage),
            entryPrice: finalPrice,
            status: 'open'
        });

        await newTrade.save();

        // ৪. ইউজারের মেইন ব্যালেন্স থেকে ট্রেড অ্যামাউন্ট কেটে নেওয়া
        user.balance -= tradeAmount;
        
        // ৫. ইউজারের পজিশন লিস্টে এটি যুক্ত করা (যদি আপনার User মডেলে positions এরে থাকে)
        if (user.positions) {
            user.positions.push(newTrade._id);
        }

        await user.save();

        // ৬. সফল রেসপন্স
        res.status(201).json({
            success: true,
            message: "Futures trade successful!",
            trade: newTrade,
            currentBalance: user.balance
        });

    } catch (err) {
        console.error("Futures Error:", err.message);
        res.status(500).json({ 
            success: false,
            message: "সার্ভারে সমস্যা হয়েছে (Internal Server Error)", 
            error: err.message 
        });
    }
};