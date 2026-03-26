const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Models & Middleware
const User = require('./models/User'); 
const auth = require('./middleware/auth'); 

dotenv.config();
const app = express();

// --- Middleware & CORS ---
app.use(express.json());
app.use(cors({
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

app.options("/*", cors());

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ DB Error:", err.message));

// --- Admin Auth Middleware ---
const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (user && user.role === 'admin') return next();
    res.status(403).json({ message: "Access Denied: Admins Only" });
  } catch (err) {
    res.status(500).json({ message: "Admin verification failed" });
  }
};

// --- Routes ---
app.get("/", (req, res) => res.send("🚀 Vinance Backend is Live!"));

// Registration
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "ইমেইলটি আগেই ব্যবহার করা হয়েছে" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({ name, email, password: hashedPassword, balance: 5000, role: 'user' });
    await user.save();
    res.status(201).json({ message: "Registration Successful", success: true });
  } catch (err) {
    res.status(500).json({ message: "Server Error", error: err.message });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "ভুল ইমেইল বা পাসওয়ার্ড" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "ভুল ইমেইল বা পাসওয়ার্ড" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Admin Stats & Users
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  const users = await User.find().select('-password').sort({ createdAt: -1 });
  res.json(users);
});

app.post('/api/admin/update-balance', auth, adminOnly, async (req, res) => {
  const { userId, amount, type } = req.body;
  const user = await User.findById(userId);
  if (type === 'add') user.balance += parseFloat(amount);
  else user.balance -= parseFloat(amount);
  await user.save();
  res.json({ message: "Balance Updated", newBalance: user.balance });
});

// User Profile
app.get('/api/profile', auth, async (req, res) => {
  const user = await User.findById(req.user.id).select('-password');
  res.json({ user });
});

// --- Vercel Export (মেইন পরিবর্তন এখানে) ---
module.exports = app; 

// লোকাল হোস্টে চালানোর জন্য
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
}