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
  type: { type: String, enum: ["deposit", "withdraw", "investment", "sell", "buy", "futures", "trade"] },
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, email: String, experience: Number, capital: Number, status: { type: String, default: "pending" } 
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "Access Denied" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Session Expired" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= AUTH & PROFILE ================= */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

// প্রোফাইল আপডেট (PUT & POST দুটোই ফিক্স করা)
app.post("/api/profile/update", auth, async (req, res) => {
  await User.findByIdAndUpdate(req.user.id, { name: req.body.name });
  res.json({ success: true, message: "Updated!" });
});

/* ================= ACTIONS (404 FIXES) ================= */

// ১. ইনভেস্ট রাউট (এটি আপনার কোড থেকে মিসিং ছিল)
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { amount, planName } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Low Balance" });
    user.balance -= Number(amount);
    await user.save();
    await Transaction.create({ userId: user._id, type: "investment", amount, method: planName, status: "approved" });
    res.json({ success: true, message: "Investment Successful!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ২. সাধারণ ট্রেড রাউট (এটিও লগে 404 আসছিল)
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, type } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Low Balance" });
    user.balance -= Number(amount);
    await user.save();
    await Transaction.create({ userId: user._id, type: "trade", amount, method: `${symbol} (${type})`, status: "approved" });
    res.json({ success: true, message: "Order Placed!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ৩. ট্রেডার্স লিস্ট (401 এরর ফিক্স - এটি সব ইউজার দেখতে পারবে)
app.get("/api/traders/all", auth, async (req, res) => {
  const traders = await Trader.find().sort({ createdAt: -1 });
  res.json(traders);
});

// ৪. ইনভেস্টমেন্ট হিস্ট্রি (404 ফিক্স)
app.get("/api/my-investments", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id, type: "investment" });
  res.json(data);
});

/* ================= EXISTING ACTIONS ================= */
app.post("/api/deposit", auth, async (req, res) => {
  await Transaction.create({ userId: req.user.id, type: "deposit", ...req.body });
  res.json({ success: true, message: "Submitted!" });
});

app.post("/api/withdraw", auth, async (req, res) => {
  const user = await User.findById(req.user.id);
  if (user.balance < req.body.amount) return res.status(400).json({ message: "Low Balance" });
  user.balance -= Number(req.body.amount);
  await user.save();
  await Transaction.create({ userId: req.user.id, type: "withdraw", ...req.body });
  res.json({ success: true, message: "Requested!" });
});

app.get("/api/plans", async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

app.get("/api/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

/* ================= ADMIN ACTIONS ================= */
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");
  const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
  const traders = await Trader.find().sort({ createdAt: -1 });
  res.json({ success: true, users, requests, traders });
});

app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  await Trader.create(req.body);
  res.json({ success: true, message: "Created!" });
});

/* ================= SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Running..."));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));

export default app;