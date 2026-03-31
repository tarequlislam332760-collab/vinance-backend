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
  type: { type: String, enum: ["deposit", "withdraw", "investment", "sell"] },
  amount: Number, method: String, transactionId: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" },
  expireAt: Date
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

// --- ইনভেস্টমেন্ট তৈরি (Fixed logic) ---
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);

    if (!plan) return res.status(404).json({ message: "Plan not found" });
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });

    user.balance -= amount;
    await user.save();

    const expireAt = new Date();
    expireAt.setHours(expireAt.getHours() + (plan.duration || 24));

    await Investment.create({
      userId: user._id,
      planId: plan._id,
      amount,
      expireAt
    });

    await Transaction.create({
      userId: user._id,
      type: "investment",
      amount,
      status: "approved",
      method: plan.name
    });

    res.status(201).json({ message: "Investment successful" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- ইউজার লগস (My Investment Logs Fix) ---
app.get("/api/my-investments", auth, async (req, res) => {
  try {
    const data = await Investment.find({ userId: req.user.id }).populate("planId");
    res.json(data);
  } catch (err) { res.status(500).json({ message: "Logs error" }); }
});

// --- অ্যাডমিন প্যানেল লগস (Admin All Data Fix) ---
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select("-password");
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const investments = await Investment.find().populate("userId", "name email").populate("planId", "name");
    res.json({ users, requests, investments });
  } catch (err) { res.status(500).json({ message: "Error fetching data" }); }
});

// --- অ্যাডমিন রিজেক্ট/অ্যাপ্রুভ (Approve Reject Fix) ---
app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body; // ফ্রন্টএন্ড থেকে আইডি এবং স্ট্যাটাস আসবে
    const transaction = await Transaction.findById(id);
    if (!transaction) return res.status(404).json({ message: "Not found" });

    transaction.status = status;
    await transaction.save();

    // ডিপোজিট অ্যাপ্রুভ হলে ব্যালেন্স অ্যাড হবে
    if (status === "approved" && transaction.type === "deposit") {
      await User.findByIdAndUpdate(transaction.userId, { $inc: { balance: transaction.amount } });
    }
    res.json({ success: true, message: `Request ${status} successfully` });
  } catch (err) { res.status(500).json({ message: "Update failed" }); }
});

// --- বেসিক এপিআই রুটস ---
app.get("/api/profile", auth, async (req, res) => {
  res.json(await User.findById(req.user.id).select("-password"));
});

app.get("/api/plans", async (req, res) => {
  res.json(await Plan.find({ status: true }));
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !bcrypt.compareSync(password, user.password)) return res.status(400).json({ message: "Wrong Info" });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
  res.json({ token, user });
});

app.get("/", (req, res) => res.send("🔥 API Live!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on ${PORT}`));