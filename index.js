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
if (!dbURI) console.error("❌ MONGO_URI is missing!");

mongoose.connect(dbURI, { serverSelectionTimeoutMS: 30000 })
  .then(() => console.log("✅ Database Connected"))
  .catch(err => console.error("❌ DB Error:", err));

/* ================= MODELS ================= */

const UserSchema = new mongoose.Schema({
  name:     { type: String, required: true },
  email:    { type: String, unique: true, required: true, lowercase: true },
  password: { type: String, required: true },
  role:     { type: String, default: "user" },
  balance:  { type: Number, default: 5000 },
  img:      { type: String, default: "https://i.ibb.co/L8N4T3p/avatar.png" }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model("User", UserSchema);

const TransactionSchema = new mongoose.Schema({
  userId:        { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type:          { type: String },
  amount:        { type: Number },
  symbol:        { type: String },
  method:        { type: String },
  // ✅ FIX: txId ও transactionId দুটোই সেভ হবে (Deposit.jsx থেকে txId আসে)
  txId:          { type: String },
  transactionId: { type: String },
  status:        { type: String, default: "pending" },
  details:       { type: String }
}, { timestamps: true });

const Transaction = mongoose.models.Transaction || mongoose.model("Transaction", TransactionSchema);

const PlanSchema = new mongoose.Schema({
  name:          String,
  minAmount:     Number,
  maxAmount:     Number,
  profitPercent: Number,
  duration:      Number,
  status:        { type: Boolean, default: true }
});

const Plan = mongoose.models.Plan || mongoose.model("Plan", PlanSchema);

// ✅ FIX: Trader model — image field দুটো (img ও image) দুটোই রাখা হয়েছে
// profit, winRate, aum, mdd — Number type করা হয়েছে (String ছিল, frontend Number পাঠায়)
const TraderSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  image:   { type: String, default: "https://i.ibb.co/L8N4T3p/avatar.png" },
  img:     { type: String, default: "https://i.ibb.co/L8N4T3p/avatar.png" },
  profit:  { type: Number, default: 0 },
  winRate: { type: Number, default: 0 },
  aum:     { type: Number, default: 0 },
  mdd:     { type: Number, default: 0 },
  chartData: [Number],
  // ✅ FIX: status String — "approved" / "pending" consistent
  status:  { type: String, default: "pending" }
}, { timestamps: true });

const Trader = mongoose.models.Trader || mongoose.model("Trader", TraderSchema);

const InvestmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: "Plan" },
  amount: Number,
  status: { type: String, default: "active" }
}, { timestamps: true });

const Investment = mongoose.models.Investment || mongoose.model("Investment", InvestmentSchema);

// ✅ NEW: FuturesTrade model — আলাদা রাখা হয়েছে
const FuturesTradeSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  symbol:     { type: String, required: true, uppercase: true },
  type:       { type: String, enum: ["buy", "sell"], required: true },
  amount:     { type: Number, required: true },
  leverage:   { type: Number, default: 1 },
  entryPrice: { type: Number, required: true },
  tp:         { type: Number, default: null },
  sl:         { type: Number, default: null },
  pnl:        { type: Number, default: 0 },
  status:     { type: String, enum: ["open", "closed"], default: "open" }
}, { timestamps: true });

const FuturesTrade = mongoose.models.FuturesTrade || mongoose.model("FuturesTrade", FuturesTradeSchema);

/* ================= AUTH MIDDLEWARE ================= */

const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ success: false, message: "No Token" });
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ success: false, message: "Session Expired" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user?.role === "admin") next();
  else res.status(403).json({ success: false, message: "Admin access only" });
};

/* ================= PUBLIC ROUTES ================= */

app.get("/", (req, res) => res.send("🚀 Vinance System Online"));

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password)
      return res.status(400).json({ success: false, message: "All fields required" });

    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ success: false, message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    await User.create({ name, email: email.toLowerCase(), password: hashedPassword });
    res.json({ success: true, message: "Registration successful" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Registration failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ success: false, message: "All fields required" });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password)))
      return res.status(400).json({ success: false, message: "Invalid credentials" });

    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: "7d" });
    const userData = user.toObject();
    delete userData.password;
    res.json({ success: true, token, user: userData });
  } catch {
    res.status(500).json({ success: false, message: "Login failed" });
  }
});

