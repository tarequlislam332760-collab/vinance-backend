const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// ১. CORS কনফিগারেশন
app.use(cors({
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"], 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// ২. ডাটাবেজ কানেকশন
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || 'secret_123';

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ DB Error:", err.message));

// ৩. মডেলস (Models)
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: String, email: { type: String, unique: true, required: true }, 
  password: { type: String, required: true }, balance: { type: Number, default: 0 }, 
  role: { type: String, default: 'user' }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  type: String, amount: Number, status: { type: String, default: 'pending' }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model('Investment', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }, 
  amount: Number, status: { type: String, default: 'active' }
}, { timestamps: true }));

// ৪. মিডলওয়্যার (Auth & Admin)
const auth = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: "No Token" });
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Token" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Access Denied: Admins only" });
};

// ৫. অথেন্টিকেশন রুটস
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const hash = await bcrypt.hash(password, 10);
    const user = new User({ name, email: email.toLowerCase().trim(), password: hash });
    await user.save();
    res.status(201).json({ success: true });
  } catch (err) { res.status(500).json({ message: "Fail" }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message: "Wrong credentials" });
    const token = jwt.sign({ id: user._id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } catch (err) { res.status(500).json({ message: "Login failed" }); }
});

// ৬. ইউজার সার্ভিস রুটস
app.get('/api/plans', async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).send("Insufficient Balance");
    user.balance -= amount;
    await user.save();
    await new Investment({ userId: user._id, planId, amount }).save();
    await new Transaction({ userId: user._id, type: 'investment', amount, status: 'approved' }).save();
    res.json({ success: true, balance: user.balance });
  } catch (err) { res.status(500).send("Error"); }
});

// --- ৭. অ্যাডমিন রুটস (এই অংশটিই আপনার এরর ঠিক করবে) ---

// ইউজারের সব ডাটা এবং লগস লোড করা
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const requests = await Transaction.find().populate('userId', 'name email').sort({createdAt: -1});
    const investments = await Investment.find().populate('userId', 'name email').populate('planId').sort({createdAt: -1});
    res.json({ users, requests, investments });
  } catch (err) { res.status(500).json({ message: "Admin data fetch error" }); }
});

// ইউজারের ব্যালেন্স আপডেট
app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  try {
    const { userId, balance } = req.body;
    // ব্যালেন্সকে সংখ্যায় (Number) কনভার্ট করে সেভ করা হচ্ছে
    await User.findByIdAndUpdate(userId, { balance: Number(balance) });
    res.json({ success: true, message: "Balance updated" });
  } catch (err) { res.status(500).json({ success: false }); }
});

// নতুন প্ল্যান তৈরি করা (আপনার ManagePlans.jsx এর জন্য)
app.post('/api/admin/create-plan', auth, adminAuth, async (req, res) => {
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
    res.status(201).json({ success: true, message: "Plan created" });
  } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

// রিকোয়েস্ট হ্যান্ডেল (Approve/Reject)
app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body;
    const trx = await Transaction.findById(requestId);
    if (status === 'approved' && trx.status === 'pending') {
      if (trx.type === 'deposit') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      }
    } else if (status === 'rejected' && trx.type === 'withdraw') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ message: "Success" });
  } catch (err) { res.status(500).json({ message: "Failed" }); }
});

app.get("/", (req, res) => res.send("Vinance Pro API Operational"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port: ${PORT}`));