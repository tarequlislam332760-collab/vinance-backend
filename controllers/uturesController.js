const User = require('../models/User'); 
const FuturesTrade = require('../models/FuturesTrade'); // আপনার মডেলটি ইমপোর্ট করা হলো

exports.placeFuturesTrade = async (req, res) => {
    try {
        const { type, amount, leverage, symbol, entryPrice } = req.body;
        const user = await User.findById(req.user.id); 

        if (!user) return res.status(404).json({ message: "User not found" });

        // ব্যালেন্স চেক
        if (user.balance < amount) {
            return res.status(400).json({ message: "Insufficient balance!" });
        }

        // ১. ব্যালেন্স আপডেট (টাকা কাটা)
        user.balance -= amount;
        await user.save();

        // ২. ডাটাবেসে ট্রেড হিস্ট্রি সেভ করা (এটি আপনি মডেল দিলেও কন্ট্রোলারে ছিল না)
        const newTrade = new FuturesTrade({
            user: user._id,
            symbol: symbol,
            type: type,
            amount: amount,
            leverage: leverage,
            entryPrice: entryPrice || 0, // ফ্রন্টএন্ড থেকে পাঠানো প্রাইস
            status: 'open'
        });
        await newTrade.save();

        res.status(200).json({ 
            message: `${symbol} এ ${leverage}x লেভারেজে ${type.toUpperCase()} সফল হয়েছে!`,
            balance: user.balance,
            trade: newTrade
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
};