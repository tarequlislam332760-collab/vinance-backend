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
mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
  .then(() => console.log("✅ DB Connected Successfully"))
  .catch(err => console.error("❌ DB Connection Error:", err));

/* ================= DATABASE MODELS ================= */
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  email: { type: String, unique: true, required: true }, 
  password: { type: String, required: true }, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 0 }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);

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
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, email: String, experience: Number, capital: Number,
  profitShare: { type: Number, default: 30 },
  status: { type: String, default: "pending" } 
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
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ message: "Admin access only" });
};

/* ================= AUTH ROUTES ================= */
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ success: false, message: "User already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: normalizedEmail, password: hashedPassword });
    res.status(201).json({ success: true, message: "Registration Successful" });
  } catch (err) { res.status(500).json({ success: false, message: "Error in registration" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ 
      success: true, 
      token, 
      user: { _id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } 
    });
  } catch (err) { res.status(500).json({ success: false, message: "Login Error" }); }
});

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    res.json(user);
  } catch (err) { res.status(500).json({ success: false, message: "Profile Fetch Error" }); }
});

/* ================= FINANCIAL ACTIONS ================= */

app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(amount), method, transactionId });
    res.json({ success: true, message: "Deposit Request Submitted Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Deposit Submission Failed" }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body; 
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ success: false, message: "Insufficient Balance for Withdrawal" });

    user.balance -= Number(amount);
    await user.save();

    await Transaction.create({ userId: req.user.id, type: "withdraw", amount: Number(amount), method, transactionId: address });
    res.json({ success: true, message: "Withdrawal Request Submitted!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Withdrawal Failed" }); }
});

app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, type, symbol, leverage } = req.body;
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);

    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Insufficient Balance" });

    user.balance -= numAmount;
    await user.save();

    await Transaction.create({ 
      userId: user._id, 
      type: "futures", 
      amount: numAmount, 
      status: "approved", 
      method: `${symbol} (${leverage}x ${type.toUpperCase()})` 
    });

    res.json({ success: true, message: "Future Trade Placed Successfully!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Future Trade Failed" }); }
});

app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data); 
  } catch (err) { res.status(500).json({ success: false, message: "Logs fetch failed" }); }
});

/* ================= TRADER APPLICATION ================= */
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const { experience, capital } = req.body;
    const user = await User.findById(req.user.id);
    await Trader.create({ userId: user._id, name: user.name, email: user.email, experience: Number(experience), capital: Number(capital) });
    res.status(201).json({ success: true, message: "Trader Application Submitted Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Application Failed" }); }
});

/* ================= ADMIN ROUTES ================= */

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body; 
    const trx = await Transaction.findById(id);
    if (!trx) return res.status(404).json({ success: false, message: "Transaction Not Found" });

    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    
    if (status === "rejected" && trx.type === "withdraw") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }

    trx.status = status;
    await trx.save();
    res.json({ success: true, message: `Transaction has been ${status}` });
  } catch (err) { res.status(500).json({ success: false, message: "Admin Action failed" }); }
});

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json({ success: true, users, requests, traders });
  } catch (err) { res.status(500).json({ success: false, message: "Admin Data Fetch Error" }); }
});

/* ================= START SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API is running..."));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));