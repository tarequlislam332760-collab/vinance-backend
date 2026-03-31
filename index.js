import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

app.use(cors({
  origin: ["https://vinance-frontend-vjqa.vercel.app", "https://vinance-frontend.vercel.app", "http://localhost:5173"],
  credentials: true
}));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI).then(() => console.log("✅ DB Connected"));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String, role: { type: String, default: "user" }, balance: { type: Number, default: 0 }
}));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String, enum: ["deposit", "withdraw", "investment"] },
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No Token" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Token" }); }
};

/* ================= ROUTES (Fixing your Errors) ================= */

// ১. ট্রেড/ইনভেস্ট ফিক্স (Trade Failed এরর সমাধান)
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Low Balance" });

    user.balance -= Number(amount);
    await user.save();
    await Investment.create({ userId: user._id, planId, amount });
    await Transaction.create({ userId: user._id, type: "investment", amount, status: "approved" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Trade failed" }); }
});

// ২. উইথড্র ফিক্স (Withdrawal Failed সমাধান)
app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });
    
    await Transaction.create({ userId: user._id, type: "withdraw", amount, method, transactionId: address });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Withdrawal Failed" }); }
});

// ৩. ডিপোজিট ফিক্স (Failed to Submit সমাধান)
app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({ userId: req.user.id, type: "deposit", amount, method, transactionId });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Failed to submit" }); }
});

// ৪. অ্যাডমিন ব্যালেন্স আপডেট (Error updating balance সমাধান)
app.post("/api/admin/update-balance", auth, async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const user = await User.findById(userId);
    user.balance = Number(amount);
    await user.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ message: "Error updating balance" }); }
});

// ৫. ডাটা গেট রুটস (No Transactions/Data found সমাধান)
app.get("/api/my-transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

app.get("/api/admin/all-data", auth, async (req, res) => {
  const transactions = await Transaction.find().populate("userId", "name email");
  const investments = await Investment.find().populate("userId planId");
  res.json({ transactions, investments });
});

app.get("/api/plans", async (req, res) => {
  res.json(await Plan.find({ status: true }));
});

app.post("/api/login", async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ message: "Wrong Info" });
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    res.json({ token, user });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on ${PORT}`));