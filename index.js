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

// --- ২. মডেলস (নতুন ইনভেস্টমেন্ট সহ) ---
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
  type: { type: String, enum: ['deposit', 'withdraw', 'trade', 'investment'], required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  symbol: String,
  address: String,
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});
const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

// --- নতুন ইনভেস্টমেন্ট মডেল ---
const PlanSchema = new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
});
const Plan = mongoose.models.Plan || mongoose.model('Plan', PlanSchema);

const InvestmentSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' },
  amount: Number, profit: Number, status: { type: String, default: 'active' }, expireAt: Date
}, { timestamps: true });
const Investment = mongoose.models.Investment || mongoose.model('Investment', InvestmentSchema);

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

// --- ৪. এপিআই রাউটস (আগের গুলো সব ঠিক আছে) ---
app.get('/api/profile', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
});

app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email: email.toLowerCase(), password: hashedPassword, role: role || 'user', balance: 5000 }); 
    await user.save();
    res.status(201).json({ message: "Success" });
  } catch (err) { res.status(400).json({ message: "Failed" }); }
});

app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ message: "Invalid" });
  const token = jwt.sign({ id: user._id, role: user.role }, (process.env.JWT_SECRET || 'secret_123').trim(), { expiresIn: '7d' });
  res.json({ token, user });
});

// --- ৫. ইনভেস্টমেন্ট লজিক (নতুন) ---
app.get('/api/investments/plans', async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

app.post('/api/investments/invest', auth, async (req, res) => {
  const { planId, amount } = req.body;
  const user = await User.findById(req.user.id);
  const plan = await Plan.findById(planId);
  if (user.balance < amount) return res.status(400).json({ message: "Insufficient Balance" });
  
  user.balance -= amount;
  const expireAt = new Date(); expireAt.setHours(expireAt.getHours() + plan.duration);
  const inv = new Investment({ userId: user._id, planId, amount, expireAt });
  
  await user.save(); await inv.save();
  res.json({ message: "Investment Successful" });
});

// --- ৬. অ্যাডমিন কন্ট্রোল (আপডেটেড) ---
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  const users = await User.find({}).select('-password');
  const requests = await Transaction.find({ status: 'pending' }).populate('userId', 'name email');
  const investments = await Investment.find().populate('userId', 'name').populate('planId', 'name');
  res.json({ users, requests, investments });
});

app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.body.userId, { balance: req.body.balance });
  res.json({ message: "Balance Updated" });
});

app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  const trx = await Transaction.findById(req.body.requestId);
  if (req.body.status === 'completed' && trx.type === 'deposit') await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
  trx.status = req.body.status;
  await trx.save();
  res.json({ message: "Done" });
});

// প্ল্যান ম্যানেজমেন্ট রাউটস
app.post('/api/admin/add-plan', auth, adminAuth, async (req, res) => {
  const plan = new Plan(req.body); await plan.save(); res.json(plan);
});

app.get("/", (req, res) => res.send("Vinance Server Live"));
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
}
module.exports = app;