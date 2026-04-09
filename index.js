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
  .then(() => console.log("✅ DB Connected"))
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
  type: String, amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, email: String, experience: Number, capital: Number, status: { type: String, default: "pending" } 
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

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
  } catch (err) { res.status(401).json({ success: false, message: "Invalid Session" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= FIXED ROUTES ================= */

// ১. এডমিন পেনেল এবং প্রোফাইল ডাটা ফিক্স
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

// ২. ট্রেডার ম্যানেজমেন্ট (Become a Lead & Admin Edit/Delete)
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    await Trader.findOneAndDelete({ userId: req.user.id });
    await Trader.create({ userId: req.user.id, ...req.body, status: "pending" });
    res.json({ success: true, message: "Application Sent!" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to apply" }); }
});

app.post("/api/admin/update-trader", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndUpdate(req.body.traderId, { status: req.body.status });
    res.json({ success: true, message: "Updated!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ৩. ফিউচার ট্রেড সাকসেস মেসেজ ফিক্স
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol } = req.body;
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);
    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Insufficient Balance" });
    
    user.balance -= numAmount;
    await user.save();
    
    await Transaction.create({ 
      userId: user._id, type: "futures", amount: numAmount, status: "approved", 
      method: `${symbol || 'Market'} ${type || 'Trade'}` 
    });

    res.json({ success: true, message: "Trade Successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "ট্রেড সফল হয়নি" }); }
});

/* ================= EXISTING WORKING ROUTES (No Changes) ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().populate("userId", "name email").sort({ createdAt: -1 });
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.body.userId, { balance: Number(req.body.balance) });
    res.json({ success: true, message: "Balance Updated!" });
  } catch (err) { res.status(500).json({ success: false }); }
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
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.status(201).json({ success: true, message: "Plan Created!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Other existing routes (Deposit, Withdraw, Invest)
app.post("/api/deposit", auth, async (req, res) => {
  await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(req.body.amount), method: req.body.method, transactionId: req.body.transactionId });
  res.json({ success: true });
});

app.post("/api/withdraw", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (user.balance < req.body.amount) return res.status(400).json({ success: false });
  user.balance -= req.body.amount; await user.save();
  await Transaction.create({ userId: req.user.id, type: "withdraw", amount: req.body.amount, method: req.body.method, transactionId: req.body.address });
  res.json({ success: true });
});

app.get("/api/plans", async (req, res) => res.json(await Plan.find({ status: true })));

/* ================= START SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API Live & Fixed"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));