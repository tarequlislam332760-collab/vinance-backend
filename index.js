const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"], 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI).then(() => console.log("✅ DB Connected")).catch(err => console.log(err));

// --- মডলেস ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: String, balance: { type: Number, default: 0 }, role: { type: String, default: 'user' }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Investment = mongoose.models.Investment || mongoose.model('Investment', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  amount: Number, profit: Number, status: { type: String, default: 'active' }, expireAt: Date
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: String, amount: Number, method: { type: String, default: 'System' }, status: { type: String, default: 'pending' }
}, { timestamps: true }));

// --- মিডলওয়্যার ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Login required" });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || 'secret_123');
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Session" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Admin access only" });
};

// --- রুটস ---
app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ message: "Invalid" });
  const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secret_123', { expiresIn: '7d' });
  res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
});

app.get('/api/profile', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  const transactions = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
  res.json({ ...user._doc, transactions });
});

app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  const users = await User.find().select('-password');
  const requests = await Transaction.find().populate('userId', 'name email').sort({ createdAt: -1 });
  const investments = await Investment.find().populate('userId', 'name email').populate('planId').sort({ createdAt: -1 });
  res.json({ users, requests, investments });
});

// এডমিন ব্যালেন্স আপডেট
app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.body.userId, { balance: Number(req.body.balance) });
  res.json({ message: "Success" });
});

// নতুন প্ল্যান তৈরি (এটি এডমিন প্যানেলের জন্য জরুরি)
app.post('/api/admin/create-plan', auth, adminAuth, async (req, res) => {
  const plan = new Plan(req.body);
  await plan.save();
  res.json({ message: "Plan Created" });
});

app.get("/", (req, res) => res.send("Vinance API Live"));
app.listen(5000);