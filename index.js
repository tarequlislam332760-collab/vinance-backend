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
  origin: true,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(dbURI)
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.error("❌ DB Connection Error:", err));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: "user" },
  balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, // 'spot', 'withdraw', 'deposit', 'investment'
  amount: Number,
  symbol: String,
  method: String,
  status: { type: String, default: "completed" },
  details: String
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  profit: { type: String, default: "0%" },
  winRate: { type: String, default: "0%" },
  aum: String,
  experience: String,
  status: { type: String, default: "approved" } 
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No token" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Unauthorized" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ message: "Admin only" });
};

/* ================= ROUTES ================= */

app.get("/", (req, res) => res.send("🚀 Vinance API Live and Ready"));

// --- LOGIN ---
app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Wrong credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ PROFILE FIX (404 Error Fix) ---
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user); 
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

// --- ✅ DEPOSIT/WITHDRAW/INVESTMENT (Alias Routes) ---
app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    await Transaction.create({ userId: req.user.id, amount, type: "withdraw", method, status: "pending", details });
    res.json({ success: true, message: "Request sent" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id, type: "investment" });
    res.json(data);
  } catch (err) { res.status(500).json([]); }
});

// --- ✅ SPOT TRADE ---
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, side } = req.body;
    const user = await User.findById(req.user.id);
    const amt = Number(amount);

    if (side?.toLowerCase() === "buy") {
      if (user.balance < amt) return res.status(400).json({ success: false, message: "Low balance" });
      user.balance -= amt;
    } else {
      user.balance += amt;
    }

    await user.save();
    await Transaction.create({
      userId: user._id, type: "spot", amount: amt, symbol, status: "completed", details: `${side?.toUpperCase()} ${symbol}`
    });

    res.json({ success: true, balance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ LOGS & ADMIN ---
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json([]); }
});

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email");
    const traders = await Trader.find();
    res.json({ success: true, users, requests, traders });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Trader Routes
app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find().sort({ createdAt: -1 })); } catch (err) { res.status(500).json([]); }
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Running`));

export default app;