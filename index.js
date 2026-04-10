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
  .then(() => console.log("✅ Database Connected"))
  .catch(err => console.error("❌ Database Connection Error:", err));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true }, 
  email: { type: String, unique: true, required: true }, 
  password: { type: String, required: true }, 
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
  img: String, 
  profit: { type: String, default: "0%" }, 
  winRate: { type: String, default: "0%" }, 
  aum: { type: String, default: "$0" }, 
  mdd: { type: String, default: "0%" }, 
  experience: String, 
  status: { type: String, default: "approved" } 
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

// ✅ Health Check / Home Route
app.get("/", (req, res) => res.send("🚀 Vinance API V9 Live & Stable"));

// --- LOGIN ---
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Wrong credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ SPOT/FUTURES TRADE FIX ---
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, side, type } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmt = Number(amount);

    if (!numAmt || numAmt <= 0) return res.status(400).json({ success: false, message: "সঠিক অ্যামাউন্ট লিখুন" });

    if (side?.toLowerCase() === "buy") {
      if (user.balance < numAmt) return res.status(400).json({ success: false, message: "পর্যাপ্ত ব্যালেন্স নেই" });
      user.balance -= numAmt;
    } else if (side?.toLowerCase() === "sell") {
      user.balance += numAmt;
    }

    await user.save();

    // Create log for transaction page
    await Transaction.create({
      userId: user._id,
      type: type || "spot",
      amount: numAmt,
      symbol: symbol || "USDT",
      status: "completed",
      details: `${side?.toUpperCase() || 'ORDER'} trade for ${symbol || 'Market'}`
    });

    res.json({ success: true, message: "Trade Successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "ট্রেড ব্যর্থ হয়েছে" }); }
});

// --- ✅ LOGS PAGE FIX ---
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(logs); // Front-end expects direct array
  } catch (err) { res.status(500).json([]); }
});

// --- ✅ BECOME A TRADER ---
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const exist = await Trader.findOne({ userId: user._id });
    if (exist) return res.status(400).json({ success: false, message: "ইতিমধ্যেই আবেদন করেছেন" });

    await Trader.create({
      userId: user._id,
      name: user.name,
      experience: req.body.experience || "Expert",
      aum: `$${req.body.capital || req.body.aum || 0}`,
      status: "approved"
    });
    res.json({ success: true, message: "Application Approved" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ ADMIN PANEL: TRADERS LIST ---
app.get("/api/admin/traders", auth, adminAuth, async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json(traders); 
  } catch (err) { res.status(500).json([]); }
});

// --- ✅ ADMIN PANEL: EDIT TRADER ---
app.put("/api/admin/trader/:id", auth, adminAuth, async (req, res) => {
  try {
    const updated = await Trader.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: "Trader Updated Successfully", data: updated });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ ADMIN PANEL: DELETE TRADER ---
app.delete("/api/admin/trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Trader Deleted" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- PUBLIC TRADERS ---
app.get("/api/traders/all", async (req, res) => {
  try { 
    const data = await Trader.find({ status: "approved" }).sort({ createdAt: -1 });
    res.json(data); 
  } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server Running on ${PORT}`));

export default app;