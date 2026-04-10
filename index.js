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
  balance: { type: Number, default: 0 },
  image: { type: String, default: "" }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, 
  amount: Number, 
  symbol: String, 
  method: String, 
  status: { type: String, default: "approved" }, 
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

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

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

// Trade Fix (Buy/Sell/Spot/Futures)
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage, type, side } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmt = Number(amount);

    if (!numAmt || numAmt <= 0) return res.status(400).json({ success: false, message: "Invalid Amount" });
    if (user.balance < numAmt) return res.status(400).json({ success: false, message: "Insufficient Balance" });

    user.balance -= numAmt;
    await user.save();

    const trade = await Transaction.create({
      userId: user._id,
      type: type || "spot",
      amount: numAmt,
      symbol: symbol || "BTC/USDT",
      method: leverage ? `${leverage}x` : "Spot",
      status: "approved",
      details: `${side?.toUpperCase() || 'ORDER'} - ${symbol || 'Market'}`
    });

    res.json({ success: true, message: "Trade Executed Successfully!", newBalance: user.balance, trade });
  } catch (err) { res.status(500).json({ success: false, message: "Trade failed" }); }
});

// Alias routes to support multiple frontend endpoints
app.post("/api/spot/trade", auth, (req, res) => { req.body.type = "spot"; app._router.handle(req, res); });
app.post("/api/futures/trade", auth, (req, res) => { req.body.type = "futures"; app._router.handle(req, res); });

// Logs Page (Transaction History)
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    // Sending both as array and object to satisfy different frontend needs
    res.json({ success: true, logs, data: logs }); 
  } catch (err) { res.status(500).json({ success: false, logs: [] }); }
});

// Trader Apply
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const { experience, capital, name, img } = req.body;
    const user = await User.findById(req.user.id);
    
    const newTrader = await Trader.create({
      userId: user._id, 
      name: name || user.name, 
      img: img || user.image,
      experience, 
      aum: `$${capital}`, 
      status: "approved"
    });
    res.json({ success: true, message: "Trader Profile Created!", trader: newTrader });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Get All Traders for Public Page
app.get("/api/traders/all", async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json(traders);
  } catch (err) { res.status(500).json([]); }
});

/* ================= ADMIN ROUTES ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find();
    res.json({ success: true, users, requests, traders, plans });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put("/api/admin/update-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    const updated = await Trader.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, message: "Trader Updated!", data: updated });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Trader Deleted!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Auth Login
app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/", (req, res) => res.send("🚀 Vinance Final API - Production Ready"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

export default app;