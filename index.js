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
const connectDB = async () => {
  try {
    if (mongoose.connection.readyState >= 1) return;
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("✅ DB Connected");
  } catch (err) {
    console.error("❌ DB Connection Error:", err);
  }
};
connectDB();

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

/* ================= ALL ROUTES (FIXED) ================= */

// ১. ট্রেডার অ্যাপ্লিকেশন ও ভিউ
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const exists = await Trader.findOne({ userId: req.user.id });
    if (exists) return res.status(400).json({ success: false, message: "Already applied" });
    await Trader.create({ userId: req.user.id, ...req.body });
    res.json({ success: true, message: "Application Submitted!" });
  } catch { res.status(500).json({ success: false, message: "Failed to create trader" }); }
});

app.get("/api/traders/all", async (req, res) => {
  try {
    const traders = await Trader.find({ status: "approved" }).sort({ createdAt: -1 });
    res.json(traders);
  } catch { res.status(500).json([]); }
});

// ২. ডিপোজিট, উইথড্র ও ব্যালেন্স
app.post("/api/deposit", auth, async (req, res) => {
  try {
    await Transaction.create({ userId: req.user.id, type: "deposit", status: "pending", ...req.body });
    res.json({ success: true, message: "Deposit Request Submitted!" });
  } catch { res.status(500).json({ success: false }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.balance < req.body.amount) return res.status(400).json({ message: "Insufficient Balance" });
    await Transaction.create({ userId: req.user.id, type: "withdraw", status: "pending", ...req.body });
    res.json({ success: true, message: "Withdrawal Requested!" });
  } catch { res.status(500).json({ success: false, message: "Withdrawal Failed" }); }
});

// ৩. অ্যাডমিন প্যানেল ফিক্স (Edit/Delete/Data)
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch { res.status(500).json({ success: false }); }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true, message: "Balance Updated!" });
  } catch { res.status(500).json({ success: false, message: "Error updating balance" }); }
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Trader Deleted" });
  } catch { res.status(500).json({ success: false, message: "Action failed!" }); }
});

/* ================= AUTH & SERVER ================= */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ success: false });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user });
  } catch { res.status(500).json({ success: false }); }
});

app.get("/", (req, res) => res.send("🚀 Vinance API Live"));

export default app;