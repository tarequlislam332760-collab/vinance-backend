import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(dbURI)
  .then(() => console.log("✅ Database Connected Successfully"))
  .catch(err => console.error("❌ Database Connection Error:", err));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true }, 
  email: { type: String, unique: true, required: true, lowercase: true }, 
  password: { type: String, required: true }, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 5000 } 
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, 
  amount: Number, symbol: String, method: String, transactionId: String, 
  status: { type: String, default: "pending" }, details: String 
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, 
  duration: Number, status: { type: Boolean, default: true }
}));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, img: { type: String, default: "" }, 
  profit: { type: String, default: "0%" }, winRate: { type: String, default: "0%" }, 
  aum: { type: String, default: "0" }, mdd: { type: String, default: "0%" },
  chartData: { type: String, default: "" }, experience: String, status: { type: String, default: "approved" } 
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
  } catch (err) { res.status(401).json({ success: false, message: "Session Expired" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= ROUTES ================= */

app.get("/", (req, res) => res.send("🚀 Vinance System Online - Stable Build"));

// --- AUTH ---
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword, balance: 5000 });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    res.json({ success: true, token, user });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- USER PROFILE & ACTIONS ---
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ message: "Server Error" }); }
});

app.post("/api/profile/update", auth, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let updateObj = { name, email: email?.toLowerCase() };
    if (password) updateObj.password = await bcrypt.hash(password, 10);
    const updated = await User.findByIdAndUpdate(req.user.id, updateObj, { new: true }).select("-password");
    res.json({ success: true, user: updated });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ FIX 404: Added Transactions Route
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json([]); }
});

// ✅ FIX 404: Added Withdraw Route
app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.balance < req.body.amount) return res.status(400).json({ success: false, message: "Low Balance" });
    user.balance -= req.body.amount;
    await user.save();
    await Transaction.create({ ...req.body, userId: req.user.id, type: "withdraw", status: "pending" });
    res.json({ success: true, newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/deposit", auth, async (req, res) => {
  try {
    await Transaction.create({ ...req.body, userId: req.user.id, type: "deposit", status: "pending" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, type } = req.body;
    const user = await User.findById(req.user.id);
    if(user.balance < amount) return res.status(400).json({ success: false });
    user.balance -= amount;
    await user.save();
    await Transaction.create({ userId: user._id, amount, type: type || "trade", status: "approved" });
    res.json({ success: true, newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if(user.balance < req.body.amount) return res.status(400).json({ success: false });
    user.balance -= req.body.amount;
    await user.save();
    await Transaction.create({ ...req.body, userId: req.user.id, type: "futures", status: "approved" });
    res.json({ success: true, newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ success: false });
    user.balance -= amount;
    await user.save();
    await Investment.create({ userId: req.user.id, planId, amount });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  try {
    const data = await Investment.find({ userId: req.user.id }).populate("planId").sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json([]); }
});

// --- DATA FETCHING ---
app.get("/api/plans", async (req, res) => {
  try { res.json(await Plan.find()); } catch (err) { res.status(500).json([]); }
});

app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find({ status: "approved" })); } catch (err) { res.status(500).json([]); }
});

app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    await Trader.create({ userId: req.user.id, ...req.body, status: "pending" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ADMIN API ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const [users, requests, traders, plans, investments] = await Promise.all([
      User.find().sort({ createdAt: -1 }),
      Transaction.find().populate("userId", "name email").sort({ createdAt: -1 }),
      Trader.find().sort({ createdAt: -1 }),
      Plan.find(),
      Investment.find().populate("userId planId").sort({ createdAt: -1 })
    ]);
    res.json({ success: true, users, requests, traders, plans, investments });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ FIX 404: Using app.put as called by frontend
app.put("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.body.userId, { balance: Number(req.body.balance) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ FIX 500: Logic for handling status update
app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body;
    const trx = await Transaction.findById(requestId);
    if (!trx) return res.status(404).json({ success: false });
    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ FIX 500: Trader Creation
app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  try {
    await Trader.create({ ...req.body, status: "approved" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
export default app; 