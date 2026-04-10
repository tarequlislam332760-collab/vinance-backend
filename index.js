import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
// origin: true দেওয়ার ফলে যেকোনো ফ্রন্টএন্ড লিঙ্ক থেকে এটি কাজ করবে (মোবাইল ও পিসি সবার জন্য)
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
  type: String, // deposit, withdraw, trade, investment
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, img: String, profit: String, winRate: String, aum: String, mdd: String, status: { type: String, default: "approved" } 
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Login required" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Session expired, please login again" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin only!" });
};

/* ================= ROUTES ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API is Live and Running!"));

// AUTH
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword });
    res.status(201).json({ success: true, message: "Registered Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Server error" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false, message: "Login failed" }); }
});

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================= FINANCE ROUTES (DEPOSIT & WITHDRAW) ================= */

app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({
      userId: req.user.id,
      type: "deposit",
      amount: Number(amount),
      method,
      transactionId,
      status: "pending"
    });
    res.json({ success: true, message: "Deposit request submitted! Please wait for approval." });
  } catch (err) { res.status(500).json({ success: false, message: "Deposit failed" }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body;
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);

    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Insufficient balance" });

    user.balance -= numAmount;
    await user.save();

    await Transaction.create({
      userId: req.user.id,
      type: "withdraw",
      amount: numAmount,
      method,
      transactionId: address, // address field used as ID
      status: "pending"
    });

    res.json({ success: true, message: "Withdrawal request submitted!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Withdrawal failed" }); }
});

/* ================= TRADING ROUTES ================= */

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
      type: type || "futures", 
      amount: numAmount, 
      status: "approved", 
      method: `${symbol} ${leverage ? leverage + 'x' : ''}` 
    });

    res.json({ success: true, message: "Trade successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Trade failed!" }); }
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

/* ================= ADMIN ROUTES ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find();
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body; // status: approved or rejected
    const trx = await Transaction.findById(id);
    
    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    
    trx.status = status;
    await trx.save();
    res.json({ success: true, message: `Request ${status}` });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  try {
    const trader = await Trader.create(req.body);
    res.json({ success: true, message: "Trader Created!", trader });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true, message: "Plan Created!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

export default app;