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
mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

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
  type: { type: String, enum: ["deposit", "withdraw", "investment", "sell"] },
  amount: Number, 
  method: String, 
  transactionId: String, 
  status: { type: String, default: "pending" }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, 
  status: { type: String, default: "active" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No Token" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; 
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ message: "Admin access only" });
};

/* ================= ROUTES ================= */

// 1. Auth Routes
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hashedPassword = bcrypt.hashSync(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword });
    res.status(201).json({ success: true });
  } catch (err) { res.status(500).json({ message: "Registration failed" }); }
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ message: "Wrong Info" });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user });
});

app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

// 2. Investment & Trading
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Low Balance" });

    user.balance -= Number(amount);
    await user.save();
    await Investment.create({ userId: user._id, planId, amount: Number(amount) });
    await Transaction.create({ userId: user._id, type: "investment", amount: Number(amount), status: "approved" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Trade failed" }); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  const data = await Investment.find({ userId: req.user.id }).populate("planId", "name profitPercent");
  res.json(data);
});

// 3. Admin Panel Routes (স্ক্রিনশটের সমস্যাগুলো এখানে সমাধান করা হয়েছে)
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const investments = await Investment.find().populate("userId", "name email").populate("planId", "name");
    res.json({ users, requests, investments });
  } catch (err) { res.status(500).json({ message: "Error fetching data" }); }
});

// এডমিন কর্তৃক ট্রানজাকশন অ্যাপ্রুভ (Approve/Reject Fix)
app.post("/api/admin/update-status", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body;
    const transaction = await Transaction.findById(id);
    if (!transaction) return res.status(404).json({ message: "Not found" });

    transaction.status = status;
    await transaction.save();

    // যদি ডিপোজিট অ্যাপ্রুভ হয়, ইউজারের ব্যালেন্স বাড়িয়ে দাও
    if (status === "approved" && transaction.type === "deposit") {
        await User.findByIdAndUpdate(transaction.userId, { $inc: { balance: transaction.amount } });
    }
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Update failed" }); }
});

// এডমিন কর্তৃক ব্যালেন্স আপডেট (Update Balance Fix)
app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Update failed" }); }
});

app.get("/", (req, res) => res.send("🔥 Vinance API Live!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));