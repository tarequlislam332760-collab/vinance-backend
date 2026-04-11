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
  origin: true,
  credentials: true
}));
app.use(express.json());

/* ================= DATABASE ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ Database Connected"))
  .catch(err => console.log(err));

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: "user" },
  balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String,
  amount: Number,
  symbol: String,
  method: String,
  status: { type: String, default: "pending" },
  details: String
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  experience: String,
  aum: String,
  status: { type: String, default: "approved" }
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

/* ================= ROUTES ================= */
app.get("/", (req, res) => res.send("🚀 Backend Running"));

/* ===== AUTH ===== */
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ message: "Email exists" });

    const hash = await bcrypt.hash(password, 10);

    await User.create({ name, email, password: hash });

    res.json({ success: true });
  } catch {
    res.status(500).json({ message: "Error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email });
    if (!user || !(await bcrypt.compare(req.body.password, user.password)))
      return res.status(400).json({ message: "Invalid" });

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token, user });
  } catch {
    res.status(500).json({ message: "Error" });
  }
});

/* ===== PROFILE ===== */
app.get("/api/profile", auth, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

/* ===== TRADE ===== */
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol } = req.body;
    const user = await User.findById(req.user.id);

    const numAmt = Number(amount);

    if (!numAmt || numAmt <= 0)
      return res.status(400).json({ message: "Invalid amount" });

    if (user.balance < numAmt)
      return res.status(400).json({ message: "Low balance" });

    user.balance -= numAmt;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: "trade",
      amount: numAmt,
      symbol,
      status: "approved",
      details: "Trade executed"
    });

    res.json({ success: true, balance: user.balance });
  } catch {
    res.status(500).json({ message: "Trade failed" });
  }
});

/* ===== DEPOSIT ===== */
app.post("/api/deposit", auth, async (req, res) => {
  const amount = Number(req.body.amount);

  await Transaction.create({
    userId: req.user.id,
    type: "deposit",
    amount
  });

  res.json({ success: true });
});

/* ===== WITHDRAW ===== */
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
    amount
  });

  res.json({ success: true });
});

/* ===== LOGS ===== */
app.get("/api/transactions", auth, async (req, res) => {
  const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(logs);
});

/* ===== TRADER ===== */
app.post("/api/traders/apply", auth, async (req, res) => {
  const exist = await Trader.findOne({ userId: req.user.id });

  if (exist)
    return res.json({ success: false, message: "Already applied" });

  await Trader.create({
    userId: req.user.id,
    name: req.body.name || "Trader",
    experience: "Expert",
    aum: "$0"
  });

  res.json({ success: true });
});

/* ===== ADMIN ===== */
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");
  const trx = await Transaction.find().populate("userId", "name email");
  const traders = await Trader.find();

  res.json({ users, trx, traders });
});

app.post("/api/admin/update-status", auth, adminAuth, async (req, res) => {
  const trx = await Transaction.findById(req.body.id);

  trx.status = req.body.status;
  await trx.save();

  if (trx.type === "deposit" && trx.status === "approved") {
    await User.findByIdAndUpdate(trx.userId, {
      $inc: { balance: trx.amount }
    });
  }

  if (trx.type === "withdraw" && trx.status === "rejected") {
    await User.findByIdAndUpdate(trx.userId, {
      $inc: { balance: trx.amount }
    });
  }

  res.json({ success: true });
});

/* ================= SERVER ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server Running on ${PORT}`));