app.get("/api/plans", async (req, res) => {
  try { res.json(await Plan.find({ status: true })); }
  catch { res.status(500).json([]); }
});

app.get("/api/traders/all", async (req, res) => {
  try { res.json(await Trader.find({ status: "approved" }).sort({ createdAt: -1 })); }
  catch { res.status(500).json([]); }
});

/* ================= USER ROUTES (auth required) ================= */

app.get("/api/profile", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch {
    res.status(500).json({ message: "Server Error" });
  }
});

app.post("/api/profile/update", auth, async (req, res) => {
  try {
    const { name, email, password, img } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (name) user.name = name;
    if (email) user.email = email.toLowerCase();
    if (img) { user.img = img; user.image = img; }
    if (password?.trim()) user.password = await bcrypt.hash(password, 10);

    await user.save();
    const updatedUser = user.toObject();
    delete updatedUser.password;
    res.json({ success: true, message: "Profile Updated!", user: updatedUser });
  } catch {
    res.status(500).json({ success: false, message: "Update failed" });
  }
});

// ✅ FIX: Deposit — txId আলাদাভাবে সেভ হচ্ছে, message response যোগ করা হয়েছে
app.post("/api/deposit", auth, async (req, res) => {
  try {
    const { amount, method, txId, transactionId } = req.body;
    if (!amount || amount < 10)
      return res.status(400).json({ success: false, message: "Minimum deposit is $10" });

    await Transaction.create({
      userId: req.user.id,
      type: "deposit",
      amount: Number(amount),
      method,
      txId: txId || transactionId || "",
      transactionId: txId || transactionId || "",
      status: "pending"
    });
    res.json({ success: true, message: "Deposit request submitted! Admin will verify within 24 hours." });
  } catch {
    res.status(500).json({ success: false, message: "Deposit submission failed" });
  }
});

// ✅ FIX: Withdraw — address field সেভ হচ্ছে, balance check সঠিক
app.post("/api/withdraw", auth, async (req, res) => {
  try {
    const { amount, address, method } = req.body;
    if (!amount || amount < 10)
      return res.status(400).json({ message: "Minimum withdrawal is $10" });
    if (!address)
      return res.status(400).json({ message: "Wallet address is required" });

    const user = await User.findById(req.user.id);
    if (user.balance < amount)
      return res.status(400).json({ message: "Insufficient balance" });

    await Transaction.create({
      userId: req.user.id,
      type: "withdraw",
      amount: Number(amount),
      method: method || "USDT (TRC20)",
      details: `Address: ${address}`,
      status: "pending"
    });
    res.json({ success: true, message: "Withdrawal request submitted! Processing within 24 hours." });
  } catch {
    res.status(500).json({ success: false, message: "Withdrawal failed" });
  }
});

// Spot Trade
app.post("/api/trade", auth, async (req, res) => {
  try {
    const { type, amount, symbol } = req.body;
    if (!amount || amount <= 0)
      return res.status(400).json({ message: "Invalid amount" });

    const user = await User.findById(req.user.id);
    if (user.balance < amount)
      return res.status(400).json({ message: "Insufficient balance" });

    user.balance -= Number(amount);
    await user.save();
    await Transaction.create({
      userId: req.user.id,
      type: `spot-${type}`,
      amount,
      symbol,
      status: "approved"
    });
    res.json({ success: true, message: `${type === "buy" ? "Long" : "Short"} order placed successfully` });
  } catch {
    res.status(500).json({ message: "Trade failed" });
  }
});

