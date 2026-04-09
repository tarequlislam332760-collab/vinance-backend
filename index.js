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
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"],
  credentials: true
}));
app.use(express.json());

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log("✅ DB Connected Successfully"))
  .catch(err => console.error("❌ DB Connection Error:", err));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String, role: { type: String, default: "user" }, balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, experience: Number, capital: Number, profitShare: { type: Number, default: 30 }, status: { type: String, default: "pending" }
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
  else res.status(403).json({ success: false, message: "Admin Only" });
};

/* ================= USER ROUTES (SPOT, FUTURE, INVEST) ================= */

// ১. স্পট ও ফিউচার ট্রেড (সাকসেস মেসেজ সহ)
app.post("/api/trade", auth, async (req, res) => {
  const { amount, symbol, type } = req.body;
  const user = await User.findById(req.user.id);
  if (user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });
  user.balance -= Number(amount);
  await user.save();
  await Transaction.create({ userId: user._id, type: "spot", amount, method: `${symbol} (${type})`, status: "approved" });
  res.json({ success: true, message: "Spot Order Placed Successfully!", newBalance: user.balance });
});

app.post("/api/futures/trade", auth, async (req, res) => {
  const { amount, symbol, leverage, type } = req.body;
  const user = await User.findById(req.user.id);
  if (user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });
  user.balance -= Number(amount);
  await user.save();
  await Transaction.create({ userId: user._id, type: "futures", amount, method: `${symbol} ${leverage}x (${type})`, status: "approved" });
  res.json({ success: true, message: "Future Trade Executed Successfully!", newBalance: user.balance });
});

// ২. ইনভেস্টমেন্ট ও ডিপোজিট
app.post("/api/invest", auth, async (req, res) => {
  const { amount, planId, planName } = req.body;
  const user = await User.findById(req.user.id);
  if (user.balance < amount) return res.status(400).json({ message: "Low Balance" });
  user.balance -= Number(amount);
  await user.save();
  await Transaction.create({ userId: user._id, type: "investment", amount, method: planName, status: "approved" });
  res.json({ success: true, message: "Investment Successful!" });
});

app.post("/api/deposit", auth, async (req, res) => {
  await Transaction.create({ userId: req.user.id, type: "deposit", ...req.body });
  res.json({ success: true, message: "Deposit request submitted!" });
});

// ৩. লগস ও প্রোফাইল
app.get("/api/transactions", auth, async (req, res) => {
  const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(logs);
});

app.get("/api/my-investments", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id, type: "investment" });
  res.json(data);
});

/* ================= ADMIN ACTIONS (সব ফিক্সড) ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch { res.status(500).json({ success: false }); }
});

app.put("/api/admin/update-trader/:id", auth, adminAuth, async (req, res) => {
  await Trader.findByIdAndUpdate(req.params.id, req.body);
  res.json({ success: true, message: "Trader Profile Updated!" });
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  await Trader.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: "Trader Deleted Successfully" });
});

/* ================= AUTH & SYSTEM ================= */
app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ success: false });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ success: true, token, user });
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

app.get("/", (req, res) => res.send("🚀 Vinance API Live"));

// Vercel-এর জন্য এক্সপোর্ট
export default app;