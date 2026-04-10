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
  balance: { type: Number, default: 0 },
  image: { type: String, default: "" }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, // 'deposit', 'withdraw', 'spot', 'futures'
  amount: Number, 
  symbol: String, 
  method: String, 
  status: { type: String, default: "pending" }, 
  details: String 
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, img: String, profit: { type: String, default: "0%" }, winRate: { type: String, default: "0%" }, 
  aum: { type: String, default: "$0" }, mdd: { type: String, default: "0%" }, 
  experience: String, status: { type: String, default: "approved" } 
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

app.get("/", (req, res) => res.send("🚀 Vinance API System Online"));

// --- ✅ AUTH & PROFILE ---
app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/user/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ DEPOSIT & WITHDRAW ---
app.post("/api/transaction/request", auth, async (req, res) => {
  try {
    const { amount, type, method, details } = req.body;
    const transaction = await Transaction.create({
      userId: req.user.id,
      amount: Number(amount),
      type: type, // 'deposit' or 'withdraw'
      method: method,
      details: details,
      status: "pending"
    });
    res.json({ success: true, message: "Request Submitted!", transaction });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ TRADE FIX (SPOT/FUTURES) ---
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, side, type } = req.body;
    const user = await User.findById(req.user.id);
    const numAmt = Number(amount);

    if (user.balance < numAmt) return res.status(400).json({ success: false, message: "Low Balance" });

    user.balance -= numAmt;
    await user.save();

    const trade = await Transaction.create({
      userId: user._id,
      type: type || "spot",
      amount: numAmt,
      symbol: symbol,
      status: "approved",
      details: `${side?.toUpperCase()} Order - ${symbol}`
    });

    res.json({ success: true, message: "Trade Successful", newBalance: user.balance, trade });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ LOGS & PLANS ---
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, data }); // ফ্রন্টএন্ডে data.data হিসেবে ম্যাপ করা যাবে
  } catch (err) { res.status(500).json({ success: false, data: [] }); }
});

app.get("/api/plans", async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json({ success: true, data: plans });
  } catch (err) { res.status(500).json({ success: false, data: [] }); }
});

// --- ✅ ADMIN TRADER MANAGEMENT ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const transactions = await Transaction.find().populate("userId", "name email");
    const traders = await Trader.find();
    const plans = await Plan.find();
    res.json({ success: true, users, transactions, traders, plans });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put("/api/admin/update-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Updated!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find().sort({ createdAt: -1 })); } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API Running on ${PORT}`));

export default app;