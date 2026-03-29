const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');

// ইনভেস্টমেন্ট মডেলটি চেক করে নেওয়া হচ্ছে (না থাকলে তৈরি হবে)
const Investment = mongoose.models.Investment || mongoose.model('Investment', new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    planName: { type: String }, // প্ল্যানের নাম সেভ করার জন্য
    amount: { type: Number, required: true },
    status: { type: String, default: 'active' },
    endDate: { type: Date, required: true }
}, { timestamps: true }));

// ১. নতুন ইনভেস্টমেন্ট তৈরি
exports.createInvestment = async (req, res) => {
    try {
        const { planId, amount, planName, durationHours } = req.body;
        const userId = req.user.id; 

        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        // ব্যালেন্স চেক
        if (user.balance < amount) {
            return res.status(400).json({ message: "Insufficient Balance" });
        }

        // ইনভেস্টমেন্ট শেষ হওয়ার সময় নির্ধারণ (ডিফল্ট ২৪ ঘণ্টা)
        const hoursToAdd = durationHours || 24;
        const endDate = new Date();
        endDate.setHours(endDate.getHours() + hoursToAdd);

        const newInvestment = new Investment({
            userId,
            planId,
            planName: planName || 'Standard Plan',
            amount: parseFloat(amount),
            endDate
        });

        // ইউজারের ব্যালেন্স থেকে টাকা কাটা
        user.balance -= parseFloat(amount);
        
        // ট্রানজ্যাকশন হিস্ট্রিতে রেকর্ড রাখা
        const investmentTrx = new Transaction({
            userId,
            type: 'investment',
            amount: parseFloat(amount),
            method: planName || 'Investment Plan',
            status: 'completed'
        });

        // সব ডাটা সেভ
        await newInvestment.save();
        await user.save();
        await investmentTrx.save();

        res.status(201).json({ 
            message: "Investment successful!", 
            investment: newInvestment,
            newBalance: user.balance 
        });

    } catch (error) {
        res.status(500).json({ message: "Investment failed", error: error.message });
    }
};

// ২. ইউজারের নিজের ইনভেস্টমেন্ট লিস্ট দেখা
exports.getMyInvestments = async (req, res) => {
    try {
        const investments = await Investment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(investments);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch investments" });
    }
};