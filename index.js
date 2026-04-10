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

/* ================= DB ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.log(err));

/* ================= MODELS ================= */
const User = mongoose.model("User", new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  role: { type: String, default: "user" },
  balance: { type: Number, default: 0 }
}, { timestamps: true }));

const Transaction = mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String,
  amount: Number,
  symbol: String,
  method: String,
  status: String,
  details: String
}, { timestamps: true }));

const Trader = mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  profit: String,
  winRate: String,
  aum: String,
  experience: String,
  status: { type: String, default: "pending" } // ✅ FIXED
}, { timestamps: true }));

/* ================= AUTH ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "No token" });

    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Unauthorized" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user.role === "admin") next();
  else res.status(403).json({ message: "Admin only" });
};

/* ================= LOGIN ================= */
app.post("/api/login", async (req, res) => {
  const user = await User.findOne({ email: req.body.email });

  if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
    return res.status(400).json({ message: "Wrong credentials" });
  }

  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);

  res.json({ token, user });
});

/* ================= TRADE FIX ================= */
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, side } = req.body;
    const user = await User.findById(req.user.id);

    const amt = Number(amount);
    if (!amt || amt <= 0) return res.status(400).json({ message: "Invalid amount" });

    // ✅ BUY
    if (side === "buy") {
      if (user.balance < amt) {
        return res.status(400).json({ message: "Insufficient balance" });
      }
      user.balance -= amt;
    }

    // ✅ SELL
    if (side === "sell") {
      user.balance += amt;
    }

    await user.save();

    await Transaction.create({
      userId: user._id,
      type: "spot",
      amount: amt,
      symbol,
      status: "completed",
      details: `${side.toUpperCase()} ${symbol}`
    });

    res.json({
      success: true,
      balance: user.balance
    });

  } catch {
    res.status(500).json({ message: "Trade error" });
  }
});

/* ================= TRADER APPLY ================= */
app.post("/api/traders/apply", auth, async (req, res) => {
  const exist = await Trader.findOne({ userId: req.user.id });
  if (exist) return res.status(400).json({ message: "Already applied" });

  const user = await User.findById(req.user.id);

  await Trader.create({
    userId: user._id,
    name: user.name,
    experience: req.body.experience,
    aum: req.body.capital,
    profit: "0%",
    winRate: "0%",
    status: "pending" // ✅ FIXED
  });

  res.json({ success: true });
});

/* ================= LOGS ================= */
app.get("/api/transactions", auth, async (req, res) => {
  const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });

  res.json({
    success: true,
    data
  });
});

/* ================= ADMIN ================= */
app.get("/api/admin/traders", auth, adminAuth, async (req, res) => {
  const traders = await Trader.find().sort({ createdAt: -1 });

  res.json({
    success: true,
    traders
  });
});

app.put("/api/admin/trader/:id", auth, adminAuth, async (req, res) => {
  await Trader.findByIdAndUpdate(req.params.id, req.body);
  res.json({ success: true });
});

app.delete("/api/admin/trader/:id", auth, adminAuth, async (req, res) => {
  await Trader.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ================= START ================= */
app.listen(5000, () => console.log("🚀 Server Running"));