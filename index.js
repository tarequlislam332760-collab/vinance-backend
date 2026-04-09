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
  origin: "*", 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
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

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, enum: ["deposit", "withdraw", "investment", "sell", "buy", "futures", "copy_trade"] },
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, email: String, experience: Number, capital: Number, status: { type: String, default: "pending" } 
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
  } catch (err) { res.status(401).json({ success: false, message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin only" });
};

/* ================= ROUTES ================= */

// ✅ Login & Profile (Fixed Profile Field Problem)
app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    // ইউজার অবজেক্ট সরাসরি পাঠানো হচ্ছে যাতে প্রোফাইল ফিল্ডে ডাটা পায়
    res.json({ success: true, token, user: { _id: user._id, name: user.name, email: user.email, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ Future Page Amount Buy/Long Fix
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, symbol } = req.body;
    const user = await User.findById(req.user.id);
    const tradeAmount = Number(amount);

    if (user.balance < tradeAmount) return res.status(400).json({ success: false, message: "Insufficient Balance" });

    user.balance -= tradeAmount;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: "futures",
      amount: tradeAmount,
      method: symbol || "Futures Trade",
      status: "approved"
    });

    res.json({ success: true, message: "Trade Successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Trade failed!" }); }
});

// ✅ Trader Apply Fix (Already Applied logic handling)
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const existing = await Trader.findOne({ userId: req.user.id });
    if (existing) return res.status(400).json({ success: false, message: "Already applied!" });

    await Trader.create({
      userId: req.user.id,
      name: req.body.name,
      experience: req.body.experience,
      capital: req.body.capital,
      status: "pending"
    });
    res.json({ success: true, message: "Application submitted!" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to create trader" }); }
});

/* ================= ADMIN ACTIONS (Edit/Delete Fix) ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json({ success: true, users, requests, traders });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ব্যালেন্স আপডেট ও এডিট
app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    const updatedUser = await User.findByIdAndUpdate(userId, { balance: Number(balance) }, { new: true });
    if (!updatedUser) return res.status(404).json({ success: false, message: "User not found" });
    res.json({ success: true, message: "Update Successful!" });
  } catch (err) { res.status(500).json({ success: false, message: "Update failed!" }); }
});

// ইউজার ডিলিট অপশন
app.delete("/api/admin/delete-user/:id", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "User deleted successfully" });
  } catch (err) { res.status(500).json({ success: false, message: "Delete failed!" }); }
});

// ডিপোজিট/উইথড্র রিকোয়েস্ট হ্যান্ডেল
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

// অন্যান্য জেনারেল রাউট
app.post("/api/deposit", auth, async (req, res) => {
  await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(req.body.amount), method: req.body.method, transactionId: req.body.transactionId });
  res.json({ success: true });
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  await Plan.create(req.body);
  res.json({ success: true });
});

app.get("/", (req, res) => res.send("🚀 Vinance API Live"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));