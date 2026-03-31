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
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

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
  duration: Number, // Hours
  status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, enum: ["deposit", "withdraw", "investment", "profit"] }, 
  amount: Number,
  method: String, // e.g., bKash, Binance
  transactionId: String,
  status: { type: String, default: "pending" }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number,
  status: { type: String, default: "active" },
  expireAt: Date
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No Token" });

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid Token" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ message: "Admin only access" });
};

/* ================= AUTH ROUTES ================= */
app.post("/api/register", async (req, res) => {
  try {
    let { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ message: "All fields required" });
    email = email.toLowerCase().trim();
    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ message: "Email already exists" });
    const hash = await bcrypt.hash(password, 10);
    await User.create({ name, email, password: hash });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Register error" }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "Invalid Credentials" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid Credentials" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, user: { id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch { res.status(500).json({ message: "Login error" }); }
});

/* ================= USER ROUTES ================= */
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch { res.status(500).json({ message: "Error fetching profile" }); }
});

app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (user.balance < Number(amount)) return res.status(400).json({ message: "No balance" });

    user.balance -= Number(amount);
    await user.save();

    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + Number(plan.duration));

    await Investment.create({ userId: user._id, planId, amount: Number(amount), status: "active", expireAt });
    await Transaction.create({ userId: user._id, type: "investment", amount: Number(amount), status: "approved" });
    
    res.json({ success: true });
  } catch { res.status(500).json({ message: "Invest error" }); }
});

/* ================= ADMIN ROUTES ================= */

// 🔥 এই ফাংশনটি অ্যাডমিন প্যানেলের সব ডাটা একসাথে পাঠাবে
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password").sort({ createdAt: -1 });
    
    // Populate করা হয়েছে যাতে ফ্রন্টএন্ডে ইউজারের নাম ও ইমেইল দেখা যায়
    const requests = await Transaction.find()
      .populate("userId", "name email")
      .sort({ createdAt: -1 });
      
    const investments = await Investment.find()
      .populate("userId", "name email")
      .populate("planId", "name profitPercent")
      .sort({ createdAt: -1 });

    // ফ্রন্টএন্ড যেভাবে ডাটা খোঁজে সেই ফরম্যাটেই পাঠানো হচ্ছে
    res.json({ 
      users: users || [], 
      requests: requests || [], 
      investments: investments || [] 
    });
  } catch (err) { 
    console.error("Admin data error:", err);
    res.status(500).json({ message: "Admin data error" }); 
  }
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body;
    const trx = await Transaction.findById(requestId);
    if (!trx || trx.status !== "pending") return res.status(400).json({ message: "Request already processed" });

    // ডিপোজিট অ্যাপ্রুভ হলে ব্যালেন্স অ্যাড হবে
    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    
    // উইথড্র রিজেক্ট হলে কাটা টাকা ফেরত যাবে
    if (status === "rejected" && trx.type === "withdraw") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }

    trx.status = status;
    await trx.save();
    res.json({ success: true });
  } catch (err) { 
    res.status(500).json({ message: "Request handle error" }); 
  }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true });
  } catch { res.status(500).json({ message: "Update balance error" }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true });
  } catch { res.status(500).json({ success: false }); }
});

/* ================= SERVER ================= */
app.get("/", (req, res) => { res.send("🔥 Vinance API is running and healthy"); });

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));