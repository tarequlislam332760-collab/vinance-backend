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
  email: { type: String, unique: true, required: true, lowercase: true }, 
  password: { type: String, required: true }, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, // 'deposit', 'withdraw', 'spot', 'futures', 'investment'
  amount: Number, 
  symbol: String, 
  method: String, 
  transactionId: String, 
  status: { type: String, default: "pending" }, 
  details: String 
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

// --- AUTH ---
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword });
    res.json({ success: true, message: "Registration successful" });
  } catch (err) { res.status(500).json({ success: false }); }
});

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

// --- PROFILE ---
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- DEPOSIT & WITHDRAW (Fixes "Failed to submit") ---
app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({ userId: req.user.id, type: "deposit", amount, method, transactionId, status: "pending" });
    res.json({ success: true, message: "Deposit request submitted" });
  } catch (err) { res.status(500).json({ success: false, message: "Deposit failed" }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ success: false, message: "Insufficient balance" });

    user.balance -= Number(amount);
    await user.save();
    await Transaction.create({ userId: req.user.id, type: "withdraw", amount, method, details, status: "pending" });
    res.json({ success: true, message: "Withdrawal submitted" });
  } catch (err) { res.status(500).json({ success: false, message: "Withdrawal failed" }); }
});

// --- TRADING (Fixes "Buy Long" not working) ---
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage, side } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmt = Number(amount);

    if (!numAmt || numAmt <= 0) return res.status(400).json({ message: "Invalid amount" });
    if (user.balance < numAmt) return res.status(400).json({ message: "Check balance or network." });

    user.balance -= numAmt;
    await user.save();

    await Transaction.create({
      userId: user._id, type: "futures", amount: numAmt, symbol, status: "approved",
      details: `${side || 'Long'} trade with ${leverage || '1'}x leverage`
    });

    res.json({ success: true, message: "Trade Successful", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Trade failed" }); }
});

// --- TRADER APPLY (Fixes "Become a Lead" Error) ---
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const { experience, capital } = req.body;
    await Trader.create({ 
      userId: req.user.id, 
      name: (await User.findById(req.user.id)).name,
      experience, aum: capital, status: "approved",
      profit: "0%", winRate: "0%"
    });
    res.json({ success: true, message: "Application successful" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to apply" }); }
});

// --- LOGS & INVESTMENTS (Fixes "No investments found") ---
app.get("/api/my-investments", auth, async (req, res) => {
  try {
    const data = await Investment.find({ userId: req.user.id }).populate("planId");
    res.json(data);
  } catch (err) { res.status(500).json([]); }
});

app.get("/api/transactions", auth, async (req, res) => {
  try {
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json([]); }
});

app.get("/api/plans", async (req, res) => {
  try { res.json(await Plan.find({ status: true })); } catch (err) { res.status(500).json([]); }
});

// --- ADMIN API ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find();
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put("/api/admin/update-balance/:id", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { balance: req.body.balance });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.json({ success: true, plan });
  } catch (err) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

export default app;