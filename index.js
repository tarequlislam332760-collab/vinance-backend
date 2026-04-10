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
  origin: "*", 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
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

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String }, 
  amount: Number, 
  method: String, 
  status: { type: String, default: "approved" }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, img: String, profit: String, winRate: String, status: { type: String, default: "approved" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
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
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= TRADE LOGIC FIX ================= */

// ✅ কমন ট্রেড ফাংশন (Spot এবং Future উভয়ের জন্য)
const processTrade = async (req, res) => {
  try {
    const { amount, symbol, leverage, type, side } = req.body; 
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);
    
    if (!numAmount || numAmount <= 0) return res.status(400).json({ success: false, message: "সঠিক পরিমাণ লিখুন" });
    
    // ব্যালেন্স চেক (Buy বা Long এর ক্ষেত্রে ব্যালেন্স কাটা হবে)
    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "পর্যাপ্ত ব্যালেন্স নেই" });

    // ব্যালেন্স আপডেট
    user.balance -= numAmount;
    await user.save();
    
    // ট্রানজেকশন রেকর্ড তৈরি
    await Transaction.create({ 
      userId: user._id, 
      type: type || "spot", // spot or futures
      amount: numAmount, 
      status: "approved", 
      method: `${side?.toUpperCase() || 'BUY'} ${symbol || 'Market'} ${leverage ? leverage + 'x' : ''}` 
    });

    res.json({ 
      success: true, 
      message: `${side?.toUpperCase() || 'Trade'} Successful!`, 
      newBalance: user.balance 
    });
  } catch (err) { 
    console.error(err);
    res.status(500).json({ success: false, message: "ট্রেড সফল হয়নি!" }); 
  }
};

// এই একটি রুট দিয়েই সব ধরণের ট্রেড হ্যান্ডেল হবে
app.post("/api/futures/trade", auth, processTrade);
app.post("/api/trade", auth, processTrade); // অতিরিক্ত রুট ব্যাকআপ হিসেবে

/* ================= AUTH ROUTES ================= */

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
    res.json({ success: true, token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

/* ================= OTHER ROUTES ================= */

app.post("/api/deposit", auth, async (req, res) => {
  await Transaction.create({ userId: req.user.id, type: "deposit", amount: Number(req.body.amount), method: req.body.method, transactionId: req.body.transactionId });
  res.json({ success: true, message: "Deposit Submitted!" });
});

app.get("/api/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

app.get("/api/plans", async (req, res) => res.json(await Plan.find({ status: true })));

/* ================= ADMIN ACTIONS ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");
  const requests = await Transaction.find().populate("userId", "name email");
  res.json({ success: true, users, requests });
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.body.userId, { balance: Number(req.body.balance) });
  res.json({ success: true, message: "Updated!" });
});

/* ================= START SERVER ================= */
app.get("/", (req, res) => res.send("🚀 Vinance API Live"));
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Port ${PORT}`));

export default app;