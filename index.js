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
      callback(null, true); 
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

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
  type: { type: String, enum: ['deposit', 'withdraw', 'trade', 'investment'], required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  transactionId: { type: String },
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

// --- ৪. অথেন্টিকেশন মিডলওয়্যার ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Access Denied!" });
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

// --- ৫. ইউজার এপিআই (লগইন/রেজিস্টার) ---
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

// --- ৬. ইনভেস্টমেন্ট লজিক (NEW) ---
app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);

    if (user.balance < Number(amount)) return res.status(400).json({ message: "Low Balance" });
    
    user.balance -= Number(amount);
    await user.save();

    const invest = new Investment({
      userId: user._id, planId: plan._id, amount: Number(amount),
      profit: (Number(amount) * plan.profitPercent) / 100,
      expireAt: new Date(Date.now() + plan.duration * 24 * 60 * 60 * 1000)
    });
    await invest.save();
    res.json({ message: "Investment Active", balance: user.balance });
  } catch (err) { res.status(500).json({ message: "Failed" }); }
});

// --- ৭. ডিপোজিট ও উইথড্র ---
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const trx = new Transaction({ userId: req.user.id, type: 'deposit', amount: Number(req.body.amount), method: req.body.method, transactionId: req.body.transactionId });
    await trx.save();
    res.json({ message: "Deposit Pending" });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (user.balance < Number(req.body.amount)) return res.status(400).json({ message: "Low Balance" });
    user.balance -= Number(req.body.amount);
    await user.save();
    const trx = new Transaction({ userId: req.user.id, type: 'withdraw', amount: Number(req.body.amount), method: req.body.method });
    await trx.save();
    res.json({ message: "Withdraw Pending", balance: user.balance });
  } catch (err) { res.status(500).json({ message: err.message }); }
});

// --- ৮. অ্যাডমিন অল ডাটা ও রিকোয়েস্ট হ্যান্ডলিং ---
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  const users = await User.find().select('-password');
  const requests = await Transaction.find().populate('userId', 'name email');
  const investments = await Investment.find().populate('userId', 'name email').populate('planId');
  res.json({ users, requests, investments });
});

app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  const { requestId, status } = req.body; 
  const trx = await Transaction.findById(requestId);
  if (status === 'approved' && trx.type === 'deposit') {
    await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
  } else if (status === 'rejected' && trx.type === 'withdraw') {
    await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
  }
  trx.status = status;
  await trx.save();
  res.json({ message: "Success" });
});

app.get("/", (req, res) => res.send("Server running"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));