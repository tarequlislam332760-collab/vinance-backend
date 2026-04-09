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
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"],
  credentials: true
}));
app.use(express.json());

/* ================= DATABASE ================= */
const connectDB = async () => {
  if (mongoose.connection.readyState >= 1) return;
  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
    console.log("✅ DB Connected Successfully");
  } catch (err) {
    console.error("❌ DB Connection Error:", err);
  }
};
connectDB();

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String, 
  email: { type: String, unique: true }, 
  password: String, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, 
  minAmount: Number, 
  maxAmount: Number, 
  profitPercent: Number, 
  duration: Number, 
  status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, 
  amount: Number, 
  method: String, 
  status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, 
  img: String, 
  profit: String, 
  winRate: String, 
  aum: String, 
  mdd: String, 
  chartData: String, 
  status: { type: String, default: "approved" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Invalid Session" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin Only" });
};

/* ================= ROUTES ================= */

// ০. মেইন রুট (Cannot GET / ফিক্স করার জন্য)
app.get("/", (req, res) => {
  res.send("🚀 Vinance Backend API is Live!");
});

// ১. ট্রেডার প্রোফাইল দেখা
app.get("/api/traders/all", async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json(traders);
  } catch (err) { res.status(500).json([]); }
});

// ২. ট্রেডার তৈরি/অ্যাপ্লাই
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const existing = await Trader.findOne({ userId: req.user.id });
    if (existing) return res.status(400).json({ success: false, message: "Already applied as a trader!" });

    await Trader.create({ userId: req.user.id, ...req.body });
    res.json({ success: true, message: "Trader Created Successfully!" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to create trader" }); }
});

// ৩. ট্রেড (Spot/Future)
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, type } = req.body;
    const user = await User.findById(req.user.id);
    if (!user || user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });

    user.balance -= Number(amount);
    await user.save();

    await Transaction.create({ userId: user._id, type, amount, status: "approved" });
    res.json({ success: true, message: "Trade Successful!", newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false, message: "Trade failed!" }); }
});

/* ================= ADMIN ACTIONS ================= */

// ৪. অ্যাডমিন প্যানেল ডাটা (Users & Plans)
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const plans = await Plan.find();
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json({ success: true, users, plans, requests, traders });
  } catch (err) { res.status(500).json({ success: false }); }
});

// ৫. প্ল্যান তৈরি
app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true, message: "Plan Created!" });
  } catch (err) { res.status(500).json({ success: false, message: "Failed to create plan" }); }
});

// ৬. এডিট ও ডিলিট ট্রেডার
app.put("/api/admin/update-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Updated!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted!" });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================= AUTH ================= */
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ message: "Error fetching profile" }); }
});

export default app;