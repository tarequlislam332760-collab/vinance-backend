const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// --- ১. মিডলওয়্যার (CORS FIXED) ---
const allowedOrigins = [
  "http://localhost:5173", 
  "http://localhost:3000", 
  "https://vinance-frontend.vercel.app",
  "https://vinance-frontend-vjqa.vercel.app"
];

app.use(cors({
  origin: function (origin, callback) {
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
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
  transactionId: { type: String },
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

// --- ৪. ইউজার এপিআই ---
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: "Email exists" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email: email.toLowerCase(), password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "Success" });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ message: "Invalid" });
  const token = jwt.sign({ id: user._id, role: user.role }, (process.env.JWT_SECRET || 'secret_123').trim(), { expiresIn: '7d' });
  res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
});

app.get('/api/profile', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json(user);
});

// --- ৫. ডিপোজিট, উইথড্র ও ট্রানজেকশন ---
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const trx = new Transaction({ userId: req.user.id, type: 'deposit', ...req.body });
    await trx.save();
    res.json({ message: "Deposit request submitted" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.balance < req.body.amount) return res.status(400).json({ message: "Insufficient balance" });
    user.balance -= Number(req.body.amount);
    await user.save();
    const trx = new Transaction({ userId: req.user.id, type: 'withdraw', ...req.body });
    await trx.save();
    res.json({ message: "Withdrawal request sent" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/transactions', auth, async (req, res) => {
  try {
    const trxs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(trxs);
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/trade', auth, async (req, res) => {
  res.json({ message: "Trade executed" }); 
});

app.post('/api/investment/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);
    if (!plan || user.balance < amount) return res.status(400).json({ message: "Invalid plan or balance" });
    user.balance -= Number(amount);
    await user.save();
    const inv = new Investment({ userId: user._id, planId: plan._id, amount: Number(amount), expireAt: new Date(Date.now() + plan.duration * 3600000) });
    await inv.save();
    res.json({ message: "Investment success", balance: user.balance });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/investment/plans', async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

// --- ৬. অ্যাডমিন কমান্ড সেন্টার (FIXED SECTION) ---

app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const requests = await Transaction.find().populate('userId', 'name email');
    const investments = await Investment.find().populate('userId', 'name email').populate('planId');
    res.json({ 
      users, 
      requests: requests.map(r => ({ ...r._doc, user: r.userId })), 
      investments: investments.map(i => ({ ...i._doc, user: i.userId })) 
    });
  } catch (err) { res.status(500).json({ message: "Error" }); }
});

// **ফিক্সড: হ্যান্ডেল রিকোয়েস্ট (Action Failed Error এর সমাধান)**
app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body; 
    const trx = await Transaction.findById(requestId);
    if (!trx) return res.status(404).json({ message: "Not found" });

    if (status === 'approved' && trx.status === 'pending') {
      if (trx.type === 'deposit') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      }
      trx.status = 'approved';
    } else if (status === 'rejected' && trx.status === 'pending') {
      if (trx.type === 'withdraw') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      }
      trx.status = 'rejected';
    }
    await trx.save();
    res.json({ message: "Action Successful" });
  } catch (err) { res.status(500).json({ message: "Action failed" }); }
});

app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  const { userId, balance } = req.body;
  await User.findByIdAndUpdate(userId, { balance: Number(balance) });
  res.json({ message: "Success" });
});

// **ফিক্সড: প্ল্যান তৈরি (Failed to Create Plan এর সমাধান)**
app.post('/api/admin/plans', auth, adminAuth, async (req, res) => {
  try {
    // ফ্রন্টএন্ড থেকে আসা ডাটা সরাসরি সেভ করা
    const plan = new Plan({
        ...req.body,
        minAmount: Number(req.body.minAmount),
        maxAmount: Number(req.body.maxAmount),
        profitPercent: Number(req.body.profitPercent),
        duration: Number(req.body.duration)
    });
    await plan.save();
    res.status(201).json({ message: "Plan Created Successfully" });
  } catch (err) { 
    res.status(500).json({ message: "Failed to create plan" }); 
  }
});

app.get("/", (req, res) => res.send("Server Live"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));