// ✅ FIX: Futures Trade — FuturesTrade model এ সেভ হচ্ছে, entryPrice সেভ হচ্ছে
app.post("/api/futures/trade", auth, async (req, res) => {
  try {
    const { type, amount, symbol, leverage, entryPrice } = req.body;
    if (!amount || amount <= 0)
      return res.status(400).json({ message: "Invalid amount" });
    if (!entryPrice)
      return res.status(400).json({ message: "Entry price required" });

    const user = await User.findById(req.user.id);
    if (user.balance < amount)
      return res.status(400).json({ message: "Insufficient balance" });

    user.balance -= Number(amount);
    await user.save();

    // FuturesTrade model এ সেভ করা হচ্ছে
    await FuturesTrade.create({
      userId: req.user.id,
      symbol: symbol?.toUpperCase(),
      type,
      amount: Number(amount),
      leverage: Number(leverage) || 1,
      entryPrice: Number(entryPrice),
      status: "open"
    });

    // Transaction log ও রাখা হচ্ছে
    await Transaction.create({
      userId: req.user.id,
      type: `futures-${type}`,
      amount,
      symbol,
      details: `Leverage: ${leverage}x | Entry: $${entryPrice}`,
      status: "approved"
    });

    res.json({ success: true, message: `Futures ${type === "buy" ? "Long" : "Short"} opened at $${entryPrice}` });
  } catch {
    res.status(500).json({ message: "Futures trade failed" });
  }
});

app.post("/api/invest", auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount)
      return res.status(400).json({ message: "Insufficient balance" });

    user.balance -= Number(amount);
    await user.save();
    await Investment.create({ userId: req.user.id, planId, amount });
    await Transaction.create({ userId: req.user.id, type: "investment", amount, status: "approved" });
    res.json({ success: true, message: "Investment successful" });
  } catch {
    res.status(500).json({ success: false, message: "Investment failed" });
  }
});

app.get("/api/my-investments", auth, async (req, res) => {
  try {
    const data = await Investment.find({ userId: req.user.id }).populate("planId").sort({ createdAt: -1 });
    res.json(data);
  } catch { res.status(500).json([]); }
});

app.get("/api/transactions", auth, async (req, res) => {
  try {
    res.json(await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 }));
  } catch { res.status(500).json([]); }
});

// ✅ NEW: User এর open futures positions দেখা
app.get("/api/futures/positions", auth, async (req, res) => {
  try {
    const positions = await FuturesTrade.find({ userId: req.user.id, status: "open" }).sort({ createdAt: -1 });
    res.json(positions);
  } catch { res.status(500).json([]); }
});

app.post("/api/traders/apply", auth, async (req, res) => {
  try {
    const { name, img, image, profit, winRate, aum, mdd } = req.body;
    await Trader.create({
      name,
      img: img || image || "https://i.ibb.co/L8N4T3p/avatar.png",
      image: img || image || "https://i.ibb.co/L8N4T3p/avatar.png",
      profit: Number(profit) || 0,
      winRate: Number(winRate) || 0,
      aum: Number(aum) || 0,
      mdd: Number(mdd) || 0,
      status: "pending"
    });
    res.json({ success: true, message: "Application submitted" });
  } catch { res.status(500).json({ success: false }); }
});

/* ================= ADMIN ROUTES ================= */

app.get("/api/admin/all-data", auth, adminAuth, async (req, res) => {
  try {
    const [users, requests, traders, plans, investments] = await Promise.all([
      User.find().select("-password").sort({ createdAt: -1 }),
      Transaction.find().populate("userId", "name email").sort({ createdAt: -1 }),
      Trader.find().sort({ createdAt: -1 }),
      Plan.find(),
      Investment.find().populate("userId", "name email").populate("planId", "name profitPercent").sort({ createdAt: -1 })
    ]);
    res.json({ success: true, users, requests, traders, plans, investments });
  } catch { res.status(500).json({ success: false }); }
});

app.post("/api/admin/update-balance", auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    if (balance < 0) return res.status(400).json({ success: false, message: "Balance cannot be negative" });
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true, message: "Balance Updated" });
  } catch { res.status(500).json({ success: false }); }
});

