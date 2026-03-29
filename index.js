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
  origin: [
    "http://localhost:5173", 
    "http://localhost:3000", 
    "https://vinance-frontend.vercel.app"
  ],
  credentials: true
}));
app.use(express.json());

// ডাটাবেজ কানেকশন
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/vinance";
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ MongoDB Connection Error:", err));

// --- ২. মডেলস ---
const UserSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user', trim: true }
}, { timestamps: true });

const User = mongoose.models.User || mongoose.model('User', UserSchema);

const TransactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'trade'], required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  symbol: String,
  address: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

// --- ৩. অথেন্টিকেশন মিডলওয়্যার ---
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Access Denied!" });
  try {
    const decoded = jwt.verify(token, (process.env.JWT_SECRET || 'secret_123').trim());
    req.user = decoded; 
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Admins Only!" });
};

// --- ৪. এপিআই রাউটস ---
app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) { res.status(500).json({ message: "Server Error" }); }
});

app.get('/api/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ message: "Email already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ 
      name, 
      email: email.toLowerCase(), 
      password: hashedPassword, 
      role: role || 'user',
      balance: 5000 
    }); 
    await user.save();
    res.status(201).json({ message: "Registration successful!" });
  } catch (err) { res.status(400).json({ message: "Registration failed" }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(400).json({ message: "Invalid credentials" });
    }
    const token = jwt.sign({ id: user._id, role: user.role }, (process.env.JWT_SECRET || 'secret_123').trim(), { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Login error" }); }
});

// --- ৫. ডিপোজিট ও উইথড্র ---
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method } = req.body;
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) return res.status(400).json({ message: "Enter a valid amount" });

    const newTrx = new Transaction({
      userId: req.user.id,
      type: 'deposit',
      amount: numAmount,
      method: method || 'Manual',
      status: 'pending'
    });
    await newTrx.save();
    res.json({ message: "Deposit request pending. Wait for admin approval." });
  } catch (err) { res.status(500).json({ message: "Deposit request failed" }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body;
    const numAmount = parseFloat(amount);
    const user = await User.findById(req.user.id);

    if (!numAmount || numAmount <= 0) return res.status(400).json({ message: "Invalid amount" });
    if (user.balance < numAmount) return res.status(400).json({ message: "Insufficient balance!" });

    user.balance -= numAmount;
    await user.save();

    const newTrx = new Transaction({
      userId: req.user.id,
      type: 'withdraw',
      amount: numAmount,
      method: method,
      address: address,
      status: 'pending'
    });
    await newTrx.save();

    res.json({ message: "Withdrawal request submitted. Balance deducted." });
  } catch (err) { res.status(500).json({ message: "Withdrawal failed" }); }
});

app.post('/api/trade', auth, async (req, res) => {
  try {
    const { type, amount, symbol } = req.body;
    const user = await User.findById(req.user.id);
    const numAmount = parseFloat(amount);

    if (type === 'buy') {
      if (user.balance < numAmount) return res.status(400).json({ message: "Insufficient balance" });
      user.balance -= numAmount;
    } else {
      user.balance += numAmount;
    }

    const newTrx = new Transaction({
      userId: req.user.id,
      type: 'trade',
      amount: numAmount,
      symbol: symbol,
      status: 'completed'
    });

    await user.save();
    await newTrx.save();
    res.json({ message: "Trade Successful", balance: user.balance });
  } catch (err) { res.status(500).json({ message: "Trade failed" }); }
});

// --- ৬. অ্যাডমিন কন্ট্রোল ---
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    const requests = await Transaction.find({ status: 'pending' }).populate('userId', 'name email');
    res.json({ users, requests });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  const { requestId, status } = req.body; 
  try {
    const trx = await Transaction.findById(requestId);
    if (!trx || trx.status !== 'pending') return res.status(400).json({ message: "Already processed or not found" });

    if (status === 'completed' && trx.type === 'deposit') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    
    if (status === 'rejected' && trx.type === 'withdraw') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }

    trx.status = status;
    await trx.save();
    res.json({ message: `Request ${status} successfully` });
  } catch (err) { res.status(500).json({ message: "Admin action failed" }); }
});

app.get("/", (req, res) => res.send("Vinance Server Live & Running"));

// --- ৭. Vercel ও লোকাল হোস্টিং এর জন্য লিসেন কন্ডিশন ---
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
}

module.exports = app; // Vercel এর জন্য এটি সবথেকে গুরুত্বপূর্ণ