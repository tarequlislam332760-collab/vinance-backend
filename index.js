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

/* ================= ROUTES (FIXED) ================= */

// ১. ইনভেস্টমেন্ট ও ট্রেডার্স (View/Delete Fix)
app.get("/api/plans", async (req, res) => {
  const plans = await Plan.find();
  res.json(plans);
});

app.get("/api/traders/all", async (req, res) => {
  const traders = await Trader.find().sort({ createdAt: -1 });
  res.json(traders);
});

app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    await Trader.create({ userId: req.user.id, ...req.body });
    res.json({ success: true, message: "Application Submitted!" });
  } catch { res.status(500).json({ success: false }); }
});

// ২. ট্রানজেকশন হিস্ট্রি
app.get("/api/transactions", auth, async (req, res) => {
  const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(logs);
});

/* ================= ADMIN ACTIONS (সব ফিক্সড) ================= */

// সব ডাটা ফেচ
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch { res.status(500).json({ success: false }); }
});

// ব্যালেন্স আপডেট
app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true, message: "Balance Updated!" });
  } catch { res.status(500).json({ success: false, message: "Update Failed!" }); }
});

// প্ল্যান তৈরি
app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true, message: "Plan Created Successfully!" });
  } catch { res.status(500).json({ success: false, message: "Failed to create plan" }); }
});

// রিকোয়েস্ট হ্যান্ডেল (Deposit/Withdraw Approve)
app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body;
    const trx = await Transaction.findById(id);
    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true, message: "Action Successful!" });
  } catch { res.status(500).json({ success: false }); }
});

// ৩. ডিলিট অপশন (Trader & Plan Delete Fix)
app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  await Trader.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: "Trader Deleted" });
});

app.delete("/api/admin/delete-plan/:id", auth, adminAuth, async (req, res) => {
  await Plan.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: "Plan Deleted" });
});

/* ================= AUTH ================= */
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

export default app;