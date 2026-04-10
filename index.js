import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE FIX ================= */
// 1. CORS Fix: origin: true এবং credentials: true একসাথে ভেরসেলে সমস্যা করতে পারে। 
// এখানে আপনার ফ্রন্টএন্ডের লিস্ট দেওয়া সবচেয়ে নিরাপদ।
const allowedOrigins = [
  "https://vinance-frontend-vjqa.vercel.app",
  "https://vinance-frontend.vercel.app",
  "http://localhost:5173" // লোকাল টেস্টের জন্য
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(dbURI)
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

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, 
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

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  planName: String,
  amount: Number,
  profitPercent: Number,
  duration: Number,
  status: { type: String, default: "active" },
  returnDate: Date
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, img: String, profit: String, winRate: String, status: { type: String, default: "approved" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token Provided" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    res.status(401).json({ success: false, message: "Session Expired" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= ROUTES ================= */
app.get("/", (req, res) => res.send("🚀 Vinance Final API - V5 Fixed"));

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ success: false, message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase().trim(), password: hashedPassword });
    res.status(201).json({ success: true, message: "Registered!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json({ success: true, user });
});

// --- FINANCE ---
app.post("/api/deposit", auth, async (req, res) => {
  try {
    await Transaction.create({
      userId: req.user.id, type: "deposit", amount: Number(req.body.amount), 
      method: req.body.method, transactionId: req.body.transactionId, status: "pending"
    });
    res.json({ success: true, message: "Deposit Submitted!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.balance < Number(req.body.amount)) return res.status(400).json({ success: false, message: "Insufficient balance" });
    await Transaction.create({
      userId: req.user.id, type: "withdraw", amount: Number(req.body.amount), 
      method: req.body.method, transactionId: req.body.address, status: "pending"
    });
    res.json({ success: true, message: "Withdrawal request submitted!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- TRADE (Spot & Future Fix) ---
const handleTrade = async (req, res) => {
  try {
    const { amount, symbol, leverage, type } = req.body;
    const user = await User.findById(req.user.id);
    const numAmt = Number(amount);
    if (user.balance < numAmt) return res.status(400).json({ success: false, message: "Insufficient Balance" });

    user.balance -= numAmt;
    await user.save();
    await Transaction.create({
      userId: user._id, type: type || "trade", amount: numAmt, 
      symbol: symbol || "USDT", method: leverage ? `${leverage}x` : "Spot", status: "approved"
    });
    res.json({ success: true, message: "Trade successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
};

app.post("/api/trade", auth, handleTrade);
app.post("/api/futures/trade", auth, handleTrade);
app.post("/api/spot/trade", auth, handleTrade);

// --- INVESTMENT ---
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);
    if (user.balance < Number(amount)) return res.status(400).json({ success: false, message: "Insufficient balance" });

    user.balance -= Number(amount);
    await user.save();

    const returnDate = new Date();
    returnDate.setDate(returnDate.getDate() + plan.duration);

    await Investment.create({
      userId: user._id, planId: plan._id, planName: plan.name, amount: Number(amount),
      profitPercent: plan.profitPercent, duration: plan.duration, returnDate
    });
    res.json({ success: true, message: "Investment started!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/investments", auth, async (req, res) => {
  const data = await Investment.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json({ success: true, investments: data });
});

app.get("/api/transactions", auth, async (req, res) => {
  const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json({ success: true, transactions: logs });
});

app.get("/api/traders/all", async (req, res) => {
  const traders = await Trader.find({ status: "approved" }).sort({ createdAt: -1 });
  res.json({ success: true, traders });
});

app.get("/api/plans", async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json({ success: true, plans });
});

/* ================= ADMIN ACTIONS ================= */
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");
  const requests = await Transaction.find().populate("userId", "name email");
  const traders = await Trader.find();
  const plans = await Plan.find();
  const investments = await Investment.find().populate("userId", "name email");
  res.json({ success: true, users, requests, traders, plans, investments });
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body;
    const trx = await Transaction.findById(id);
    if (status === "approved") {
      if (trx.type === "deposit") {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      } else if (trx.type === "withdraw") {
        const user = await User.findById(trx.userId);
        if (user.balance >= trx.amount) {
          user.balance -= trx.amount;
          await user.save();
        }
      }
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true, message: `Request ${status}` });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.body.userId, { balance: Number(req.body.balance) });
  res.json({ success: true, message: "Updated" });
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  const plan = await Plan.create(req.body);
  res.json({ success: true, plan });
});

app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  const trader = await Trader.create(req.body);
  res.json({ success: true, trader });
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));

export default app;