const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// --- ১. মিডলওয়্যার (CORS Fixed for Vercel) ---
app.use(cors({
  origin: ["https://vinance-frontend-vjqa.vercel.app", "http://localhost:5173"], 
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// --- ২. ডাটাবেজ কানেকশন (Vercel Optimization) ---
const MONGO_URI = process.env.MONGO_URI;
mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000 
})
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

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, required: true }, // deposit, withdraw
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  status: { type: String, default: 'pending' }
}, { timestamps: true }));

// --- ৪. মিডলওয়্যার (Auth) ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "Login required" });
  try {
    const secret = (process.env.JWT_SECRET || 'secret_123').trim();
    req.user = jwt.verify(token, secret);
    next();
  } catch (err) { res.status(401).json({ message: "Invalid Session" }); }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Admin access only" });
};

// --- ৫. এপিআই রুটস ---

app.post('/api/login', async (req, res) => {
  try {
    const user = await User.findOne({ email: req.body.email.toLowerCase().trim() });
    if (!user || !(await bcrypt.compare(req.body.password, user.password))) {
      return res.status(400).json({ message: "Wrong email or password" });
    }
    const secret = (process.env.JWT_SECRET || 'secret_123').trim();
    const token = jwt.sign({ id: user._id, role: user.role }, secret, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } catch (err) { res.status(500).json({ message: "Server error" }); }
});

app.get('/api/plans', async (req, res) => {
  try {
    const plans = await Plan.find({ status: true });
    res.json(plans);
  } catch (err) { res.status(500).json({ message: "Could not load plans" }); }
});

// ডিপোজিট রিকোয়েস্ট (ইউজার করবে)
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method } = req.body;
    const trx = new Transaction({ userId: req.user.id, type: 'deposit', amount, method });
    await trx.save();
    res.json({ message: "Deposit request sent!" });
  } catch (err) { res.status(500).json({ message: "Failed to send request" }); }
});

// --- ৬. অ্যাডমিন এপিআই রুটস (Command Center) ---

app.get('/api/admin/all-data', auth, adminAuth, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    const requests = await Transaction.find().populate('userId', 'name email').sort({ createdAt: -1 });
    const investments = await Investment.find().populate('userId', 'name email').populate('planId').sort({ createdAt: -1 });
    
    console.log("✅ Admin Data Sent!"); // টার্মিনালে চেক করার জন্য
    res.json({ users, requests, investments });
  } catch (err) { 
    console.error("❌ Admin Fetch Error:", err);
    res.status(500).json({ message: "Error loading data" }); 
  }
});

// রিকোয়েস্ট হ্যান্ডেল (Approve/Reject)
app.post('/api/admin/handle-request', auth, adminAuth, async (req, res) => {
  try {
    const { requestId, status } = req.body;
    const trx = await Transaction.findById(requestId);
    if (!trx) return res.status(404).json({ message: "Request not found" });

    if (status === 'approved' && trx.status === 'pending') {
      if (trx.type === 'deposit') {
        await User.findByIdAndUpdate(trx.userId, { $inc: { balance: trx.amount } });
      }
    }
    trx.status = status;
    await trx.save();
    res.json({ message: `Request ${status} successfully` });
  } catch (err) { res.status(500).json({ message: "Action failed" }); }
});

app.get("/", (req, res) => res.send("Vinance Pro API Operational"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));