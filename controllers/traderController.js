import mongoose from "mongoose";

// ট্রেডার মডেলটি ইম্পোর্ট করুন
const Trader = mongoose.models.Trader || mongoose.model("Trader");

// ১. সব ট্রেডারদের লিস্ট পাওয়ার জন্য
export const getAllTraders = async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.status(200).json(traders);
  } catch (error) {
    res.status(500).json({ message: "Error fetching traders", error: error.message });
  }
};

// ২. নতুন ট্রেডার তৈরি করার জন্য (সংশোধিত)
export const createTrader = async (req, res) => {
  try {
    // ফ্রন্টএন্ড থেকে আসা ডাটা (experience, capital) রিসিভ করা
    const { name, experience, capital, chartData } = req.body;

    // মডেলে যা আছে সেই অনুযায়ী ডাটা সাজানো
    const newTrader = await Trader.create({
      name: name || "New Trader",
      // আপনার মডেলে experience/capital না থাকলে এগুলো pnl বা roi তে ম্যাপ করতে পারেন 
      // অথবা মডেল ফাইলটি (Schema) আপডেট করে এই নামগুলো যোগ করে নিন
      pnl: Number(experience) || 0, 
      roi: Number(capital) || 0,
      chartData: chartData || [10, 20, 30],
      status: true
    });

    // সাকসেস মেসেজ পাঠানো (এটিই ফ্রন্টএন্ডে পপ-আপে আসবে)
    res.status(201).json({ 
      success: true, 
      message: "Application Submitted Successfully!", 
      data: newTrader 
    });

  } catch (error) {
    console.error("Backend Error:", error);
    res.status(500).json({ 
      success: false,
      message: "Failed to create trader", 
      error: error.message 
    });
  }
};