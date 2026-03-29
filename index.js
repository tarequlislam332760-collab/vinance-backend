const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

// --- ১. মিডলওয়্যার (CORS & JSON) ---
app.use(cors({ origin: true, credentials: true })); 
app.use(express.json());

// --- ২. ডাটাবেজ কানেকশন ---
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/vinance";
mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ DB Connected!"))
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
  address: String,
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
  amount: Number, profit: Number, status: { type: String, default: 'active' }, expireAt: Date
}, { timestamps: true }));

// --- ৪. অথেন্টিকেশন ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "No Token" });
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

// --- ৫. ইউজার এপিআই ---
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

// --- ৬. TRADE (FIXED) ---
app.post('/api/trade', auth, async (req, res) => {
  try {
    const { amount, type } = req.body;
    const user = await User.findById(req.user.id);
    const tradeAmt = Number(amount);
    if (user.balance < tradeAmt) return res.status(400).json({ message: "Low Balance" });
    
    // ট্রেড রেকর্ড সেভ করা
    const trx = new Transaction({ userId: req.user.id, type: 'trade', amount: tradeAmt, method: type, status: 'completed' });
    await trx.save();
    res.json({ message: `Trade ${type} Success`, balance: user.balance });
  } catch (err) { res.status(500).json({ message: "Trade failed" }); }
});

// --- ৭. WITHDRAW (FIXED BALANCE SYNC) ---
app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, method, address } = req.body;
    const user = await User.findById(req.user.id);
    const withdrawAmt = Number(amount);

    if (user.balance < withdrawAmt) return res.status(400).json({ message: "Low Balance" });
    
    // টাকা কেটে নেওয়া
    user.balance -= withdrawAmt;
    await user.save();

    const trx = new Transaction({ userId: req.user.id, type: 'withdraw', amount: withdrawAmt, method, address, status: 'pending' });
    await trx.save();
    res.json({ message: "Withdraw Pending", balance: user.balance });
  } catch (err) { res.status(500).json({ message: "Withdrawal Failed" }); }
});

// --- ৮. ADMIN: CREATE PLAN (FIXED DATA TYPE) ---
app.post('/api/admin/plans', auth, adminAuth, async (req, res) => {
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
    res.status(201).json({ message: "Plan Created Successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to create plan" });
  }
});

// --- ৯. ADMIN: HANDLE REQUEST (Approve/Reject) ---
app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body; 
    const trx = await Transaction.findById(requestId);
    if (!trx) return res.status(404).json({ message: "Request not found" });

    if (status === 'approved' && trx.type === 'deposit') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    } else if (status === 'rejected' && trx.type === 'withdraw') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    
    trx.status = status;
    await trx.save();
    res.json({ message: "Action Success" });
  } catch (err) {
    res.status(500).json({ message: "Action failed" });
  }
});

app.get("/", (req, res) => res.send("Server Running"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));