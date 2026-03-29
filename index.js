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
mongoose.connect(MONGO_URI).then(() => console.log("✅ DB Connected")).catch(err => console.log(err));

// --- ২. মডেলস ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 5000 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'trade'], required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

// --- ৩. মিডলওয়্যার ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "No Token" });
  try {
    req.user = jwt.verify(token, (process.env.JWT_SECRET || 'secret_123').trim());
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Admins Only!" });
};

// --- ৪. এপিআই রাউটস (Public & User) ---
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign({ id: user._id, role: user.role }, (process.env.JWT_SECRET || 'secret_123').trim());
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } else res.status(400).json({ message: "Invalid credentials" });
});

// --- ৫. অ্যাডমিন কন্ট্রোল (নতুন ফিচারসহ) ---

// ৫.১ সব ডাটা একসাথে আনা
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const requests = await Transaction.find({ status: 'pending' }).populate('userId', 'name email');
    res.json({ users, requests });
  } catch (err) { res.status(500).send("Error"); }
});

// ৫.২ ডিপোজিট/উইথড্র রিকোয়েস্ট হ্যান্ডেল করা
app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  const { requestId, status } = req.body; 
  try {
    const trx = await Transaction.findById(requestId);
    if (!trx || trx.status !== 'pending') return res.status(400).send("Handled");
    if (status === 'completed' && trx.type === 'deposit') await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    if (status === 'rejected' && trx.type === 'withdraw') await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    trx.status = status; await trx.save();
    res.json({ message: "Success" });
  } catch (err) { res.status(500).send("Error"); }
});

// ৫.৩ ইউজারের ব্যালেন্স ম্যানুয়ালি আপডেট করা (নতুন)
app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  const { userId, balance } = req.body;
  try {
    await User.findByIdAndUpdate(userId, { balance: parseFloat(balance) });
    res.json({ message: "Balance updated!" });
  } catch (err) { res.status(500).send("Failed"); }
});

app.get("/", (req, res) => res.send("Vinance Server Live"));

if (process.env.NODE_ENV !== 'production') {
  app.listen(5000, () => console.log(`🚀 Port 5000`));
}
module.exports = app;