app.post("/api/admin/update-user", auth, adminAuth, async (req, res) => {
  try {
    const { userId, name, email, role, balance, img } = req.body;
    await User.findByIdAndUpdate(userId, { name, email, role, balance, img });
    res.json({ success: true, message: "User Updated" });
  } catch { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/delete-user/:id", auth, adminAuth, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "User Deleted" });
  } catch { res.status(500).json({ success: false }); }
});

// ✅ FIX: Trader create — image ও img দুটোই সেভ হচ্ছে, Number type নিশ্চিত
app.post("/api/admin/create-trader", auth, adminAuth, async (req, res) => {
  try {
    const { name, image, img, profit, winRate, aum, mdd, chartData } = req.body;
    const traderImg = image || img || "https://i.ibb.co/L8N4T3p/avatar.png";
    await Trader.create({
      name,
      image: traderImg,
      img: traderImg,
      profit: Number(profit) || 0,
      winRate: Number(winRate) || 0,
      aum: Number(aum) || 0,
      mdd: Number(mdd) || 0,
      chartData: Array.isArray(chartData) ? chartData : [],
      status: "approved"
    });
    res.json({ success: true, message: "Trader Created" });
  } catch { res.status(500).json({ success: false, message: "Failed to create trader" }); }
});

// ✅ FIX: Edit trader — { new: true, runValidators: true } যোগ করা হয়েছে
app.put("/api/admin/edit-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    const updateData = { ...req.body };
    // Number fields নিশ্চিত করা
    if (updateData.profit !== undefined) updateData.profit = Number(updateData.profit);
    if (updateData.winRate !== undefined) updateData.winRate = Number(updateData.winRate);
    if (updateData.aum !== undefined) updateData.aum = Number(updateData.aum);
    if (updateData.mdd !== undefined) updateData.mdd = Number(updateData.mdd);
    // image sync
    if (updateData.image) updateData.img = updateData.image;
    if (updateData.img) updateData.image = updateData.img;

    const updated = await Trader.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );
    if (!updated) return res.status(404).json({ success: false, message: "Trader not found" });
    res.json({ success: true, message: "Trader Updated Successfully", trader: updated });
  } catch { res.status(500).json({ success: false, message: "Update failed" }); }
});

app.delete("/api/admin/delete-trader/:id", auth, adminAuth, async (req, res) => {
  try {
    const deleted = await Trader.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ success: false, message: "Trader not found" });
    res.json({ success: true, message: "Trader Deleted" });
  } catch { res.status(500).json({ success: false }); }
});

app.post("/api/admin/create-plan", auth, adminAuth, async (req, res) => {
  try {
    await Plan.create(req.body);
    res.json({ success: true, message: "Plan Created" });
  } catch { res.status(500).json({ success: false }); }
});

app.delete("/api/admin/delete-plan/:id", auth, adminAuth, async (req, res) => {
  try {
    await Plan.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Plan Deleted" });
  } catch { res.status(500).json({ success: false }); }
});

// ✅ FIX: handle-request — withdraw approve হলে balance কমবে, deposit approve হলে বাড়বে
app.post("/api/admin/handle-request", auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body;
    const trx = await Transaction.findById(requestId || req.body.id);
    if (!trx) return res.status(404).json({ success: false, message: "Transaction not found" });
    if (trx.status === status)
      return res.status(400).json({ success: false, message: "Already " + status });

    if (status === "approved") {
      if (trx.type === "deposit") {
        // Deposit approve → balance বাড়াও
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      } else if (trx.type === "withdraw") {
        // Withdraw approve → balance কমাও (এখানে কমানো হচ্ছে)
        const user = await User.findById(trx.userId);
        if (user.balance < trx.amount)
          return res.status(400).json({ success: false, message: "User has insufficient balance" });
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: -trx.amount } });
      }
    }

    trx.status = status;
    await trx.save();
    res.json({ success: true, message: `Request ${status}` });
  } catch { res.status(500).json({ success: false }); }
});

/* ================= START ================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on Port ${PORT}`));
export default app;