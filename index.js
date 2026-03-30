const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// --- ১. মিডলওয়্যার (ফ্রন্টঅ্যান্ড লিঙ্কের জন্য কনফিগার করা) ---
const corsOptions = {
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"], // Vercel এবং Local দুটোই এলাও করা হলো
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
};
app.use(cors(corsOptions));
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
  type: { type: String, required: true }, 
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  transactionId: { type: String },
  status: { type: String, default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({
  name: { type: String, required: true },
  minAmount: { type: Number, required: true },
  maxAmount: { type: Number, required: true },
  profitPercent: { type: Number, required: true },
  duration: { type: Number, required: true },
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

// --- ৪. অথেন্টিকেশন মিডলওয়্যার ---
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

// --- ৫. ইউজার এপিআই (Register & Login) ---
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) return res.status(400).json({ message: "Email already exists!" });
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({ name, email: email.toLowerCase().trim(), password: hashedPassword });
    await user.save();
    res.status(201).json({ message: "Registration Successful" });
  } catch (err) { res.status(500).json({ message: "Registration Failed" }); }
});

app.post('/api/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) return res.status(400).json({ message: "Invalid Credentials" });
    const secret = (process.env.JWT_SECRET || 'secret_123').trim();
    const token = jwt.sign({ id: user._id, role: user.role }, secret, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Login failed" }); }
});

// --- ৬. ইউজার অ্যাকশন ---
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    const trx = new Transaction({
      userId: req.user.id, type: 'deposit', amount: Number(amount), method, transactionId
    });
    await trx.save();
    res.json({ message: "Deposit request submitted. Pending approval." });
  } catch (err) { res.status(500).json({ message: "Deposit failed" }); }
});

app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);
    const investAmt = Number(amount);

    if (user.balance < investAmt) return res.status(400).json({ message: "Insufficient Balance" });
    
    user.balance -= investAmt;
    await user.save();

    const invest = new Investment({
      userId: user._id, planId: plan._id, amount: investAmt,
      profit: (investAmt * plan.profitPercent) / 100,
      expireAt: new Date(Date.now() + plan.duration * 60 * 60 * 1000)
    });
    await invest.save();
    res.json({ message: "Investment successful", balance: user.balance });
  } catch (err) { res.status(500).json({ message: "Investment failed" }); }
});

// --- ৭. অ্যাডমিন প্যানেল API ---

// অ্যাডমিন ডিপোজিট রিকোয়েস্ট লিস্ট পাওয়ার জন্য (আপনার DepositRequests.jsx এর জন্য)
app.get('/api/admin/deposits', auth, adminAuth, async (req, res) => {
  try {
    const deposits = await Transaction.find({ type: 'deposit' })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 });

    const result = deposits.map(d => ({
      ...d._doc,
      user: d.userId 
    }));
    res.json(result);
  } catch (err) { res.status(500).json({ message: "Fetch failed" }); }
});

// রিকোয়েস্ট অ্যাপ্রুভ বা রিজেক্ট (আপনার handle-request এর উন্নত ভার্সন)
app.put('/api/admin/deposit/:id', auth, adminAuth, async (req, res) => {
  try {
    const { status } = req.body; 
    const trx = await Transaction.findById(req.params.id);
    if (!trx || trx.status !== 'pending') return res.status(400).json({ message: "Invalid or already processed" });

    if (status === 'approved' && trx.type === 'deposit') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    
    trx.status = status;
    await trx.save();
    res.json({ message: `Transaction ${status} successfully` });
  } catch (err) { res.status(500).json({ message: "Action failed" }); }
});

// নতুন প্ল্যান তৈরি
app.post('/api/admin/plans', auth, adminAuth, async (req, res) => {
  try {
    const { name, minAmount, maxAmount, profitPercent, duration } = req.body;
    const newPlan = new Plan({
      name, minAmount: Number(minAmount), maxAmount: Number(maxAmount),
      profitPercent: Number(profitPercent), duration: Number(duration)
    });
    await newPlan.save();
    res.status(201).json({ message: "New Investment Plan Created" });
  } catch (err) { res.status(500).json({ message: "Plan creation failed" }); }
});

app.get("/", (req, res) => res.send("Vinance Backend Server is Running..."));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server started on port ${PORT}`));