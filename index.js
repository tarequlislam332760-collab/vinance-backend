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
  origin: [
    "https://vinance-frontend-vjqa.vercel.app",
    "https://vinance-frontend.vercel.app",
    "http://localhost:5173"
  ],
  credentials: true
}));
app.use(express.json());

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.log(err));

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
  type: { type: String, enum: ["deposit", "withdraw", "investment"] },
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

/* ================= AUTH ================= */
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
  else res.status(403).json({ message: "Admin only" });
};

/* ================= AUTH ROUTES ================= */

app.post("/api/register", async (req, res) => {
  try {
    let { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields required" });

    email = email.toLowerCase().trim();

    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ message: "Email exists" });

    const hash = await bcrypt.hash(password, 10);

    await User.create({ name, email, password: hash });

    res.json({ success: true });

  } catch {
    res.status(500).json({ message: "Register error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(400).json({ message: "Invalid" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Invalid" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user });

  } catch {
    res.status(500).json({ message: "Login error" });
  }
});

/* ================= USER APIs ================= */

// 🔥 Profile
app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

// 🔥 Transactions
app.get("/api/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id })
    .sort({ createdAt: -1 });
  res.json(data);
});

// 🔥 Investments (logs)
app.get("/api/investments", auth, async (req, res) => {
  const data = await Investment.find({ userId: req.user.id })
    .populate("planId", "name profitPercent")
    .sort({ createdAt: -1 });
  res.json(data);
});

// 🔥 Plans
app.get("/api/plans", async (req, res) => {
  res.json(await Plan.find({ status: true }));
});

/* ================= ACTION APIs ================= */

// Deposit
app.post("/api/deposit", auth, async (req, res) => {
  const { amount, method, transactionId } = req.body;

  await Transaction.create({
    userId: req.user.id,
    type: "deposit",
    amount: Number(amount),
    method,
    transactionId
  });

  res.json({ success: true });
});

// Withdraw (FIXED)
app.post("/api/withdraw", auth, async (req, res) => {
  const amount = Number(req.body.amount);

  const user = await User.findById(req.user.id);

  if (user.balance < amount)
    return res.status(400).json({ message: "Low balance" });

  user.balance -= amount;
  await user.save();

  await Transaction.create({
    userId: user._id,
    type: "withdraw",
    amount,
    status: "pending"
  });

  res.json({ success: true });
});

// 🔥 Invest (TRADE FIXED)
app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;

    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);

    if (!plan) return res.status(404).json({ message: "Plan not found" });

    if (user.balance < amount)
      return res.status(400).json({ message: "Insufficient balance" });

    user.balance -= amount;
    await user.save();

    await Investment.create({
      userId: user._id,
      planId,
      amount
    });

    await Transaction.create({
      userId: user._id,
      type: "investment",
      amount,
      status: "approved"
    });

    res.json({ success: true });

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Trade failed" });
  }
});

/* ================= ADMIN ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");

  const requests = await Transaction.find()
    .populate("userId", "name email")
    .sort({ createdAt: -1 });

  const investments = await Investment.find()
    .populate("userId", "name email")
    .populate("planId", "name");

  res.json({ users, requests, investments });
});

// Approve / Reject
app.post("/api/admin/update-status", auth, adminAuth, async (req, res) => {
  const { id, status } = req.body;

  const trx = await Transaction.findById(id);

  if (status === "approved" && trx.type === "deposit") {
    await User.findByIdAndUpdate(trx.userId, {
      $inc: { balance: trx.amount }
    });
  }

  if (status === "rejected" && trx.type === "withdraw") {
    await User.findByIdAndUpdate(trx.userId, {
      $inc: { balance: trx.amount }
    });
  }

  trx.status = status;
  await trx.save();

  res.json({ success: true });
});

// Balance update
app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.body.userId, {
    balance: Number(req.body.balance)
  });

  res.json({ success: true });
});

// Create plan
app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  await Plan.create(req.body);
  res.json({ success: true });
});

/* ================= SERVER ================= */
app.get("/", (req, res) => {
  res.send("🔥 Vinance Backend Running");
});

app.listen(process.env.PORT || 5000);