import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
// CORS ফিক্স: এটি সব ধরণের ডিভাইস (মোবাইল/পিসি) থেকে কানেকশন নিশ্চিত করবে
app.use(cors({
  origin: function (origin, callback) {
    // যেকোনো অরিজিন অ্যালাউ করা হয়েছে যাতে মোবাইল বা অ্যাপ থেকে ব্লক না হয়
    callback(null, true);
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
  type: { type: String }, // trade, buy, sell, deposit, withdraw
  amount: Number, 
  symbol: String, 
  method: String, 
  status: { type: String, default: "approved" },
  details: String 
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, img: String, profit: String, winRate: String, aum: String, mdd: String, status: { type: String, default: "approved" } 
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token Provided" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Session Expired" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= PUBLIC ROUTES ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API Live and Protected"));

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

/* ================= USER & PROFILE ROUTES ================= */

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false }); }
});

// প্রোফাইল আপডেট ফিক্স
app.put("/api/profile/update", auth, async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.user.id);
    if (name) user.name = name;
    if (email) user.email = email.toLowerCase().trim();
    await user.save();
    res.json({ success: true, message: "Profile Updated!", user: { name: user.name, email: user.email } });
  } catch (err) { res.status(500).json({ success: false, message: "Update failed" }); }
});

/* ================= TRADE / BUY / SELL ================= */

app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage, type } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);

    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Insufficient Balance" });

    user.balance -= numAmount;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: type || "trade",
      amount: numAmount,
      symbol: symbol || "USDT",
      method: leverage ? `${leverage}x` : "Spot",
      details: `${type || 'Order'} for ${symbol}`,
      status: "approved"
    });

    res.json({ success: true, message: "Order successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Trade error" }); }
});

app.get("/api/transactions", auth, async (req, res) => {
  try {
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json([]); }
});

app.get("/api/plans", async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch (err) { res.status(500).json([]); }
});

app.get("/api/traders/all", async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json(traders);
  } catch (err) { res.status(500).json([]); }
});

/* ================= ADMIN ROUTES (অ্যাডমিন প্যানেল ফিক্স) ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to fetch data" }); }
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
    res.json({ success: true, message: "Request updated" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true, message: "Balance updated" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  try {
    const trader = await Trader.create(req.body);
    res.json({ success: true, message: "Trader Created!", trader });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API on Port ${PORT}`));

export default app;