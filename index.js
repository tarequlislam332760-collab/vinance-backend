const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// --- ১. মিডলওয়্যার ---
app.use(cors({ origin: true, credentials: true })); 
app.use(express.json());

// --- ২. ডাটাবেজ কানেকশন ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/vinance";
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ DB Error:", err.message));

// --- ৩. মডেলস ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, default: 'user' }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true }, // deposit, withdraw, trade, investment
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  transactionId: { type: String },
  address: String,
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({
  name: { type: String, required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  profitPercent: { type: Number, required: true },
  duration: { type: Number, required: true }, // Hours or Days
  status: { type: Boolean, default: true }
}));

const Investment = mongoose.models.Investment || mongoose.model('Investment', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  amount: Number, 
  profit: Number, 
  status: { type: String, default: 'active' }, 
  expireAt: Date
}, { timestamps: true }));

// --- ৪. অথেন্টিকেশন ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "No Token" });
  try {
    const secret = (process.env.JWT_SECRET || 'secret_123').trim();
    req.user = jwt.verify(token, secret);
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Admins Only!" });
};

// --- ৫. ইউজার এপিআই (Register & Login) ---
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(400).json({ message: "Email already exists!" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email: email.toLowerCase().trim(), password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "Success" });
  } catch (err) { res.status(500).json({ message: "Internal Error" }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ message: "Invalid" });
    const secret = (process.env.JWT_SECRET || 'secret_123').trim();
    const token = jwt.sign({ id: user._id, role: user.role }, secret, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Login failed" }); }
});

// --- ৬. ইউজার অ্যাকশন (Deposit, Trade, Invest) ---
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    const trx = new Transaction({
      userId: req.user.id, type: 'deposit', amount: Number(amount), method, transactionId, status: 'pending'
    });
    await trx.save();
    res.json({ message: "Deposit Pending" });
  } catch (err) { res.status(500).json({ message: "Deposit failed" }); }
});

app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);
    const investAmt = Number(amount);

    if (user.balance < investAmt) return res.status(400).json({ message: "Low Balance" });
    
    user.balance -= investAmt;
    await user.save();

    const invest = new Investment({
      userId: user._id, planId: plan._id, amount: investAmt,
      profit: (investAmt * plan.profitPercent) / 100,
      expireAt: new Date(Date.now() + plan.duration * 60 * 60 * 1000) // Duration in Hours
    });
    await invest.save();
    res.json({ message: "Investment Active", balance: user.balance });
  } catch (err) { res.status(500).json({ message: "Failed" }); }
});

// ইউজার নিজের ইনভেস্টমেন্ট দেখার জন্য
app.get('/api/my-investments', auth, async (req, res) => {
  try {
    const data = await Investment.find({ userId: req.user.id }).populate('planId');
    res.json(data);
  } catch (err) { res.status(500).json({ message: "Failed to fetch" }); }
});

// --- ৭. অ্যাডমিন প্যানেল API (Command Center Support) ---

// ✅ ১. সব ডাটা একসাথে ফেচ (AdminPanel.jsx এর জন্য)
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const requests = await Transaction.find().populate('userId', 'name email').sort({createdAt: -1});
    const investments = await Investment.find().populate('userId', 'name email').populate('planId');
    res.json({ users, requests, investments });
  } catch (err) { res.status(500).json({ message: "Fetch failed" }); }
});

// ✅ ২. অ্যাডমিন দ্বারা ইউজার ব্যালেন্স সরাসরি আপডেট
app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ message: "Balance Updated" });
  } catch (err) { res.status(500).json({ message: "Failed" }); }
});

// ✅ ৩. নতুন প্ল্যান তৈরি
app.post('/api/admin/plans', auth, adminAuth, async (req, res) => {
  try {
    const { name, minAmount, maxAmount, profitPercent, duration } = req.body;
    const newPlan = new Plan({
      name, 
      minAmount: Number(minAmount), 
      maxAmount: Number(maxAmount),
      profitPercent: Number(profitPercent), 
      duration: Number(duration)
    });
    await newPlan.save();
    res.status(201).json({ message: "Plan Created" });
  } catch (err) { res.status(500).json({ message: "Plan creation failed" }); }
});

// ✅ ৪. রিকোয়েস্ট অ্যাপ্রুভ বা রিজেক্ট
app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body; 
    const trx = await Transaction.findById(requestId);
    if (!trx || trx.status !== 'pending') return res.status(400).json({ message: "Invalid request" });

    if (status === 'approved' && trx.type === 'deposit') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    } else if (status === 'rejected' && trx.type === 'withdraw') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    
    trx.status = status;
    await trx.save();
    res.json({ message: "Success" });
  } catch (err) { res.status(500).json({ message: "Action failed" }); }
});

app.get("/", (req, res) => res.send("Server Running"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));