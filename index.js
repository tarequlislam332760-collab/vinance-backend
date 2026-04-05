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

const FuturesTrade = mongoose.models.FuturesTrade || mongoose.model("FuturesTrade", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  symbol: String,
  type: { type: String, enum: ["buy", "sell"] },
  amount: Number,
  leverage: Number,
  entryPrice: Number,
  status: { type: String, default: "open" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  name: String,
  image: String,
  profit: Number, 
  followers: { type: Number, default: 0 },
  winRate: { type: Number, default: 90 },
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
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword });
    res.status(201).json({ success: true });
  } catch (err) { res.status(500).json({ message: "Registration Failed" }); }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ message: "Wrong Info" });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user: { _id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } });
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

app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol } = req.body;
    const user = await User.findById(req.user.id);
    if (type === 'buy') {
      if (user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });
      user.balance -= amount;
    } else if (type === 'sell') {
      user.balance += amount; 
    }
    await user.save();
    await Transaction.create({ userId: user._id, type: type === 'buy' ? 'investment' : 'sell', amount, status: "approved", method: symbol });
    res.json({ success: true, message: "Trade Successful", newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: "Trade failed" }); }
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

app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol, leverage, entryPrice } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.balance < Number(amount)) return res.status(400).json({ message: "Insufficient Balance" });
    user.balance -= Number(amount);
    await user.save();
    const trade = await FuturesTrade.create({
      userId: user._id,
      symbol: symbol || "BTCUSDT",
      type: type, 
      amount: Number(amount),
      leverage: Number(leverage) || 1,
      entryPrice: Number(entryPrice) || 0,
      status: "open"
    });
    await Transaction.create({ 
      userId: user._id, 
      type: "futures", 
      amount: Number(amount), 
      status: "approved", 
      method: `${symbol} ${leverage}x ${type.toUpperCase()}` 
    });
    res.json({ success: true, message: "Futures Trade Opened", newBalance: user.balance, trade });
  } catch (err) { 
    console.error(err);
    res.status(500).json({ message: "Futures trade failed" }); 
  }
});

app.get("/api/my-futures", auth, async (req, res) => {
  try {
    const data = await FuturesTrade.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json({ message: "Error fetching futures logs" }); }
});

/* --- Copy Trade Routes --- */

app.get("/api/traders", async (req, res) => {
  try {
    const traders = await Trader.find(); 
    res.json(traders);
  } catch (err) { res.status(500).json({ message: "Error fetching traders" }); }
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
    await Transaction.create({ 
      userId: user._id, 
      type: "copy_trade", 
      amount: Number(amount), 
      status: "approved", 
      method: "Trader Copy" 
    });
    res.json({ success: true, message: "Copy Trade Started!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: "Copy trade failed" }); }
});

/* ================= ADMIN PANEL ================= */

app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  try {
    const { name, image, profit, winRate } = req.body;
    await Trader.create({ name, image, profit, winRate });
    res.json({ success: true, message: "Trader Created Successfully" });
  } catch (err) { res.status(500).json({ message: "Failed to create trader" }); }
});

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const investments = await Investment.find().populate("userId", "name email").populate("planId", "name profitPercent").sort({ createdAt: -1 });
    const traders = await Trader.find(); 
    res.json({ users, requests, investments, traders });
  } catch (err) { 
    console.error("Admin data fetch error:", err);
    res.status(500).json({ message: "Error fetching admin data" }); 
  }
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

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Update failed" }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    const { name, minAmount, maxAmount, profitPercent, duration } = req.body;
    await Plan.create({ name, minAmount, maxAmount, profitPercent, duration });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Plan creation failed" }); }
});

app.get("/api/plans", async (req, res) => {
  res.json(await Plan.find({ status: true }));
});

app.get("/", (req, res) => res.send("🔥 Vinance API is Live!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));