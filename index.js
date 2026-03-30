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
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"], 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// --- ২. ডাটাবেজ কানেকশন ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/vinance";
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ DB Error:", err.message));

// --- ৩. মডেলস (Schemas) ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, default: 'user' }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true }, // deposit, withdraw
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  transactionId: { type: String },
  address: { type: String }, 
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

// --- ৬. ইউজার প্যানেল ফাংশনালিটি ---

// ইউজারের নিজস্ব ইনভেস্টমেন্ট লগ (My Investment Logs)
app.get('/api/my-investments', auth, async (req, res) => {
  try {
    const logs = await Investment.find({ userId: req.user.id }).populate('planId').sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json({ message: "Failed to fetch logs" }); }
});

// ইউজারের নিজস্ব ট্রানজেকশন হিস্ট্রি
app.get('/api/my-transactions', auth, async (req, res) => {
  try {
    const logs = await Transaction.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.json(logs);
  } catch (err) { res.status(500).json({ message: "Failed to fetch history" }); }
});

app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method, transactionId } = req.body;
    const trx = new Transaction({ userId: req.user.id, type: 'deposit', amount: Number(amount), method, transactionId });
    await trx.save();
    res.json({ message: "Deposit request submitted." });
  } catch (err) { res.status(500).json({ message: "Deposit failed" }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < Number(amount)) return res.status(400).json({ message: "Insufficient Balance" });
    user.balance -= Number(amount);
    await user.save();
    const trx = new Transaction({ userId: req.user.id, type: 'withdraw', amount: Number(amount), method, address });
    await trx.save();
    res.json({ message: "Withdraw request pending", balance: user.balance });
  } catch (err) { res.status(500).json({ message: "Withdrawal failed" }); }
});

app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);
    if (!plan) return res.status(404).json({ message: "Plan not found" });
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

app.get('/api/plans', async (req, res) => {
  const plans = await Plan.find({ status: true });
  res.json(plans);
});

// --- ৭. অ্যাডমিন প্যানেল API (Manage All Users, Requests) ---

// সব ইউজার ম্যানেজ করা (Manage All Users)
app.get('/api/admin/users', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { res.status(500).json({ message: "Fetch users failed" }); }
});

// ইউজারের ডিটেইলস এবং ব্যালেন্স এডিট (User Details)
app.put('/api/admin/user/:id', auth, adminAuth, async (req, res) => {
  try {
    const { balance, role } = req.body;
    await User.findByIdAndUpdate(req.params.id, { balance, role });
    res.json({ message: "User updated successfully" });
  } catch (err) { res.status(500).json({ message: "Update failed" }); }
});

// ট্রানজেকশন রিকোয়েস্ট লিস্ট (Transaction Requests)
app.get('/api/admin/transactions', auth, adminAuth, async (req, res) => {
  try {
    const trxs = await Transaction.find().populate('userId', 'name email').sort({ createdAt: -1 });
    res.json(trxs);
  } catch (err) { res.status(500).json({ message: "Fetch failed" }); }
});

app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body; 
    const trx = await Transaction.findById(requestId);
    if (!trx || trx.status !== 'pending') return res.status(400).json({ message: "Already processed" });
    if (status === 'approved' && trx.type === 'deposit') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    } else if (status === 'rejected' && trx.type === 'withdraw') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    trx.status = status;
    await trx.save();
    res.json({ message: `Request ${status}` });
  } catch (err) { res.status(500).json({ message: "Action failed" }); }
});

app.post('/api/admin/plans', auth, adminAuth, async (req, res) => {
  try {
    const newPlan = new Plan(req.body);
    await newPlan.save();
    res.status(201).json({ message: "Plan Created" });
  } catch (err) { res.status(500).json({ message: "Failed" }); }
});

// ড্যাশবোর্ডের জন্য অল ডাটা সামারি
app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const usersCount = await User.countDocuments();
    const totalInvest = await Investment.aggregate([{ $group: { _id: null, total: { $sum: "$amount" } } }]);
    const pendingDeps = await Transaction.find({ status: 'pending', type: 'deposit' }).populate('userId', 'name email');
    res.json({ usersCount, totalInvest: totalInvest[0]?.total || 0, pendingDeps });
  } catch (err) { res.status(500).json({ message: "Fetch failed" }); }
});

app.get("/", (req, res) => res.send("Vinance Pro Backend Live"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));