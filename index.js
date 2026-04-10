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
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use(express.json());

/* ================= DB CONNECTION ================= */
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

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
  type: String, // spot, futures, investment
  amount: Number,
  symbol: String,
  method: String,
  status: { type: String, default: "completed" },
  details: String
}, { timestamps: true }));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String,
  profit: { type: String, default: "0%" },
  winRate: { type: String, default: "0%" },
  aum: String,
  experience: String,
  status: { type: String, default: "approved" } // সরাসরি অ্যাপ্রুভড হবে যাতে অ্যাডমিন প্যানেলে দেখা যায়
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARE ================= */
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
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ message: "Admin only access" });
};

/* ================= ROUTES ================= */

// --- LOGIN ---
app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ message: "Wrong credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    res.json({ success: true, token, user: { _id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ✅ SPOT BUY/SELL FIX (এখন এরর আসবে না) ---
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, side } = req.body;
    const user = await User.findById(req.user.id);
    const amt = Number(amount);

    if (!amt || amt <= 0) return res.status(400).json({ message: "অ্যামাউন্ট লিখুন" });

    if (side === "buy") {
      if (user.balance < amt) return res.status(400).json({ message: "ব্যালেন্স কম" });
      user.balance -= amt;
    } else {
      user.balance += amt;
    }

    await user.save();

    // ✅ Logs এ ডাটা সেভ করা (যাতে পেজ খালি না থাকে)
    await Transaction.create({
      userId: user._id,
      type: "spot",
      amount: amt,
      symbol: symbol || "BTC",
      status: "completed",
      details: `${side.toUpperCase()} ${symbol || 'Market'}`
    });

    res.json({ success: true, balance: user.balance, message: "ট্রেড সফল হয়েছে" });
  } catch (err) {
    res.status(500).json({ message: "ট্রেড এরর" });
  }
});

// --- ✅ TRADER APPLY (Become a Lead) ---
app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const exist = await Trader.findOne({ userId: req.user.id });
    if (exist) return res.status(400).json({ message: "ইতিমধ্যেই আবেদন করেছেন" });

    const user = await User.findById(req.user.id);
    await Trader.create({
      userId: user._id,
      name: user.name,
      experience: req.body.experience,
      aum: req.body.capital,
      status: "approved"
    });

    res.json({ success: true, message: "আবেদন সফল" });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

// --- ✅ LOGS PAGE FIX (Data showing) ---
app.get("/api/transactions", auth, async (req, res) => {
  try {
    const data = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(data); // সরাসরি ডাটা পাঠানো হচ্ছে যাতে ফ্রন্টএন্ড সহজে পায়
  } catch (err) { res.status(500).json([]); }
});

// --- ✅ ADMIN MANAGEMENT (Edit/Delete Trader) ---
app.get("/api/admin/traders", auth, adminAuth, async (req, res) => {
  try {
    const traders = await Trader.find().sort({ createdAt: -1 });
    res.json({ success: true, traders });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.put("/api/admin/trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndUpdate(req.params.id, req.body);
    res.json({ success: true, message: "Updated" });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) { res.status(500).json({ success: false }); }
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server Running on ${PORT}`));

export default app;