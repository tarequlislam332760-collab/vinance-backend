import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

const app = express();

app.use(cors({
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"],
  credentials: true
}));

app.use(express.json());

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log(err));

/* ================= MODELS ================= */

const User = mongoose.model("User", new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: "user" },
  balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Plan = mongoose.model("Plan", new mongoose.Schema({
  name: String,
  minAmount: Number,
  maxAmount: Number,
  profitPercent: Number,
  duration: Number,
  status: { type: Boolean, default: true }
}));

const Transaction = mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, // deposit / withdraw / investment
  amount: Number,
  status: { type: String, default: "pending" }
}, { timestamps: true }));

const Investment = mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number,
  profit: { type: Number, default: 0 },
  status: { type: String, default: "active" },
  expireAt: Date
}, { timestamps: true }));

/* ================= AUTH ================= */

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No Token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
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
  const { name, email, password } = req.body;

  const hash = await bcrypt.hash(password, 10);
  await User.create({ name, email, password: hash });

  res.json({ success: true });
});

app.post("/api/login", async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });
  if (!user) return res.status(400).json({ message: "Invalid" });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(400).json({ message: "Invalid" });

  const token = jwt.sign(
    { id: user._id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );

  res.json({ token, user });
});

/* ================= USER ================= */

app.get("/api/plans", async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

app.post("/api/invest", auth, async (req, res) => {
  const { planId, amount } = req.body;

  const user = await User.findById(req.user.id);
  const plan = await Plan.findById(planId);

  if (!plan) return res.status(404).json({ message: "Plan not found" });
  if (user.balance < amount) return res.status(400).json({ message: "No balance" });

  user.balance -= amount;
  await user.save();

  const expireAt = new Date();
  expireAt.setHours(expireAt.getHours() + plan.duration);

  await Investment.create({
    userId: user._id,
    planId,
    amount,
    expireAt
  });

  await Transaction.create({
    userId: user._id,
    type: "investment",
    amount,
    status: "approved"
  });

  res.json({ success: true });
});

/* ================= DEPOSIT ================= */

app.post("/api/deposit", auth, async (req, res) => {
  const { amount } = req.body;

  const trx = await Transaction.create({
    userId: req.user.id,
    type: "deposit",
    amount,
    status: "pending"
  });

  res.json({ message: "Deposit request sent", trx });
});

/* ================= WITHDRAW ================= */

app.post("/api/withdraw", auth, async (req, res) => {
  const { amount } = req.body;

  const user = await User.findById(req.user.id);

  if (user.balance < amount) return res.status(400).json({ message: "Low balance" });

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

/* ================= ADMIN ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");

  const requests = await Transaction.find()
    .populate("userId", "name email")
    .sort({ createdAt: -1 });

  const investments = await Investment.find()
    .populate("userId", "name email")
    .populate("planId")
    .sort({ createdAt: -1 });

  res.json({ users, requests, investments });
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  const { userId, balance } = req.body;

  await User.findByIdAndUpdate(userId, { balance: Number(balance) });

  res.json({ success: true });
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  const { name, minAmount, maxAmount, profitPercent, duration } = req.body;

  await Plan.create({
    name,
    minAmount,
    maxAmount,
    profitPercent,
    duration
  });

  res.json({ success: true });
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  const { requestId, status } = req.body;

  const trx = await Transaction.findById(requestId);

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

/* ================= SERVER ================= */

app.get("/", (req, res) => {
  res.send("🔥 Vinance Backend Running");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log("Server running:", PORT));