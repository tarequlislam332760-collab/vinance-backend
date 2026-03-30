const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

app.use(cors({
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"], 
  credentials: true
}));
app.use(express.json());

// --- DB Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ DB Error:", err));

// --- Models ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: { type: String }, balance: { type: Number, default: 0 }, role: { type: String, default: 'user' }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  type: String, // deposit, withdraw, investment
  amount: Number, 
  status: { type: String, default: 'pending' }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model('Investment', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, 
  planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }, 
  amount: Number, 
  status: { type: String, default: 'active' }
}, { timestamps: true }));

// --- Auth Middleware ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).send("No Token");
  jwt.verify(token, process.env.JWT_SECRET || 'secret_123', (err, decoded) => {
    if (err) return res.status(401).send("Invalid Token");
    req.user = decoded;
    next();
  });
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).send("Forbidden");
};

// --- USER ROUTES (এখানেই আপনার সমস্যা ছিল) ---

// ১. সব প্ল্যান দেখার রুট
app.get('/api/plans', async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch (err) { res.status(500).send("Error fetching plans"); }
});

// ২. ইনভেস্ট করার (Plan Buy) রুট
app.post('/api/invest', auth, async (req, res) => {
  try {
    const { planId, amount } = req.body;
    const user = await User.findById(req.user.id);
    const plan = await Plan.findById(planId);

    if (amount < plan.minAmount || amount > plan.maxAmount) return res.status(400).send("Invalid Amount");
    if (user.balance < amount) return res.status(400).send("Insufficient Balance");

    // ব্যালেন্স কাটা
    user.balance -= amount;
    await user.save();

    // ইনভেস্টমেন্ট রেকর্ড
    const inv = new Investment({ userId: user._id, planId, amount });
    await inv.save();

    // ট্রানজ্যাকশন রেকর্ড
    await new Transaction({ userId: user._id, type: 'investment', amount, status: 'approved' }).save();

    res.json({ success: true, message: "Investment Successful" });
  } catch (err) { res.status(500).send("Investment Failed"); }
});

// ৩. উইথড্র রিকোয়েস্ট পাঠানোর রুট
app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);

    if (user.balance < amount) return res.status(400).send("Insufficient Balance");

    const trx = new Transaction({ userId: user._id, type: 'withdraw', amount, status: 'pending' });
    await trx.save();

    // উইথড্র করলে ব্যালেন্স পেন্ডিং থাকা অবস্থায় কেটে নেওয়া ভালো
    user.balance -= amount;
    await user.save();

    res.json({ success: true, message: "Withdrawal Request Sent" });
  } catch (err) { res.status(500).send("Withdrawal Failed"); }
});

// ৪. ইউজারের নিজস্ব ইনভেস্টমেন্ট লগ
app.get('/api/user/investments', auth, async (req, res) => {
  const invs = await Investment.find({ userId: req.user.id }).populate('planId').sort({createdAt: -1});
  res.json(invs);
});

// --- ADMIN ROUTES ---

app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  const users = await User.find().select('-password');
  const requests = await Transaction.find().populate('userId', 'name email').sort({createdAt: -1});
  const investments = await Investment.find().populate('userId', 'name email').populate('planId').sort({createdAt: -1});
  res.json({ users, requests, investments });
});

app.post('/api/admin/update-balance', auth, adminAuth, async (req, res) => {
  await User.findByIdAndUpdate(req.body.userId, { balance: req.body.balance });
  res.json({ message: "Success" });
});

app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  const { requestId, status } = req.body;
  const trx = await Transaction.findById(requestId);
  
  if (status === 'approved' && trx.status === 'pending') {
    if (trx.type === 'deposit') {
      await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
    }
    // Note: withdraw এর ক্ষেত্রে আমরা টাকা আগেই কেটে রেখেছি, তাই রিজেক্ট হলে ফেরত দিতে হবে
  } else if (status === 'rejected' && trx.type === 'withdraw') {
    await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
  }

  trx.status = status;
  await trx.save();
  res.json({ message: "Request Processed" });
});

app.post('/api/admin/create-plan', auth, adminAuth, async (req, res) => {
  await new Plan(req.body).save();
  res.json({ message: "Plan Created" });
});

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  const hash = await bcrypt.hash(password, 10);
  const user = new User({ name, email: email.toLowerCase(), password: hash });
  await user.save();
  res.json({ success: true });
});

app.post('/api/login', async (req, res) => {
  const user = await User.findOne({ email: req.body.email.toLowerCase() });
  if (user && await bcrypt.compare(req.body.password, user.password)) {
    const token = jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET || 'secret_123');
    res.json({ token, user: { id: user._id, name: user.name, role: user.role, balance: user.balance } });
  } else res.status(400).send("Wrong Credentials");
});

app.get("/", (req, res) => res.send("Vinance Pro API Live"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));