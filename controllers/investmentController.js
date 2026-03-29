const Investment = require('../models/Investment');
const User = require('../models/User');
const Plan = require('../models/Plan');

exports.createInvestment = async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const userId = req.user.id; // আপনার Auth middleware থেকে পাওয়া

    const user = await User.findById(userId);
    const plan = await Plan.findById(planId);

    if (user.balance < amount) {
      return res.status(400).json({ message: "Insufficient Balance" });
    }

    // ইনভেস্টমেন্ট শেষ হওয়ার সময় নির্ধারণ
    const endDate = new Date();
    endDate.setHours(endDate.getHours() + plan.durationHours);

    const newInvestment = new Investment({
      userId,
      planId,
      amount,
      endDate
    });

    // ইউজারের মেইন ব্যালেন্স থেকে টাকা কাটা
    user.balance -= amount;
    
    await newInvestment.save();
    await user.save();

    res.status(201).json({ message: "Investment successful!", investment: newInvestment });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};