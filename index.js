import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: "*", credentials: true }));
app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(dbURI)
  .then(() => console.log("✅ DB Connected Successfully"))
  .catch(err => console.error("❌ DB Error:", err));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true }, 
  email: { type: String, unique: true, required: true }, 
  password: { type: String, required: true }, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, // trade, deposit, withdraw, investment
  amount: Number, 
  method: String, 
  transactionId: String, 
  status: { type: String, default: "approved" }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, email: String, status: { type: String, default: "pending" } 
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Invalid Session" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= ROUTES ================= */

// ১. লগইন এবং ইউজার ডাটা
app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false }); }
});

// ২. ট্রেড এন্ডপয়েন্ট (ট্রেড না হওয়ার সমাধান)
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol } = req.body; // type = buy/sell/long/short
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });
    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "ব্যালেন্স পর্যাপ্ত নয়" });

    user.balance -= numAmount;
    await user.save();

    // ট্রানজেকশন সেভ করা (যাতে লগস-এ দেখা যায়)
    await Transaction.create({
      userId: user._id,
      type: "trade",
      amount: numAmount,
      status: "approved",
      method: `${symbol || 'BTC'} ${type || 'Market'}`
    });

    res.json({ success: true, message: "ট্রেড সফল হয়েছে!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "ট্রেড সফল হয়নি" }); }
});

// ৩. লগস পেইজ ফিক্স (Logs খালি থাকার সমাধান)
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json({ success: false, message: "Logs fetch failed" }); }
});

// ৪. ডিপোজিট ও উইথড্র
app.post("/api/deposit", auth, async (req, res) => {
  try {
    await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(req.body.amount), method: req.body.method, transactionId: req.body.transactionId, status: "pending" });
    res.json({ success: true, message: "আবেদন পাঠানো হয়েছে" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const amount = Number(req.body.amount);
    if (user.balance < amount) return res.status(400).json({ success: false, message: "ব্যালেন্স নেই" });
    user.balance -= amount; await user.save();
    await Transaction.create({ userId: req.user.id, type: "withdraw", amount, method: req.body.method, transactionId: req.body.address, status: "pending" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ৫. এডমিন পেনেল ডাটা
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const plans = await Plan.find();
    res.json({ success: true, users, requests, plans });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.body.userId, { balance: Number(req.body.balance) });
    res.json({ success: true, message: "Balance Updated!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================= START SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API Fixed & Running"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));