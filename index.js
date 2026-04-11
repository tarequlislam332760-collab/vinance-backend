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
  origin: true, 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(dbURI)
  .then(() => console.log("✅ Database Connected"))
  .catch(err => console.error("❌ Database Connection Error:", err));

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
  type: String, // deposit, withdraw, spot, futures
  amount: Number, symbol: String, method: String, transactionId: String, status: { type: String, default: "pending" }, details: String 
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, img: String, profit: String, winRate: String, aum: String, mdd: String, experience: String, status: { type: String, default: "approved" } 
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Session Expired" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= ROUTES ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API Live - All Fixes Applied"));

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- AUTH ---
app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Wrong details" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ TRADE LOGIC (Balance Update Fix) ---
const handleTrade = async (req, res) => {
  try {
    const { amount, symbol, leverage, type, side } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmt = Number(amount);

    if (!numAmt || numAmt <= 0) return res.status(400).json({ success: false, message: "সঠিক অ্যামাউন্ট দিন" });
    
    if (side?.toLowerCase() === "buy") {
       if (user.balance < numAmt) return res.status(400).json({ success: false, message: "ব্যালেন্স পর্যাপ্ত নয়" });
       user.balance -= numAmt;
    } else {
       user.balance += numAmt;
    }
    
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: leverage ? "futures" : "spot",
      amount: numAmt,
      symbol: symbol || "USDT",
      method: leverage ? `${leverage}x` : "Spot",
      status: "approved",
      details: `${side || 'Order'} ${type || 'Trade'} for ${symbol || 'Asset'}`
    });

    res.json({ success: true, message: "Trade Successful!", balance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Error updating balance" }); }
};

app.post("/api/futures/trade", auth, handleTrade);
app.post("/api/spot/trade", auth, handleTrade);
app.post("/api/trade", auth, handleTrade);

// --- ✅ DEPOSIT & WITHDRAW FIX ---
app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({
      userId: req.user.id,
      type: "deposit",
      amount: Number(amount),
      method,
      transactionId,
      status: "pending",
      details: "Deposit request submitted"
    });
    res.json({ success: true, message: "Request submitted" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Insufficient balance" });
    
    user.balance -= Number(amount);
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: "withdraw",
      amount: Number(amount),
      method,
      status: "pending",
      details: details || "Withdrawal request"
    });
    res.json({ success: true, message: "Withdrawal submitted" });
  } catch (err) { res.status(500).json({ success: false, message: "Withdrawal failed" }); }
});

// --- ✅ TRADER APPLY (Already Applied Fix) ---
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const existing = await Trader.findOne({ userId: req.user.id });
    if(existing) return res.status(200).json({ success: true, message: "ইতিমধ্যেই আবেদন করেছেন" });

    const user = await User.findById(req.user.id);
    await Trader.create({
      userId: user._id,
      name: user.name,
      experience: req.body.experience || "Expert",
      aum: `$${req.body.capital || req.body.aum || 0}`,
      status: "approved"
    });
    res.json({ success: true, message: "Trader Created" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to create trader" }); }
});

// --- LOGS ---
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json([]); }
});

// --- ADMIN ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find();
    res.json({ success: true, users, requests, traders });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put("/api/admin/update-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Updated" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find().sort({ createdAt: -1 })); } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API Active on Port ${PORT}`));

export default app;