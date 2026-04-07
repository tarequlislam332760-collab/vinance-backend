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
  origin: ["https://vinance-frontend-vjqa.vercel.app", "https://vinance-frontend.vercel.app", "http://localhost:5173"],
  credentials: true
}));
app.use(express.json());

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String, 
  email: { type: String, unique: true }, 
  password: String, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 0 }
}));

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

// --- FuturesTrade Model Updated with PnL & TP/SL ---
const FuturesTrade = mongoose.models.FuturesTrade || mongoose.model("FuturesTrade", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  symbol: { type: String, uppercase: true },
  type: { type: String, enum: ["buy", "sell"] },
  amount: Number,
  leverage: { type: Number, default: 1 },
  entryPrice: Number,
  tp: { type: Number, default: null },
  sl: { type: Number, default: null },
  pnl: { type: Number, default: 0 },
  status: { type: String, enum: ["open", "closed"], default: "open" }
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
  amount: Number,
  status: { type: String, default: "active" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No Token Provided" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (err) { res.status(401).json({ message: "Invalid or Expired Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ message: "Admin access only" });
};

/* ================= ROUTES ================= */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    await User.create({ name, email: email.toLowerCase().trim(), password: hashedPassword });
    res.status(201).json({ success: true });
  } catch (err) { res.status(500).json({ message: "Registration Failed" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Missing Fields" });
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "Wrong Info" });
    const isMatch = bcrypt.compareSync(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Wrong Info" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { _id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Internal Server Error" }); }
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(amount), method, transactionId });
    res.json({ success: true, message: "Deposit request submitted" });
  } catch (err) { res.status(500).json({ message: "Deposit error" }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Low Balance" });
    await Transaction.create({ userId: req.user.id, type: "withdraw", amount: Number(amount), method, transactionId });
    res.json({ success: true, message: "Withdraw request submitted" });
  } catch (err) { res.status(500).json({ message: "Withdraw error" }); }
});

app.get("/api/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Low Balance" });
    user.balance -= Number(amount);
    await user.save();
    await Investment.create({ userId: user._id, planId, amount: Number(amount) });
    await Transaction.create({ userId: user._id, type: "investment", amount: Number(amount), status: "approved" });
    res.json({ success: true, message: "Investment Successful" });
  } catch (err) { res.status(500).json({ message: "Investment failed" }); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  try {
    const data = await Investment.find({ userId: req.user.id }).populate("planId");
    res.json(data);
  } catch (err) { res.status(500).json({ message: "Error fetching logs" }); }
});

/* --- Updated Futures Trade Route --- */
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol, leverage, entryPrice, tp, sl } = req.body;
    const user = await User.findById(req.user.id);
    
    const tradeAmount = Number(amount);
    if (!user || user.balance < tradeAmount) {
      return res.status(400).json({ message: "Insufficient Balance" });
    }

    // ব্যালেন্স আপডেট
    user.balance -= tradeAmount;
    await user.save();

    // ট্রেড তৈরি
    const trade = await FuturesTrade.create({
      userId: user._id,
      symbol: symbol || "BTCUSDT",
      type, // 'buy' (Long) or 'sell' (Short)
      amount: tradeAmount,
      leverage: Number(leverage) || 1,
      entryPrice: Number(entryPrice),
      tp: tp || null,
      sl: sl || null,
      status: "open"
    });

    // ট্রানজেকশন হিস্ট্রিতে রেকর্ড
    await Transaction.create({ 
      userId: user._id, 
      type: "futures", 
      amount: tradeAmount, 
      status: "approved", 
      method: `${symbol} ${leverage}x ${type.toUpperCase()}` 
    });

    res.json({ 
      success: true, 
      message: "Futures Trade Opened Successfully! 🚀", 
      newBalance: user.balance, 
      trade 
    });
  } catch (err) { 
    res.status(500).json({ message: "Futures trade failed", error: err.message }); 
  }
});

app.get("/api/my-futures", auth, async (req, res) => {
  const data = await FuturesTrade.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

/* --- Copy Trade Routes --- */
app.get("/api/traders/all", async (req, res) => {
  const traders = await Trader.find({ status: true }); 
  res.json(traders);
});

app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const { experience, capital } = req.body;
    const user = await User.findById(req.user.id);
    await Trader.create({
      name: user?.name || "Pending Applicant",
      profit: Number(experience), 
      winRate: 90, 
      aum: Number(capital), 
      status: false 
    });
    res.status(201).json({ success: true, message: "Application Submitted Successfully!" });
  } catch (err) { res.status(500).json({ message: "Application Submission Failed" }); }
});

app.post("/api/copy-trade/follow", auth, async (req, res) => {
  try {
    const { traderId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Insufficient Balance" });
    user.balance -= Number(amount);
    await user.save();
    await CopyTrade.create({ userId: user._id, traderId, amount: Number(amount) });
    await Trader.findByIdAndUpdate(traderId, { $inc: { followers: 1 } });
    await Transaction.create({ userId: user._id, type: "copy_trade", amount: Number(amount), status: "approved", method: "Trader Copy" });
    res.json({ success: true, message: "Copy Trade Started!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: "Copy trade failed" }); }
});

/* ================= ADMIN PANEL ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const investments = await Investment.find().populate("userId", "name email").populate("planId", "name profitPercent").sort({ createdAt: -1 });
    const traders = await Trader.find({ status: true }); 
    const pendingApplications = await Trader.find({ status: false }).sort({ createdAt: -1 });
    res.json({ users, requests, investments, traders, pendingApplications });
  } catch (err) { res.status(500).json({ message: "Error fetching admin data" }); }
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body; 
    const transaction = await Transaction.findById(id);
    if (!transaction) return res.status(404).json({ message: "Transaction not found" });
    transaction.status = status;
    await transaction.save();
    if (status === "approved" && transaction.type === "deposit") {
      await User.findByIdAndUpdate(transaction.userId, { $inc: { balance: transaction.amount } });
    }
    res.json({ success: true, message: `Request ${status} successfully` });
  } catch (err) { res.status(500).json({ message: "Action failed" }); }
});

app.get("/api/plans", async (req, res) => {
  res.json(await Plan.find({ status: true }));
});

app.get("/", (req, res) => res.send("🔥 Vinance API is Live!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));