import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
const allowedOrigins = [
  "https://vinance-frontend-vjqa.vercel.app",
  "https://vinance-frontend.vercel.app",
  "http://localhost:5173",
  "http://localhost:3000"
];

app.use(cors({
  origin: function (origin, callback) {
    // মোবাইল ডিভাইস বা অ্যাপ থেকে রিকোয়েস্ট আসলে origin undefined হতে পারে, তাই সেটি allow করা হয়েছে
    if (!origin || allowedOrigins.indexOf(origin) !== -1 || origin.includes("vercel.app")) {
      callback(null, true);
    } else {
      callback(new Error("CORS policy blocked this request"));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(dbURI)
  .then(() => console.log("✅ DB Connected Successfully"))
  .catch(err => console.error("❌ DB Connection Error:", err));

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
  type: { type: String }, 
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, 
  img: { type: String, default: "" },
  profit: { type: String, default: "0%" },
  winRate: { type: String, default: "0%" },
  aum: { type: String, default: "$0" },
  mdd: { type: String, default: "0%" },
  chartData: { type: String, default: "[]" },
  status: { type: String, default: "approved" } 
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
    if (!token) return res.status(401).json({ success: false, message: "No Token Provided" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") {
    next();
  } else {
    res.status(403).json({ success: false, message: "Admin access only" });
  }
};

/* ================= PUBLIC ROUTES ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API is running..."));

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return res.status(400).json({ success: false, message: "User exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: normalizedEmail, password: hashedPassword });
    res.status(201).json({ success: true, message: "Registered!" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// ✅ AI Plans Page Fix (এটি আগে ছিল না, তাই পেজ খালি দেখাত)
app.get("/api/plans", async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch (err) { res.status(500).json([]); }
});

app.get("/api/traders/all", async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json(traders);
  } catch (err) { res.status(500).json([]); }
});

/* ================= USER ROUTES ================= */
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false }); }
});

// ✅ Trade Fix (ট্রেড সফল না হওয়ার সমাধান)
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage, type } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);

    if (!numAmount || numAmount <= 0) return res.status(400).json({ success: false, message: "Invalid Amount" });
    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Low Balance" });

    user.balance -= numAmount;
    await user.save();
    
    await Transaction.create({ 
      userId: user._id, 
      type: type || "futures", 
      amount: numAmount, 
      status: "approved", 
      method: `${symbol || 'Market'} ${leverage ? leverage + 'x' : '(Spot)'}` 
    });

    res.json({ success: true, message: "Trade successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Trade failed!" }); }
});

// ✅ Investment Route (AI Plans এ ইনভেস্ট করার জন্য)
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);

    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Insufficient Funds" });

    user.balance -= numAmount;
    await user.save();

    await Investment.create({ userId: user._id, planId, amount: numAmount });
    await Transaction.create({ userId: user._id, type: "investment", amount: numAmount, status: "approved" });

    res.json({ success: true, message: "Investment successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Investment failed!" }); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  try {
    const logs = await Investment.find({ userId: req.user.id }).populate("planId");
    res.json(logs);
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

// ✅ Failed to create trader Fix
app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  try {
    const trader = await Trader.create(req.body);
    res.json({ success: true, message: "Trader Created Successfully!", trader });
  } catch (err) { res.status(500).json({ success: false, message: "Error creating trader" }); }
});

// ✅ Admin Create Plan (যাতে AI Plans পেজ খালি না থাকে)
app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    const plan = await Plan.create(req.body);
    res.json({ success: true, message: "Plan Created!", plan });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true, message: "Balance Updated!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body;
    const trx = await Transaction.findById(id);
    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));

export default app;