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
  origin: [
    "https://vinance-frontend-vjqa.vercel.app", 
    "https://vinance-frontend.vercel.app", 
    "https://vinance-frontend.app", 
    "http://localhost:5173",
    /\.vercel\.app$/ 
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

/* ================= DATABASE CONNECTION ================= */
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
  type: { type: String, enum: ["deposit", "withdraw", "investment", "sell", "buy", "futures", "copy_trade"] },
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, email: String, experience: Number, capital: Number,
  profitShare: { type: Number, default: 30 },
  status: { type: String, default: "pending" } 
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Access Denied" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Session Expired. Please login again." }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= AUTH & PROFILE ROUTES ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ success: false, message: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: normalizedEmail, password: hashedPassword });
    res.status(201).json({ success: true, message: "Registration Successful!" });
  } catch (err) { res.status(500).json({ success: false, message: "Registration Error" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ success: false, message: "Login Error" }); }
});

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false, message: "Fetch Error" }); }
});

// ✅ প্রোফাইল আপডেট ফিক্স
app.put("/api/profile/update", auth, async (req, res) => {
  try {
    const { name, password } = req.body;
    const updateData = {};
    if (name) updateData.name = name;
    if (password) updateData.password = await bcrypt.hash(password, 10);
    const user = await User.findByIdAndUpdate(req.user.id, updateData, { new: true }).select("-password");
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ success: false, message: "Update Failed" }); }
});

/* ================= FINANCIAL ACTIONS ================= */
app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(amount), method, transactionId });
    res.json({ success: true, message: "Deposit Request Submitted Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed" }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);
    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Insufficient Balance" });
    user.balance -= numAmount;
    await user.save();
    await Transaction.create({ userId: req.user.id, type: "withdraw", amount: numAmount, method, transactionId: address });
    res.json({ success: true, message: "Withdrawal Requested!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Failed" }); }
});

app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol, leverage } = req.body;
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);
    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Low Balance" });
    user.balance -= numAmount;
    await user.save();
    await Transaction.create({ userId: user._id, type: "futures", amount: numAmount, status: "approved", method: `${symbol} ${leverage}x` });
    res.json({ success: true, message: "Trade Successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Trade Error" }); }
});

// ✅ AI Plans Fetch 
app.get("/api/plans", async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch (err) { res.status(500).json({ success: false, message: "Plans Load Failed" }); }
});

// ✅ Logs History 
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json({ success: false, message: "Logs Error" }); }
});

/* ================= ADMIN ACTIONS ================= */
// ✅ অ্যাডমিন ব্যালেন্স আপডেট ফিক্স
app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true, message: "Balance Updated!" });
  } catch (err) { res.status(500).json({ success: false, message: "Update Failed" }); }
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
    res.json({ success: true, message: "Action Success" });
  } catch (err) { res.status(500).json({ success: false, message: "Action failed" }); }
});

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find(); // অ্যাডমিনের জন্য সব প্ল্যান
    res.json({ success: true, users, requests, traders, plans });
  } catch (err) { res.status(500).json({ success: false, message: "Admin Error" }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true, message: "Plan Created Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Plan Creation Failed" }); }
});

/* ================= START SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API Running..."));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));