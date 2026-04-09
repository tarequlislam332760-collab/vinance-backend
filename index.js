import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE (CORS ফিক্স) ================= */
// ফ্রন্টএন্ডে credentials: true থাকলে origin-এ "*" ব্যবহার করা যায় না। 
// তাই সরাসরি ফ্রন্টএন্ড ইউআরএল দিতে হবে।
app.use(cors({
  origin: "https://vinance-frontend-vjqa.vercel.app", 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

/* ================= DATABASE CONNECTION ================= */
if (mongoose.connection.readyState === 0) {
  mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
    .then(() => console.log("✅ DB Connected Successfully"))
    .catch(err => console.error("❌ DB Error:", err));
}

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String, role: { type: String, default: "user" }, balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, amount: Number, method: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, experience: Number, capital: Number, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token Found" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Invalid Session" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin Only" });
};

/* ================= ROUTES (এরর ফিক্সড) ================= */

app.get("/", (req, res) => res.send("🚀 Vinance API is Live..."));

// ১. প্রোফাইল ও আপডেট (404 এবং Profile Update ফিক্স)
app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

app.post("/api/profile/update", auth, async (req, res) => {
  try {
    const { name } = req.body;
    await User.findByIdAndUpdate(req.user.id, { name });
    res.json({ success: true, message: "Profile Updated Successfully!" });
  } catch { res.status(500).json({ success: false }); }
});

// ২. ট্রেড (Futures/Trade - 404 ফিক্স)
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ success: false, message: "Insufficient Balance" });
    
    user.balance -= Number(amount);
    await user.save();
    await Transaction.create({ userId: user._id, type: "futures", amount, method: `${symbol} ${leverage}x`, status: "approved" });
    
    res.json({ success: true, message: "Order Placed Successfully!", newBalance: user.balance });
  } catch { res.status(500).json({ success: false }); }
});

// ৩. ইনভেস্টমেন্ট ও প্ল্যান (Plans 404 ফিক্স)
app.get("/api/plans", async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch { res.status(500).json([]); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id, type: "investment" });
  res.json(data);
});

// ৪. ডিপোজিট ও উইথড্র (Deposit/Withdraw 404 ফিক্স)
app.post("/api/deposit", auth, async (req, res) => {
  await Transaction.create({ userId: req.user.id, type: "deposit", ...req.body });
  res.json({ success: true, message: "Deposit request submitted!" });
});

app.post("/api/withdraw", auth, async (req, res) => {
  const { amount } = req.body;
  const user = await User.findById(req.user.id);
  if (user.balance < amount) return res.status(400).json({ message: "Low Balance" });
  await Transaction.create({ userId: req.user.id, type: "withdraw", ...req.body });
  res.json({ success: true, message: "Withdrawal request submitted!" });
});

// ৫. ট্রেডার অ্যাপ্লাই (Traders/Apply ফিক্স)
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    await Trader.create({ userId: req.user.id, ...req.body });
    res.json({ success: true, message: "Application Submitted!" });
  } catch { res.status(500).json({ success: false }); }
});

app.get("/api/traders/all", auth, async (req, res) => {
  const traders = await Trader.find().sort({ createdAt: -1 });
  res.json(traders);
});

/* ================= ADMIN ACTIONS (প্যানেল ফিক্স) ================= */

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  const { userId, balance } = req.body;
  await User.findByIdAndUpdate(userId, { balance });
  res.json({ success: true, message: "Balance Updated!" });
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  await Plan.create(req.body);
  res.json({ success: true, message: "Plan Created!" });
});

app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  await Trader.create(req.body);
  res.json({ success: true, message: "Trader Created!" });
});

// ৬. ট্রানজেকশন লগস
app.get("/api/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

// ৭. লগইন
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch { res.status(500).json({ success: false }); }
});

export default app;