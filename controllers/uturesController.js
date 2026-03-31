const User = require('../models/User'); // আপনার ইউজার মডেল ইমপোর্ট করুন

exports.placeFuturesTrade = async (req, res) => {
    try {
        const { type, amount, leverage, symbol } = req.body;
        const user = await User.findById(req.user.id); // অথেন্টিকেশন থেকে ইউজার আইডি

        if (!user) return res.status(404).json({ message: "User not found" });

        // ব্যালেন্স চেক
        if (user.balance < amount) {
            return res.status(400).json({ message: "Insufficient balance!" });
        }

        // ব্যালেন্স আপডেট (টাকা কাটা)
        user.balance -= amount;
        await user.save();

        res.status(200).json({ 
            message: `${symbol} এ ${leverage}x লেভারেজে ${type.toUpperCase()} সফল হয়েছে!`,
            balance: user.balance 
        });
    } catch (err) {
        res.status(500).json({ message: "Server error" });
    }
};