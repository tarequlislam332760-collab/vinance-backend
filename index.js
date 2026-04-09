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
  type: { type: String, enum: ["deposit", "withdraw", "investment", "sell", "futures", "copy_trade"] },
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" }
}, { timestamps: true }));

const FuturesTrade = mongoose.models.FuturesTrade || mongoose.model("FuturesTrade", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  symbol: String,
  type: { type: String, enum: ["buy", "sell"] },
  amount: Number, leverage: Number, entryPrice: Number, status: { type: String, default: "open" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  name: String,
  image: { type: String, default: "https://cdn-icons-png.flaticon.com/512/3135/3135715.png" },
  profit: { type: Number, default: 0 }, 
  followers: { type: Number, default: 0 },
  winRate: { type: Number, default: 90 },
  aum: { type: Number, default: 0 },           
  mdd: { type: Number, default: 0 },           
  chartData: { type: [Number], default: [] }, 
  status: { type: Boolean, default: true }
}, { timestamps: true }));

const CopyTrade = mongoose.models.CopyTrade || mongoose.model("CopyTrade", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  traderId: { type: mongoose.Schema.Types.ObjectId, ref: "Trader" },
  amount: Number, status: { type: String, default: "active" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Access Denied. No token provided." });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (err) { res.status(401).json({ message: "Invalid or Expired Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ message: "Admin access only" });
};

/* ================= PUBLIC & AUTH ROUTES ================= */

// Register
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "All fields are required" });

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: normalizedEmail, password: hashedPassword });
    
    res.status(201).json({ success: true, message: "Success" });
  } catch (err) { res.status(500).json({ message: "Internal Server Error" }); }
});

// Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid Email or Password" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Server Error" }); }
});

// Profile
app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

/* ================= USER ACTIONS (FINANCIAL) ================= */

app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(amount), method, transactionId });
    res.json({ success: true, message: "Deposit request submitted" });
  } catch (err) { res.status(500).json({ message: "Request failed" }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Low Balance" });
    await Transaction.create({ userId: req.user.id, type: "withdraw", amount: Number(amount), method, transactionId });
    res.json({ success: true, message: "Withdraw request submitted" });
  } catch (err) { res.status(500).json({ message: "Request failed" }); }
});

app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol, leverage, entryPrice } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Insufficient Balance" });

    user.balance -= Number(amount);
    await user.save();

    const trade = await FuturesTrade.create({ userId: user._id, symbol, type, amount: Number(amount), leverage, entryPrice });
    await Transaction.create({ userId: user._id, type: "futures", amount: Number(amount), status: "approved", method: `${symbol} ${leverage}x` });
    
    res.json({ success: true, message: "Trade Opened!", newBalance: user.balance, trade });
  } catch (err) { res.status(500).json({ message: "Trade failed" }); }
});

/* ================= TRADER & COPY TRADE ROUTES ================= */

app.get("/api/traders/all", async (req, res) => {
  const traders = await Trader.find({ status: true }); 
  res.json(traders);
});

app.post("/api/copy-trade/follow", auth, async (req, res) => {
  try {
    const { traderId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Low Balance" });

    user.balance -= Number(amount);
    await user.save();
    await CopyTrade.create({ userId: user._id, traderId, amount: Number(amount) });
    await Trader.findByIdAndUpdate(traderId, { $inc: { followers: 1 } });
    
    res.json({ success: true, message: "Copying Started!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: "Failed" }); }
});

/* ================= ADMIN ROUTES ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    res.json({ users, requests });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body; 
    const transaction = await Transaction.findById(id);
    if (!transaction) return res.status(404).json({ message: "Not found" });
    
    transaction.status = status;
    await transaction.save();
    
    if (status === "approved" && transaction.type === "deposit") {
      await User.findByIdAndUpdate(transaction.userId, { $inc: { balance: transaction.amount } });
    }
    res.json({ success: true, message: `Request ${status}` });
  } catch (err) { res.status(500).json({ message: "Action failed" }); }
});

/* ================= START SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API is running..."));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server listening on port ${PORT}`));