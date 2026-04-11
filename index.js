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
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  email: { type: String, unique: true, required: true, lowercase: true }, 
  password: { type: String, required: true }, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 5000 } 
}, { timestamps: true });

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, 
  amount: Number, symbol: String, method: String, transactionId: String, 
  status: { type: String, default: "pending" }, details: String 
}, { timestamps: true });

const PlanSchema = new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, 
  duration: Number, status: { type: Boolean, default: true }
});

const TraderSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, img: { type: String, default: "" }, 
  profit: { type: String, default: "0%" }, winRate: { type: String, default: "0%" }, 
  aum: { type: String, default: "0" }, mdd: { type: String, default: "0%" },
  chartData: { type: String, default: "" }, experience: String, status: { type: String, default: "approved" } 
}, { timestamps: true });

const InvestmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);
const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", TransactionSchema);
const Plan = mongoose.models.Plan || mongoose.model("Plan", PlanSchema);
const Trader = mongoose.models.Trader || mongoose.model("Trader", TraderSchema);
const Investment = mongoose.models.Investment || mongoose.model("Investment", InvestmentSchema);

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

// --- AUTH & PROFILE ---
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword, balance: 5000 });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
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

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ message: "Server Error" }); }
});

// ✅ Profile Update (Fixed 404 & Password update logic)
app.post("/api/profile/update", auth, async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let updateObj = { name, email: email?.toLowerCase() };
    if (password) updateObj.password = await bcrypt.hash(password, 10);
    const updated = await User.findByIdAndUpdate(req.user.id, updateObj, { new: true }).select("-password");
    res.json({ success: true, user: updated });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- TRADING & INVEST ---
app.get("/api/plans", async (req, res) => {
  try {
    const plans = await Plan.find();
    res.json(plans);
  } catch (err) { res.status(500).json([]); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  try {
    const data = await Investment.find({ userId: req.user.id }).populate("planId").sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json([]); }
});

// --- TRANSACTIONS ---
app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.balance < req.body.amount) return res.status(400).json({ success: false, message: "Insufficient balance" });
    user.balance -= req.body.amount;
    await user.save();
    await Transaction.create({ ...req.body, userId: req.user.id, type: "withdraw", status: "pending" });
    res.json({ success: true, newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data);
  } catch (err) { res.status(500).json([]); }
});

// --- ADMIN API (FIXED ALL 404 & 500) ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    const plans = await Plan.find();
    const investments = await Investment.find().populate("userId planId").sort({ createdAt: -1 });
    res.json({ success: true, users, requests, traders, plans, investments });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ Admin Balance Update (Fixed)
app.put("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ Admin Handle Request (Deposit Approve/Reject)
app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body;
    const trx = await Transaction.findById(requestId);
    if (!trx) return res.status(404).json({ success: false });

    if (status === "approved" && trx.status !== "approved") {
      if (trx.type === "deposit") {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      }
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ Admin Create Plan (Fixed 404)
app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/traders/all", async (req, res) => {
  try {
    const traders = await Trader.find({ status: "approved" });
    res.json(traders);
  } catch (err) { res.status(500).json([]); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
export default app;