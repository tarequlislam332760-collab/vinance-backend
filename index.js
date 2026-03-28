const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// --- ১. মিডলওয়্যার (CORS Updated with your Frontend URL) ---
app.use(cors({
  origin: [
    "http://localhost:5173", 
    "http://localhost:3000", 
    "https://vinance-frontend.vercel.app" // আপনার নতুন ফ্রন্টএন্ড লিঙ্কটি এখানে সেট করা হয়েছে
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
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, unique: true, required: true, lowercase: true, trim: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 5000 },
  role: { type: String, enum: ['user', 'admin'], default: 'user', trim: true }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'trade'], required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  symbol: String,
  address: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

// --- ৩. অথেন্টিকেশন ও অ্যাডমিন মিডলওয়্যার ---
const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) return res.status(401).json({ message: "Access Denied! Please Login." });
  
  try {
    const decoded = jwt.verify(token, (process.env.JWT_SECRET || 'secret_123').trim());
    req.user = decoded; 
    next();
  } catch (err) { 
    res.status(401).json({ message: "Invalid or Expired Token" }); 
  }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Access Denied: Admins Only!" });
};

// --- ৪. সাধারণ ইউজার এপিআই ---

app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ message: "Server Error" }); }
});

app.get('/api/transactions', auth, async (req, res) => {
  try {
    const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(transactions);
  } catch (err) { res.status(500).json({ message: "Error fetching transactions" }); }
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
      role: role || 'user' 
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
      return res.status(400).json({ message: "Invalid email or password" });
    }
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      (process.env.JWT_SECRET || 'secret_123').trim(), 
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Login error" }); }
});

// --- ৫. ডিপোজিট, উইথড্র ও ট্রেড লজিক ---

app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ message: "Enter a valid amount" });

    const newTrx = new Transaction({
      userId: req.user.id,
      type: 'deposit',
      amount: parseFloat(amount),
      method: method || 'Manual',
      status: 'pending'
    });
    await newTrx.save();
    res.json({ message: "Deposit request submitted! Admin will verify it." });
  } catch (err) { res.status(500).json({ message: "Deposit failed" }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body;
    const user = await User.findById(req.user.id);

    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance!" });

    const newTrx = new Transaction({
      userId: req.user.id,
      type: 'withdraw',
      amount: parseFloat(amount),
      method: method,
      address: address,
      status: 'pending'
    });

    user.balance -= parseFloat(amount);
    await user.save();
    await newTrx.save();

    res.json({ message: "Withdrawal request sent! Balance deducted." });
  } catch (err) { res.status(500).json({ message: "Withdrawal failed" }); }
});

app.post('/api/trade', auth, async (req, res) => {
  try {
    const { type, amount, symbol } = req.body;
    const user = await User.findById(req.user.id);

    if (type === 'buy') {
      if (user.balance < amount) return res.status(400).json({ message: "Not enough balance to buy!" });
      user.balance -= parseFloat(amount);
    } else {
      user.balance += parseFloat(amount);
    }

    const newTrx = new Transaction({
      userId: req.user.id,
      type: 'trade',
      amount: parseFloat(amount),
      symbol: symbol,
      status: 'completed'
    });

    await user.save();
    await newTrx.save();

    res.json({ message: `${type.toUpperCase()} order successful!`, balance: user.balance });
  } catch (err) { 
    res.status(500).json({ message: "Trading operation failed" }); 
  }
});

// --- ৬. অ্যাডমিন এপিআই ---

app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find({}).select('-password');
    const requests = await Transaction.find({ status: 'pending' });
    res.json({ users, requests });
  } catch (err) { res.status(500).json({ message: "Admin data fetch error" }); }
});

app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  const { userId, balance } = req.body;
  try {
    await User.findByIdAndUpdate(userId, { balance: parseFloat(balance) });
    res.json({ message: "User balance updated successfully" });
  } catch (err) { res.status(500).json({ message: "Balance update failed" }); }
});

app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  const { requestId, status } = req.body;
  try {
    const trx = await Transaction.findById(requestId);
    if (!trx) return res.status(404).json({ message: "Transaction not found" });

    if (status === 'completed' && trx.type === 'deposit' && trx.status !== 'completed') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    
    if (status === 'rejected' && trx.type === 'withdraw') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }

    trx.status = status;
    await trx.save();
    res.json({ message: `Request marked as ${status}` });
  } catch (err) { res.status(500).json({ message: "Admin action failed" }); }
});

// Vercel এর জন্য রুট চেক
app.get("/", (req, res) => res.send("Vinance Server is Live!"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 SERVER RUNNING ON PORT ${PORT}`));