const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// --- ১. মিডলওয়্যার ---
app.use(cors({
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"], 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// --- ২. ডাটাবেজ কানেকশন (Vercel এর জন্য অপ্টিমাইজড) ---
const MONGO_URI = process.env.MONGO_URI;
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

const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({
  name: { type: String, required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  profitPercent: { type: Number, required: true },
  duration: { type: Number, required: true }, // in hours
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

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  transactionId: { type: String },
  address: { type: String }, 
  status: { type: String, default: 'pending' }
}, { timestamps: true }));

// --- ৪. মিডলওয়্যার ফাংশনস ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "No Token Found" });
  try {
    const secret = (process.env.JWT_SECRET || 'secret_123').trim();
    req.user = jwt.verify(token, secret);
    next();
  } catch (err) { res.status(401).json({ message: "Invalid or Expired Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Access Denied: Admins Only!" });
};

// --- ৫. এপিআই রুটস ---

// ইউজারের প্রোফাইল এবং ব্যালেন্স রিফ্রেশ (এটি খুব জরুরি)
app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) { res.status(500).json({ message: "Profile error" }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ message: "Invalid Credentials" });
    }
    const secret = (process.env.JWT_SECRET || 'secret_123').trim();
    const token = jwt.sign({ id: user._id, role: user.role }, secret, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Login failed" }); }
});

// ইনভেস্টমেন্ট প্ল্যান দেখা
app.get('/api/plans', async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

// ইনভেস্ট করা
app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);
    
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });
    
    user.balance -= amount;
    await user.save();
    
    const invest = new Investment({
      userId: user._id, 
      planId: plan._id, 
      amount,
      profit: (amount * plan.profitPercent) / 100,
      expireAt: new Date(Date.now() + plan.duration * 60 * 60 * 1000)
    });
    await invest.save();
    res.json({ message: "Investment successful!", balance: user.balance });
  } catch (err) { res.status(500).json({ message: "Failed to invest" }); }
});

// ইউজারের নিজস্ব ইনভেস্টমেন্ট লগ
app.get('/api/my-investments', auth, async (req, res) => {
  try {
    const logs = await Investment.find({ userId: req.user.id }).populate('planId').sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json({ message: "Error fetching logs" }); }
});

// --- ৬. অ্যাডমিন রুটস ---
app.post('/api/admin/plans', auth, adminAuth, async (req, res) => {
  try {
    const plan = new Plan(req.body);
    await plan.save();
    res.status(201).json({ message: "Plan Created!" });
  } catch (err) { res.status(500).json({ message: "Creation failed" }); }
});

app.get("/", (req, res) => res.send("Vinance Pro API Running..."));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));