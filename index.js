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

// DB Connection
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected!"))
  .catch(err => console.error("❌ DB Error:", err));

// Models
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: String, email: { type: String, unique: true }, password: { type: String }, balance: { type: Number, default: 0 }, role: { type: String, default: 'user' }
}, { timestamps: true }));

const Plan = mongoose.models.Plan || mongoose.model('Plan', new mongoose.Schema({
  name: String, minAmount: Number, maxAmount: Number, profitPercent: Number, duration: Number, status: { type: Boolean, default: true }
}));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, type: String, amount: Number, status: { type: String, default: 'pending' }
}, { timestamps: true }));

const Investment = mongoose.models.Investment || mongoose.model('Investment', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, planId: { type: mongoose.Schema.Types.ObjectId, ref: 'Plan' }, amount: Number, status: { type: String, default: 'active' }
}, { timestamps: true }));

// Auth Middleware
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
  if (req.user.role === 'admin') next();
  else res.status(403).send("Forbidden");
};

// Admin Routes
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
  if (status === 'approved' && trx.status === 'pending' && trx.type === 'deposit') {
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

// Auth Routes (Login/Register)
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
    res.json({ token, user: { name: user.name, role: user.role, balance: user.balance } });
  } else res.status(400).send("Wrong Credentials");
});

app.get("/", (req, res) => res.send("API Live"));
app.listen(5000);