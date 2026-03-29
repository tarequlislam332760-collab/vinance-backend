const User = require('../models/User');
const Plan = require('../models/Plan');
const Investment = require('../models/Investment');

exports.createInvestment = async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);

    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (amount < plan.minAmount || amount > plan.maxAmount) {
      return res.status(400).json({ message: "Invalid amount" });
    }
    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }

    user.balance -= amount;
    await user.save();

    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + plan.duration);

    const newInvestment = new Investment({
      userId: user._id,
      planId: plan._id,
      amount,
      expireAt
    });

    await newInvestment.save();
    res.status(201).json({ message: "Investment successful", investment: newInvestment });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};