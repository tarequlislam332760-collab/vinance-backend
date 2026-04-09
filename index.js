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
  origin: "*"
}));
app.use(express.json());

/* ================= DATABASE CONNECTION ================= */
if (!mongoose.connections[0].readyState) {
  mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.error("❌ DB Error:", err));
}

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
  transactionId: String,
  status: { type: String, default: "pending" }
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  experience: Number,
  capital: Number,
  status: { type: String, default: "pending" }
}, { timestamps: true }));

/* ================= AUTH ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ success: false, message: "Invalid Token" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin only" });
};

/* ================= ROUTES ================= */

// ✅ Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Backend working ✅" });
});

// 🔐 Login
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid Credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      success: true,
      token,
      user: { _id: user._id, name: user.name, balance: user.balance, role: user.role }
    });
  } catch {
    res.status(500).json({ success: false });
  }
});

// 📊 Transactions
app.get("/api/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json(data);
});

// 📈 Futures Trade
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage } = req.body;
    const user = await User.findById(req.user.id);

    if (user.balance < amount) {
      return res.status(400).json({ success: false, message: "Low Balance" });
    }

    user.balance -= amount;
    await user.save();

    await Transaction.create({
      userId: user._id,
      type: "futures",
      amount,
      method: `${symbol} ${leverage}x`,
      status: "approved"
    });

    res.json({ success: true, newBalance: user.balance });
  } catch {
    res.status(500).json({ success: false });
  }
});

// 🧑‍💼 Trader Apply
app.post("/api/traders", auth, async (req, res) => {
  const { name, experience, capital } = req.body;

  await Trader.create({
    userId: req.user.id,
    name,
    experience,
    capital
  });

  res.json({ success: true });
});

// 📦 Plans
app.get("/api/plans", async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

// 🛠 Admin
app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  const users = await User.find().select("-password");
  const requests = await Transaction.find().populate("userId", "name email");
  const traders = await Trader.find();

  res.json({ success: true, users, requests, traders });
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  const { id, status } = req.body;

  const trx = await Transaction.findById(id);

  if (status === "approved" && trx.type === "deposit") {
    await User.findByIdAndUpdate(trx.userId, {
      $inc: { balance: trx.amount }
    });
  }

  trx.status = status;
  await trx.save();

  res.json({ success: true });
});

/* ================= EXPORT (IMPORTANT) ================= */
export default app;