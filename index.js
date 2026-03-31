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
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.use(express.json());

// OPTIONS রিকোয়েস্ট ফিক্স
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') return res.status(200).end();
  next();
});

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.error("❌ DB Error:", err.message));

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
  type: { type: String, enum: ["deposit", "withdraw", "investment", "profit"] }, 
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" }, expireAt: Date
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ message: "No Token Provided" });
    
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or Expired Token" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ message: "Admin access only" });
};

/* ================= ROUTES ================= */

app.get("/", (req, res) => res.send("🔥 Vinance API Live"));

// --- AUTH ---
app.post("/api/register", async (req, res) => {
  try {
    let { name, email, password } = req.body;
    const salt = bcrypt.genSaltSync(10);
    const hashedPassword = bcrypt.hashSync(password, salt);
    await User.create({ name, email: email.toLowerCase().trim(), password: hashedPassword });
    res.status(201).json({ success: true, message: "Registered!" });
  } catch (err) { res.status(500).json({ message: "Register error" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !bcrypt.compareSync(password, user.password)) {
        return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ message: "Login error" }); }
});

// --- USER & INVESTMENT DATA ---
app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

app.get("/api/plans", async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

app.get("/api/my-investments", auth, async (req, res) => {
  const items = await Investment.find({ userId: req.user.id }).populate("planId");
  res.json(items);
});

app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);
    
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Insufficient balance" });

    user.balance -= Number(amount);
    await user.save();

    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + (plan.duration || 24));

    await Investment.create({ userId: user._id, planId, amount: Number(amount), expireAt });
    await Transaction.create({ userId: user._id, type: "investment", amount: Number(amount), status: "approved" });
    
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Trade failed" }); }
});

// --- ADMIN ROUTES ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");
  const transactions = await Transaction.find().populate("userId", "name email");
  const investments = await Investment.find().populate("userId", "name email").populate("planId");
  res.json({ users, transactions, investments });
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));