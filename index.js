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

/* ================= DB ================= */
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.log("❌ DB Connection Error:", err));

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
  type: String,
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
    if (!token) return res.status(401).json({ message: "No token" });

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ message: "Admin only" });
};

/* ================= ROUTES ================= */

app.get("/", (req, res) => res.send("🚀 Vinance API Live"));

// --- LOGIN ---
app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ message: "Wrong credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

// --- ✅ SPOT BUY/SELL FIX ---
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, side } = req.body;
    const user = await User.findById(req.user.id);

    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ success: false, message: "Invalid amount" });

    // BUY/SELL লজিক ঠিক করা হয়েছে
    if (side === "buy" || side === "Buy") {
      if (user.balance < amt) return res.status(400).json({ success: false, message: "Insufficient balance" });
      user.balance -= amt;
    } else {
      user.balance += amt;
    }

    await user.save();

    // ট্রানজ্যাকশন সেভ করা হচ্ছে
    await Transaction.create({
      userId: user._id,
      type: "spot",
      amount: amt,
      symbol: symbol || "USDT",
      status: "completed",
      details: `${side.toUpperCase()} ${symbol || "USDT"}`
    });

    res.json({ success: true, message: "Trade successful", balance: user.balance });
  } catch (err) {
    res.status(500).json({ success: false, message: "Trade error" });
  }
});

// --- ✅ LOGS PAGE FIX (যাতে ডাটা দেখা যায়) ---
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    // ফ্রন্টএন্ডে সরাসরি Array অথবা Object এর ভেতর Array পাঠালে সুবিধা হয়
    res.json(data); 
  } catch (err) { res.status(500).json([]); }
});

// --- TRADER APPLY ---
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const exist = await Trader.findOne({ userId: req.user.id });
    if (exist) return res.status(400).json({ message: "Already applied" });

    const user = await User.findById(req.user.id);
    await Trader.create({
      userId: user._id,
      name: user.name,
      experience: req.body.experience,
      aum: req.body.capital || req.body.aum,
      status: "approved" 
    });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ ADMIN TRADERS LIST & EDIT/DELETE FIX ---
app.get("/api/admin/traders", auth, adminAuth, async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json(traders); // সরাসরি ডাটা পাঠানো হচ্ছে যাতে লিস্ট দেখা যায়
  } catch (err) { res.status(500).json([]); }
});

app.put("/api/admin/trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Updated!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find().sort({ createdAt: -1 })); } catch (err) { res.status(500).json([]); }
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server Running on ${PORT}`));

export default app;