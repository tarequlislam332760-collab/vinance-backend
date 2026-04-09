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
  origin: "*", // ক্লায়েন্টের কাজের সুবিধার্থে সাময়িকভাবে সব এলাউ করা হলো
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(dbURI)
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.error("❌ DB Error:", err));

/* ================= MODELS ================= */
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

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, email: String, experience: Number, capital: Number, status: { type: String, default: "pending" } 
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin only" });
};

/* ================= ROUTES ================= */

// Register & Login (Fixed Email Normalization)
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) return res.status(400).json({ success: false, message: "User exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword });
    res.status(201).json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ success: false, message: "Invalid credentials" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

// Financials (Fixed Number Conversions)
app.post("/api/deposit", auth, async (req, res) => {
  try {
    await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(req.body.amount), method: req.body.method, transactionId: req.body.transactionId });
    res.json({ success: true, message: "Deposit Submitted!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.balance < Number(req.body.amount)) return res.status(400).json({ success: false, message: "Low Balance" });
    user.balance -= Number(req.body.amount);
    await user.save();
    await Transaction.create({ userId: req.user.id, type: "withdraw", amount: Number(req.body.amount), method: req.body.method, transactionId: req.body.address });
    res.json({ success: true, newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

// Investment (Fixed Empty Page Problem)
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ success: false, message: "Insufficient Funds" });
    user.balance -= Number(amount);
    await user.save();
    await Investment.create({ userId: user._id, planId, amount: Number(amount) });
    await Transaction.create({ userId: user._id, type: "investment", amount: Number(amount), status: "approved" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  const logs = await Investment.find({ userId: req.user.id }).populate("planId");
  res.json(logs);
});

app.get("/api/plans", async (req, res) => {
  res.json(await Plan.find({ status: true }));
});

app.get("/api/transactions", auth, async (req, res) => {
  res.json(await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 }));
});

// Trader (Fixed "Already Applied" Error)
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const existing = await Trader.findOne({ userId: req.user.id });
    if (existing) return res.status(400).json({ success: false, message: "Already applied!" });
    await Trader.create({ userId: req.user.id, ...req.body });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================= ADMIN ================= */
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");
  const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
  const traders = await Trader.find().sort({ createdAt: -1 });
  res.json({ success: true, users, requests, traders });
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.body.userId, { balance: Number(req.body.balance) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  const { id, status } = req.body;
  const trx = await Transaction.findById(id);
  if (status === "approved" && trx.type === "deposit") {
    await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
  }
  trx.status = status;
  await trx.save();
  res.json({ success: true });
});

app.delete("/api/admin/delete-user/:id", auth, adminAuth, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  await Plan.create(req.body);
  res.json({ success: true });
});

app.get("/", (req, res) => res.send("🚀 Vinance API Live"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));