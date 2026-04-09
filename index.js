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
    "http://localhost:5173",
    /\.vercel\.app$/ 
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

/* ================= DATABASE CONNECTION ================= */
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log("✅ DB Connected Successfully"))
  .catch(err => console.error("❌ DB Connection Error:", err));

/* ================= DATABASE MODELS ================= */
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

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  name: String,
  email: String,
  experience: Number,
  capital: Number,
  profitShare: { type: Number, default: 30 },
  status: { type: Boolean, default: false } // Pending by default
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Access Denied" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ message: "Admin access only" });
};

/* ================= AUTH ROUTES ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ message: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: normalizedEmail, password: hashedPassword });
    res.status(201).json({ success: true, message: "Success" });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

/* ================= TRADING & INVESTMENT ================= */

// ✅ Buy/Sell Fixed
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol } = req.body;
    const user = await User.findById(req.user.id);
    
    if (type === "buy") {
      if (user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });
      user.balance -= Number(amount);
    } else {
      user.balance += Number(amount);
    }
    
    await user.save();
    await Transaction.create({ userId: user._id, type, amount, status: "approved", method: symbol });
    
    res.json({ success: true, newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: "Trade failed" }); }
});

// ✅ Investment & Logs Fixed
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Low Balance" });

    user.balance -= Number(amount);
    await user.save();
    await Investment.create({ userId: user._id, planId, amount });
    await Transaction.create({ userId: user._id, type: "investment", amount, status: "approved" });
    
    res.json({ success: true, message: "Investment Successful" });
  } catch (err) { res.status(500).json({ message: "Investment failed" }); }
});

app.get("/api/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

/* ================= TRADER APPLICATION (BECOME A LEAD) ================= */

app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const { experience, capital } = req.body;
    const user = await User.findById(req.user.id);
    
    await Trader.create({
      name: user.name,
      email: user.email,
      experience: Number(experience),
      capital: Number(capital),
      status: false
    });
    
    res.status(201).json({ success: true, message: "Application Submitted!" });
  } catch (err) { res.status(500).json({ message: "Failed to create trader" }); }
});

/* ================= ADMIN ROUTES (FIXED) ================= */

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    const newPlan = await Plan.create(req.body);
    res.json({ success: true, plan: newPlan });
  } catch (err) { res.status(500).json({ message: "Plan creation failed" }); }
});

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find();
    res.json({ users, requests, traders });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.get("/api/plans", async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

/* ================= START SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API is running..."));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));