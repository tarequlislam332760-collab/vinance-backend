import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();
const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

/* ================= DB CONNECTION ================= */
const dbURI = process.env.MONGO_URI || process.env.MONGODB_URI;

// এখানে সরাসরি BinanceDB ডাটাবেস নাম উল্লেখ করে দেওয়া হয়েছে যাতে কোনো ভুল না হয়
mongoose.connect(dbURI, {
  dbName: 'BinanceDB',
})
  .then(() => console.log("✅ Database Connected Successfully to BinanceDB"))
  .catch(err => {
    console.error("❌ Database Connection Error:", err.message);
    // Vercel লগে ডিটেইল এরর দেখার জন্য
  });

/* ================= MODELS ================= */
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true }, 
  email: { type: String, unique: true, required: true, lowercase: true }, 
  password: { type: String, required: true }, 
  role: { type: String, default: "user" }, 
  balance: { type: Number, default: 5000 },
  img: { type: String, default: "https://i.ibb.co/L8N4T3p/avatar.png" } 
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: String, 
  amount: Number, symbol: String, method: String, transactionId: String, 
  status: { type: String, default: "pending" }, details: String 
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model("Plan", new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, 
  duration: Number, status: { type: Boolean, default: true }
}));

const Trader = mongoose.models.Trader || mongoose.model("Trader", new mongoose.Schema({
  name: String, 
  img: { type: String, default: "https://i.ibb.co/L8N4T3p/avatar.png" }, 
  profit: { type: String, default: "0%" }, 
  winRate: { type: String, default: "0%" }, 
  aum: { type: String, default: "0" }, 
  mdd: { type: String, default: "0%" },
  status: { type: String, default: "approved" } 
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
    
    // JWT_SECRET চেক
    if (!process.env.JWT_SECRET) return res.status(500).json({ message: "Server JWT Secret Missing" });
    
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) { res.status(401).json({ success: false, message: "Session Expired" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= ROUTES ================= */

app.get("/", (req, res) => res.send("🚀 Vinance System Online - Stable Build V22"));

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword, balance: 5000 });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/login", async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email?.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ success: false, message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET);
    res.json({ success: true, token, user });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    res.json(user);
  } catch (err) { res.status(500).json({ message: "Server Error", error: err.message }); }
});

app.post("/api/profile/update", auth, async (req, res) => {
  try {
    const { name, email, password, img } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (img) user.img = img; 
    if (password && password.trim() !== "") {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save();
    const updatedUser = user.toObject();
    delete updatedUser.password;
    res.json({ success: true, message: "Profile Updated!", user: updatedUser });
  } catch (err) { 
    res.status(500).json({ success: false, message: "Update failed", error: err.message }); 
  }
});

app.post("/api/trade", auth, async (req, res) => {
  try {
    const { type, amount, symbol } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });
    user.balance -= amount;
    await user.save();
    await Transaction.create({ userId: req.user.id, type: `spot-${type}`, amount, symbol, status: "approved" });
    res.json({ success: true, message: "Trade successful" });
  } catch (err) { res.status(500).json({ message: "Trade failed", error: err.message }); }
});

app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { type, amount, symbol, leverage } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });
    user.balance -= amount;
    await user.save();
    await Transaction.create({ userId: req.user.id, type: `futures-${type}`, amount, symbol, details: `Leverage: ${leverage}`, status: "approved" });
    res.json({ success: true, message: "Futures trade successful" });
  } catch (err) { res.status(500).json({ message: "Trade failed", error: err.message }); }
});

app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });
    user.balance -= amount;
    await user.save();
    await Investment.create({ userId: req.user.id, planId, amount });
    await Transaction.create({ userId: req.user.id, type: "investment", amount, status: "approved" });
    res.json({ success: true, message: "Investment successful" });
  } catch (err) { res.status(500).json({ success: false, message: "Investment failed", error: err.message }); }
});

app.get("/api/plans", async (req, res) => {
  try { res.json(await Plan.find({ status: true })); } catch (err) { res.status(500).json([]); }
});

app.get("/api/my-investments", auth, async (req, res) => {
  try { 
    const data = await Investment.find({ userId: req.user.id }).populate("planId").sort({ createdAt: -1 });
    res.json(data); 
  } catch (err) { res.status(500).json([]); }
});

app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    await Transaction.create({ userId: req.user.id, type: "deposit", amount, method, transactionId, status: "pending" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, method, details } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });
    await Transaction.create({ userId: req.user.id, type: "withdraw", amount, method, details, status: "pending" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get("/api/transactions", auth, async (req, res) => {
  try { res.json(await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 })); } 
  catch (err) { res.status(500).json([]); }
});

app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find({ status: "approved" }).sort({ createdAt: -1 })); } 
  catch (err) { res.status(500).json([]); }
});

app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const { name, img, profit, winRate, aum, mdd } = req.body;
    await Trader.create({ name, img: img || "https://i.ibb.co/L8N4T3p/avatar.png", profit, winRate, aum, mdd, status: "pending" });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

/* ================= ADMIN ACTIONS ================= */

app.post("/api/admin/update-user", auth, adminAuth, async (req, res) => {
  try {
    const { userId, name, email, role, balance, img } = req.body;
    await User.findByIdAndUpdate(userId, { name, email, role, balance, img });
    res.json({ success: true, message: "User Updated" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete("/api/admin/delete-user/:id", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "User Deleted" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  try {
    await Trader.create({ ...req.body, status: "approved" });
    res.json({ success: true, message: "Trader Created" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/admin/update-trader", auth, adminAuth, async (req, res) => {
  try {
    const { id, name, img, profit, winRate, aum, mdd, status } = req.body;
    await Trader.findByIdAndUpdate(id, { name, img, profit, winRate, aum, mdd, status });
    res.json({ success: true, message: "Trader Updated" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    await Trader.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Trader Deleted" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true, message: "Plan Created" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.delete("/api/admin/delete-plan/:id", auth, adminAuth, async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Plan Deleted" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const [users, requests, traders, plans] = await Promise.all([
      User.find().sort({ createdAt: -1 }),
      Transaction.find().populate("userId", "name email").sort({ createdAt: -1 }),
      Trader.find().sort({ createdAt: -1 }),
      Plan.find()
    ]);
    res.json({ success: true, users, requests, traders, plans }); 
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.body.userId, { balance: Number(req.body.balance) });
    res.json({ success: true, message: "Balance Updated" });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body;
    const trx = await Transaction.findById(requestId || req.body.id);
    if (status === "approved" && trx.status !== "approved" && trx.type === "deposit") {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ success: true });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
export default app;