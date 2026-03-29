const mongoose = require('mongoose');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const Investment = require('../models/Investment');

exports.createInvestment = async (req, res) => {
    try {
        const { planId, amount, planName, durationHours } = req.body;
        const userId = req.user.id; 
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: "User not found" });

        if (user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });

        const endDate = new Date();
        endDate.setHours(endDate.getHours() + (durationHours || 24));

        const newInvestment = new Investment({
            userId, planId, planName: planName || 'Standard Plan', amount: parseFloat(amount), endDate
        });

        user.balance -= parseFloat(amount);
        const investmentTrx = new Transaction({
            userId, type: 'investment', amount: parseFloat(amount), method: planName || 'Investment Plan', status: 'completed'
        });

        await newInvestment.save();
        await user.save();
        await investmentTrx.save();

        res.status(201).json({ message: "Investment successful!", investment: newInvestment, newBalance: user.balance });
    } catch (error) { res.status(500).json({ error: error.message }); }
};

exports.getMyInvestments = async (req, res) => {
    try {
        const investments = await Investment.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.json(investments);
    } catch (error) { res.status(500).json({ message: "Failed to fetch investments" }); }
};

exports.getAllPlans = async (req, res) => { res.json({ message: "Plans list coming soon" }); };
exports.createPlanByAdmin = async (req, res) => { res.json({ message: "Plan created" }); };