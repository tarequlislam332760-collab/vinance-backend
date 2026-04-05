import express from "express";
const router = express.Router();
// আপনার মডেল ফাইলের সঠিক পাথ অনুযায়ী ইম্পোর্ট করুন
import Trader from "../models/Trader.js"; 

// ১. সব ট্রেডারদের ডাটা গেট করা (URL: /api/traders/all)
router.get("/all", async (req, res) => {
  try {
    // আপনি যেহেতু roi অনুযায়ী সর্ট করতে চেয়েছেন, তাই সেটি রাখা হলো
    const traders = await Trader.find().sort({ roi: -1 });
    res.json(traders);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ২. নতুন ট্রেডার অ্যাড করা (URL: /api/traders/add)
router.post("/add", async (req, res) => {
  try {
    const trader = new Trader(req.body);
    const newTrader = await trader.save();
    res.status(201).json(newTrader);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

export default router;