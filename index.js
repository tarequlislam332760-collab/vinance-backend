import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: true, credentials: true }));
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
  balance: { type: Number, default: 5000 } 
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
  name: String, img: { type: String, default: "" }, 
  profit: { type: String, default: "0%" }, winRate: { type: String, default: "0%" }, 
  aum: String, experience: String, status: { type: String, default: "approved" } 
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

app.get("/", (req, res) => res.send("🚀 Vinance API Active"));

// --- AUTH & PROFILE ---
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: "ইমেইলটি ব্যবহৃত হচ্ছে" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword, balance: 5000 });
    res.json({ success: true, message: "রেজিস্ট্রেশন সফল" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "ভুল তথ্য" });
    }
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

app.put("/api/profile/update", auth, async (req, res) => {
  try {
    const { name, password } = req.body;
    const updateData = { name };
    if (password) { updateData.password = await bcrypt.hash(password, 10); }
    const user = await User.findByIdAndUpdate(req.user.id, updateData, { new: true }).select("-password");
    res.json({ success: true, message: "Update Success", user });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- TRADING & DEPOSIT/WITHDRAW (FIXED) ---
app.post("/api/deposit", auth, async (req, res) => {
  try {
    await Transaction.create({ ...req.body, userId: req.user.id, type: "deposit", status: "pending" });
    res.json({ success: true, message: "Request Sent" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.balance < req.body.amount) return res.status(400).json({ message: "Low Balance" });
    user.balance -= req.body.amount;
    await user.save();
    await Transaction.create({ ...req.body, userId: req.user.id, type: "withdraw", status: "pending" });
    res.json({ success: true, message: "Withdraw Pending" });
  } catch (err) { res.status(500).json({ success: false }); }
});

const handleTrade = async (req, res) => {
  try {
    const { amount, symbol, leverage, side } = req.body; 
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ success: false, message: "ব্যালেন্স নেই" });
    user.balance -= amount;
    await user.save();
    await Transaction.create({ userId: user._id, type: leverage ? "futures" : "spot", amount, symbol, status: "approved", details: `${side} Trade` });
    res.json({ success: true, message: "ট্রেড সফল হয়েছে", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
};
app.post("/api/futures/trade", auth, handleTrade);
app.post("/api/spot/trade", auth, handleTrade);

// --- INVESTMENT & LOGS (FIXED PAGE KALI) ---
app.get("/api/plans", async (req, res) => {
  try { res.json(await Plan.find({ status: true })); } catch (err) { res.status(500).json([]); }
});

app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Low Balance" });
    user.balance -= amount;
    await user.save();
    await Investment.create({ userId: user._id, planId, amount });
    await Transaction.create({ userId: user._id, type: "investment", amount, details: "AI Plan Purchase", status: "approved" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/transactions", auth, async (req, res) => {
  try {
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json([]); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  try { res.json(await Investment.find({ userId: req.user.id }).populate("planId")); } catch (err) { res.status(500).json([]); }
});

// --- ADMIN CONTROL (FIXED EDIT/DELETE/PLANS) ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find().sort({ createdAt: -1 });
    res.json({ success: true, users, requests, traders, plans });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put("/api/admin/traders/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Updated" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/traders/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.json({ success: true, plan });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put("/api/admin/update-balance/:id", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { balance: req.body.balance });
    res.json({ success: true, message: "Balance Updated" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put("/api/admin/transaction/:id", auth, adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    const trx = await Transaction.findById(req.params.id);
    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- PUBLIC ---
app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find({ status: "approved" }).sort({ createdAt: -1 })); } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API on Port ${PORT}`));
export default app;