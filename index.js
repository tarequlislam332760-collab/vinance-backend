const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// --- ১. মিডলওয়্যার ---
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", "https://vinance-frontend.vercel.app"],
  credentials: true
}));
app.use(express.json());

// ডাটাবেজ কানেকশন
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/vinance";
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- ২. মডেলস ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 5000 },
  role: { type: String, default: 'user' }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'trade', 'investment'], required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  symbol: String,
  address: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Investment = mongoose.models.Investment || mongoose.model('Investment', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  amount: Number, profit: Number, status: { type: String, default: 'active' }, expireAt: Date
}, { timestamps: true }));

// --- ৩. অথেন্টিকেশন মিডলওয়্যার ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Access Denied!" });
  try {
    req.user = jwt.verify(token, (process.env.JWT_SECRET || 'secret_123').trim());
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Admins Only!" });
};

// --- ৪. এপিআই রাউটস (অপারেশনস) ---

// রেজিস্ট্রেশন ও লগইন
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Fields missing" });
    const cleanEmail = email.toLowerCase().trim();
    const exists = await User.findOne({ email: cleanEmail });
    if (exists) return res.status(400).json({ message: "Email already exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email: cleanEmail, password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "Success" });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ message: "Invalid" });
  const token = jwt.sign({ id: user._id, role: user.role }, (process.env.JWT_SECRET || 'secret_123').trim(), { expiresIn: '7d' });
  res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
});

// ডিপোজিট (নতুন লজিক যোগ করা হয়েছে)
app.post('/api/deposit', auth, async (req, res) => {
  const { amount, method } = req.body;
  const trx = new Transaction({ userId: req.user.id, type: 'deposit', amount, method });
  await trx.save();
  res.json({ message: "Deposit Pending" });
});

// ট্রেড (Buy/Sell) লজিক
app.post('/api/trade', auth, async (req, res) => {
  const { type, amount, symbol } = req.body;
  const user = await User.findById(req.user.id);
  if (type === 'buy') {
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });
    user.balance -= amount;
  } else {
    user.balance += amount;
  }
  const trx = new Transaction({ userId: req.user.id, type: 'trade', amount, symbol, status: 'completed' });
  await user.save(); await trx.save();
  res.json({ message: "Trade Success", balance: user.balance });
});

// ইনভেস্টমেন্ট রাউট
app.post('/api/investments/invest', auth, async (req, res) => {
  const { planId, amount } = req.body;
  const user = await User.findById(req.user.id);
  const plan = await Plan.findById(planId);
  if (user.balance < amount) return res.status(400).json({ message: "Insufficient" });
  user.balance -= amount;
  const expireAt = new Date(); expireAt.setHours(expireAt.getHours() + (plan.duration || 24));
  const inv = new Investment({ userId: user._id, planId, amount, expireAt });
  await user.save(); await inv.save();
  res.json({ message: "Invest Success" });
});

// --- ৫. অ্যাডমিন কন্ট্রোল ---
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  const users = await User.find({}).select('-password');
  const requests = await Transaction.find({ status: 'pending' }).populate('userId', 'name email');
  const investments = await Investment.find().populate('userId', 'name').populate('planId', 'name');
  res.json({ users, requests, investments });
});

app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  const { requestId, status } = req.body;
  const trx = await Transaction.findById(requestId);
  if (status === 'approved' && trx.type === 'deposit') {
    await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
  }
  trx.status = status === 'approved' ? 'completed' : 'rejected';
  await trx.save();
  res.json({ message: "Request Handled" });
});

app.get("/", (req, res) => res.send("Vinance Server Live"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));

module.exports = app;