import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
// মোবাইলে এবং বিভিন্ন ডিভাইসে অ্যাডমিন প্যানেল ও এপিআই এক্সেস নিশ্চিত করতে CORS আপডেট করা হয়েছে
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
  type: String, 
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
app.get("/", (req, res) => res.send("🚀 Vinance System Final API Live"));

// --- AUTH ---
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ success: false, message: "Email exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: normalizedEmail, password: hashedPassword });
    res.status(201).json({ success: true, message: "Success!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Wrong details" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ TRADER APPLICATION ---
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const { experience, capital } = req.body;
    const user = await User.findById(req.user.id);
    await Trader.create({
      userId: user._id,
      name: user.name,
      experience: experience,
      aum: `$${capital}`,
      profit: "0%", winRate: "0%", mdd: "0%",
      status: "approved"
    });
    res.json({ success: true, message: "Trader Application Submitted Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to apply" }); }
});

// --- ✅ INVESTMENT ---
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const numAmt = Number(amount);
    if (user.balance < numAmt) return res.status(400).json({ success: false, message: "Insufficient balance" });

    user.balance -= numAmt;
    await user.save();

    await Investment.create({ userId: user._id, planId, amount: numAmt });
    await Transaction.create({
      userId: user._id,
      type: "investment",
      amount: numAmt,
      status: "approved",
      details: `Invested in plan`
    });

    res.json({ success: true, message: "Investment Successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Investment failed" }); }
});

// --- ✅ TRADE FIX (Spot Buy/Sell & Futures Success Message Fix) ---
const handleTrade = async (req, res) => {
  try {
    const { amount, symbol, leverage, type, side } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmt = Number(amount);

    if (!numAmt || numAmt <= 0) return res.status(400).json({ success: false, message: "অ্যামাউন্ট লিখুন" });
    if (user.balance < numAmt) return res.status(400).json({ success: false, message: "ব্যালেন্স পর্যাপ্ত নয়" });

    user.balance -= numAmt;
    await user.save();

    // Logs এ ডাটা সেভ করা - Spot এবং Futures উভয়ই আলাদা ভাবে সেভ হবে
    await Transaction.create({
      userId: user._id,
      type: type || "spot",
      amount: numAmt,
      symbol: symbol || "USDT",
      method: leverage ? `${leverage}x` : "Spot",
      status: "approved",
      details: `${side || 'Buy'} ${type || 'Trade'} order for ${symbol || 'BTC'}`
    });

    res.json({ success: true, message: "Trade Successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "ট্রেড ব্যর্থ হয়েছে" }); }
};

app.post("/api/futures/trade", auth, handleTrade);
app.post("/api/trade", auth, handleTrade);
app.post("/api/spot/trade", auth, handleTrade);

// --- ✅ LOGS PAGE FIX (Empty Page Fix) ---
app.get("/api/transactions", auth, async (req, res) => {
  try {
    // এখানে শুধু ডাটা না পাঠিয়ে একটি অবজেক্ট পাঠানো হচ্ছে যা ফ্রন্টএন্ড সহজে রিড করতে পারে
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json({ success: true, transactions: logs }); 
  } catch (err) { res.status(500).json({ success: false, transactions: [] }); }
});

// --- ✅ ADMIN PANEL (Mobile/PC Visibility Fix) ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- OTHERS ---
app.get("/api/plans", async (req, res) => {
  try { res.json(await Plan.find({ status: true })); } catch (err) { res.status(500).json([]); }
});

app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find().sort({ createdAt: -1 })); } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API Running on Port ${PORT}`));

export default app;