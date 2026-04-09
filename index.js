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
  credentials: true
}));
app.use(express.json());

/* ================= DATABASE CONNECTION ================= */
if (mongoose.connection.readyState === 0) {
  mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI)
    .then(() => console.log("✅ DB Connected Successfully"))
    .catch(err => console.error("❌ DB Error:", err));
}

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String, role: { type: String, default: "user" }, balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, amount: Number, method: String, status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, experience: Number, capital: Number, status: { type: String, default: "pending" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token Found" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Invalid Session" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin Only" });
};

/* ================= ROUTES ================= */

// ১. প্রোফাইল (Error 404 fix)
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch { res.status(500).json({ message: "Error" }); }
});

// ২. ট্রেড (Buy/Sell/Future - Error 404 fix)
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage, type } = req.body; // type: buy or sell
    const user = await User.findById(req.user.id);
    const numAmount = Number(amount);

    if (user.balance < numAmount) return res.status(400).json({ success: false, message: "Insufficient Balance" });

    user.balance -= numAmount;
    await user.save();

    await Transaction.create({
      userId: user._id, type: "futures", amount: numAmount, method: `${symbol} ${leverage}x (${type})`, status: "approved"
    });

    res.json({ success: true, message: `${type.toUpperCase()} Order Placed Successfully!`, newBalance: user.balance });
  } catch { res.status(500).json({ success: false, message: "Trade Failed" }); }
});

// ৩. ইনভেস্টমেন্ট (Investment/Plan - Error 404 fix)
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { amount, planName } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ success: false, message: "Low Balance" });

    user.balance -= Number(amount);
    await user.save();

    await Transaction.create({ userId: user._id, type: "investment", amount, method: planName, status: "approved" });
    res.json({ success: true, message: "Investment Successful!", newBalance: user.balance });
  } catch { res.status(500).json({ success: false }); }
});

// ৪. ট্রেডার অ্যাপ্লাই ও লিস্ট (Admin/User Fix)
app.post("/api/traders", auth, async (req, res) => {
  try {
    const { name, experience, capital } = req.body;
    await Trader.create({ userId: req.user.id, name, experience: Number(experience), capital: Number(capital) });
    res.json({ success: true, message: "Trader Request Sent Successfully!" });
  } catch { res.status(500).json({ success: false }); }
});

app.get("/api/traders/all", auth, async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json(traders);
  } catch { res.status(500).json([]); }
});

// ৫. ট্রানজেকশন লগস
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data);
  } catch { res.status(500).json([]); }
});

// ৬. লগইন
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch { res.status(500).json({ success: false }); }
});

/* ================= ADMIN ONLY ACTIONS ================= */

// ৭. সব ডাটা ফেচ (Admin Dashboard)
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    const requests = await Transaction.find().populate("userId", "name email").sort({ createdAt: -1 });
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json({ success: true, users, requests, traders });
  } catch { res.status(500).json({ success: false }); }
});

// ৮. ইউজার আপডেট (অ্যাডমিন প্যানেল থেকে ব্যালেন্স/রোল চেঞ্জ)
app.post("/api/admin/update-user", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance, role } = req.body;
    await User.findByIdAndUpdate(userId, { balance, role });
    res.json({ success: true, message: "User Updated Successfully!" });
  } catch { res.status(500).json({ success: false }); }
});

// ৯. রিকোয়েস্ট হ্যান্ডেল (Deposit/Withdraw Approve)
app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { id, status } = req.body;
    const trx = await Transaction.findById(id);
    if (status === "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true, message: `Request ${status}!` });
  } catch { res.status(500).json({ success: false }); }
});

/* ================= EXPORT ================= */
export default app;