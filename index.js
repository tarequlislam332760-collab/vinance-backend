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
  .then(() => console.log("✅ DB Connected Successfully"))
  .catch(err => console.log("❌ DB Connection Error:", err));

// --- ২. মডেলস (Models) ---
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true }));

const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['deposit', 'withdraw', 'trade', 'investment'], required: true },
  amount: { type: Number, required: true },
  method: { type: String, default: 'System' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}));

// --- ৩. অথেন্টিকেশন মিডলওয়্যার (অভ্যন্তরীণ ব্যবহারের জন্য) ---
const auth = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "No Token Provided" });
  try {
    req.user = jwt.verify(token, (process.env.JWT_SECRET || 'secret_123').trim());
    next();
  } catch (err) { 
    res.status(401).json({ message: "Invalid Token" }); 
  }
};

// --- ৪. রাউট কানেকশন ---
const investmentRoutes = require('./routes/investmentRoutes');
app.use('/api', investmentRoutes);

// --- ৫. পাবলিক ও ইউজার রাউটস (Auth & Profile) ---
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({ name, email: email.toLowerCase(), password: hashedPassword });
    await newUser.save();
    res.status(201).json({ message: "Registration Successful" });
  } catch (err) { 
    res.status(500).json({ message: "Registration failed" }); 
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      (process.env.JWT_SECRET || 'secret_123').trim()
    );
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } else {
    res.status(400).json({ message: "Invalid credentials" });
  }
});

app.get('/api/user/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json(user);
  } catch (err) { 
    res.status(500).json({ message: "Error fetching user" }); 
  }
});

// --- ৬. ট্রানজ্যাকশন রাউটস ---
app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount, method } = req.body;
    await new Transaction({ 
      userId: req.user.id, type: 'deposit', amount: parseFloat(amount), method, status: 'pending' 
    }).save();
    res.json({ message: "Deposit request submitted" });
  } catch (err) { res.status(500).json({ message: "Deposit failed" }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount, method } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });

    user.balance -= parseFloat(amount);
    await user.save();

    await new Transaction({ 
      userId: req.user.id, type: 'withdraw', amount: parseFloat(amount), method, status: 'pending' 
    }).save();
    res.json({ message: "Withdraw request submitted" });
  } catch (err) { res.status(500).json({ message: "Withdrawal failed" }); }
});

app.get("/", (req, res) => res.send("Vinance Server Live"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Vercel-এর জন্য এক্সপোর্ট
module.exports = app;