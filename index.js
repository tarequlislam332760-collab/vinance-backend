import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({
  origin: [
    "https://vinance-frontend-vjqa.vercel.app", 
    "https://vinance-frontend.vercel.app", 
    "https://vinance-frontend.app", 
    "http://localhost:5173",
    /\.vercel\.app$/ 
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

/* ================= DATABASE CONNECTION ================= */
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log("✅ DB Connected Successfully"))
  .catch(err => console.error("❌ DB Connection Error:", err));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true }, 
  email: { type: String, unique: true, required: true }, 
  password: { type: String, required: true }, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, enum: ["deposit", "withdraw", "investment", "sell", "buy", "futures", "copy_trade"] },
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, experience: Number, capital: Number, status: { type: String, default: "pending" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Access Denied" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Session Expired" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= ROUTES ================= */

// ১. লগইন
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ success: false, message: "Login Error" }); }
});

// ২. ট্রেডার তৈরি (Become a Lead ফিক্স)
app.post("/api/traders", auth, async (req, res) => {
  try {
    const { name, experience, capital } = req.body;
    await Trader.create({ userId: req.user.id, name, experience: Number(experience), capital: Number(capital) });
    res.status(201).json({ success: true, message: "Trader Application Submitted Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to create trader" }); }
});

// ৩. ফিউচার ট্রেড (Future.jsx ফিক্স)
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage } = req.body;
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);
    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Insufficient Balance" });
    
    user.balance -= numAmount;
    await user.save();
    
    await Transaction.create({ 
      userId: user._id, type: "futures", amount: numAmount, status: "approved", method: `${symbol} ${leverage}x` 
    });
    
    res.json({ success: true, message: "Trade Successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Trade failed" }); }
});

// ৪. ট্রানজেকশন লগস (যাতে Portfolio/Logs খালি না দেখায়)
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data); 
  } catch (err) { res.status(500).json([]); }
});

// ৫. প্ল্যানস ফেচ
app.get("/api/plans", async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch (err) { res.status(500).json({ success: false, message: "Failed" }); }
});

/* ================= ADMIN ACTIONS ================= */
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json({ success: true, users, requests, traders });
  } catch (err) { res.status(500).json({ success: false, message: "Admin Error" }); }
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body; 
    const trx = await Transaction.findById(id);
    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true, message: "Action Successful!" });
  } catch (err) { res.status(500).json({ success: false, message: "Action failed" }); }
});

/* ================= START SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API is Live!"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));