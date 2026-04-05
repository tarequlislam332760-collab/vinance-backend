import mongoose from "mongoose";

// ট্রেডার মডেলটি ইম্পোর্ট করুন (আপনার মডেল ফাইলের পাথ অনুযায়ী)
const Trader = mongoose.models.Trader || mongoose.model("Trader");

// ১. সব ট্রেডারদের লিস্ট পাওয়ার জন্য
export const getAllTraders = async (req, res) => {
  try {
    // এখানে কোনো ফিল্টার রাখা হয়নি যাতে সব ডাটা শো করে
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.status(200).json(traders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching traders", error: error.message });
  }
};

// ২. নতুন ট্রেডার তৈরি করার জন্য (Admin Only)
export const createTrader = async (req, res) => {
  try {
    const { name, image, profit, winRate } = req.body;
    const newTrader = await Trader.create({
      name,
      image,
      profit: Number(profit),
      winRate: Number(winRate),
      status: true
    });
    res.status(201).json({ success: true, data: newTrader });
  } catch (error) {
    res.status(500).json({ message: "Failed to create trader", error: error.message });
  }
};