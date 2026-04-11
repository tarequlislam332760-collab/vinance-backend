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
// নিশ্চিত করুন আপনার Vercel settings-এ MONGO_URI দেওয়া আছে
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;
mongoose.connect(dbURI)
  .then(() => console.log("✅ Database Connected"))
  .catch(err => console.error("❌ Database Connection Error:", err));

/* ================= MODELS ================= */
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true }, 
  email: { type: String, unique: true, required: true, lowercase: true, trim: true }, 
  password: { type: String, required: true }, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 0 }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, amount: Number, symbol: String, method: String, transactionId: String, status: { type: String, default: "pending" }, details: String 
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  name: String, experience: String, aum: String, status: { type: String, default: "approved" }, profit: { type: String, default: "0%" }, winRate: { type: String, default: "0%" }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model("Investment", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number, status: { type: String, default: "active" }
}, { timestamps: true }));

/* ================= AUTH MIDDLEWARES ================= */
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token" });
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Session Expired" }); }
};

/* ================= ROUTES ================= */

app.get("/", (req, res) => res.send("🚀 Vinance API Live"));

// --- ✅ রেজিস্ট্রেশন (Fixed) ---
app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ success: false, message: "সব তথ্য দিন" });

    const cleanEmail = email.toLowerCase().trim();
    const exists = await User.findOne({ email: cleanEmail });
    if (exists) return res.status(400).json({ success: false, message: "ইমেইলটি আগে থেকেই ব্যবহৃত" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = await User.create({ name, email: cleanEmail, password: hashedPassword });
    
    res.json({ success: true, message: "Registration successful" });
  } catch (err) {
    console.error("Register Error:", err);
    res.status(500).json({ success: false, message: "সার্ভার এরর" });
  }
});

// --- ✅ লগইন (Fixed) ---
app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "ইমেইল এবং পাসওয়ার্ড দিন" });

    const cleanEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: cleanEmail });
    if (!user) return res.status(400).json({ success: false, message: "ইউজার পাওয়া যায়নি" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: "পাসওয়ার্ড ভুল" });

    // টোকেন তৈরি (JWT_SECRET অবশ্যই Vercel env-এ থাকতে হবে)
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });

    res.json({ 
      success: true, 
      token, 
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, balance: user.balance } 
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "লগইন ব্যর্থ হয়েছে" });
  }
});

// --- প্রোফাইল ---
app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- ট্রেড, ডিপোজিট, উইথড্র (আগের মতোই) ---
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { amount, symbol, leverage, side } = req.body; 
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Check balance" });

    user.balance -= Number(amount);
    await user.save();
    await Transaction.create({ userId: user._id, type: "futures", amount, symbol, status: "approved", details: `${side} trade` });
    res.json({ success: true, newBalance: user.balance });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/deposit", auth, async (req, res) => {
  try {
    await Transaction.create({ ...req.body, userId: req.user.id, type: "deposit" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Low balance" });
    user.balance -= Number(amount);
    await user.save();
    await Transaction.create({ ...req.body, userId: req.user.id, type: "withdraw" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false }); }
});

// --- পাবলিক ডাটা ---
app.get("/api/plans", async (req, res) => res.json(await Plan.find()));
app.get("/api/traders/all", async (req, res) => res.json(await Trader.find()));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 API on Port ${PORT}`));

export default app;