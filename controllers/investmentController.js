const mongoose = require('mongoose');
// আপনার index.js-এ মডেলগুলো যেভাবে আছে, সেখান থেকে সরাসরি অ্যাক্সেস করা হচ্ছে
const User = mongoose.models.User;
const Transaction = mongoose.models.Transaction;

// যদি আপনি আলাদা ফাইলে মডেল রেখে থাকেন তবে নিচের ২ লাইন আন-কমেন্ট করুন
// const Investment = require('../models/Investment');
// const Plan = require('../models/Plan');

// যদি ইনভেস্টমেন্ট মডেল index-এ না থাকে, তবে এখানে টেম্পোরারি স্কিমা ডিফাইন করা হলো
const Investment = mongoose.models.Investment || mongoose.model('Investment', new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
    amount: Number,
    status: { type: String, default: 'active' },
    endDate: Date
}, { timestamps: true }));

exports.createInvestment = async (req, res) => {
    try {
        const { planId, amount, planName } = req.body;
        const userId = req.user.id; 

        const user = await User.findById(userId);
        // যদি আপনার Plan মডেল আলাদা থাকে তবে এটি কাজ করবে
        // আপাতত আমরা ধরে নিচ্ছি ফ্রন্টএন্ড থেকে durationHours আসছে
        const durationHours = req.body.durationHours || 24; 

        if (user.balance < amount) {
            return res.status(400).json({ message: "Insufficient Balance" });
        }

        // ইনভেস্টমেন্ট শেষ হওয়ার সময় নির্ধারণ
        const endDate = new Date();
        endDate.setHours(endDate.getHours() + durationHours);

        const newInvestment = new Investment({
            userId,
            planId,
            amount: parseFloat(amount),
            endDate
        });

        // ১. ইউজারের মেইন ব্যালেন্স থেকে টাকা কাটা
        user.balance -= parseFloat(amount);
        
        // ২. ট্রানজ্যাকশন হিস্ট্রিতে একটি রেকর্ড রাখা (আপনার আগের লজিক অনুযায়ী)
        const investmentTrx = new Transaction({
            userId,
            type: 'investment',
            amount: parseFloat(amount),
            method: planName || 'Investment Plan',
            status: 'completed'
        });

        // ৩. সব ডাটা সেভ করা
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

// ইউজারের সব ইনভেস্টমেন্ট দেখার জন্য (My Investment Log)
exports.getMyInvestments = async (req, res) => {
    try {
        const investments = await Investment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(investments);
    } catch (error) {
        res.status(500).json({ message: "Failed to fetch investments" });
    }
};