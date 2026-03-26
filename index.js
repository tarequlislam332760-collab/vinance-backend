const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const User = require('./models/User'); 
const auth = require('./middleware/auth'); 

dotenv.config();
const app = express();

// --- Middleware & CORS Fix ---
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

// --- Admin Middleware ---
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

// ✅ ১. Register Route (এটি আগে ছিল না, তাই ফেইল করছিল)
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    // ইমেইল চেক
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে" });

    // পাসওয়ার্ড হ্যাশ করা (নিরাপত্তার জন্য)
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // নতুন ইউজার ডাটাবেজে সেভ (আপনার মডেল অনুযায়ী)
    user = new User({
      name,
      email,
      password: hashedPassword,
      balance: 5000, // আপনি শুরুতে ৫০০০ বোনাস দিতে চেয়েছিলেন
      role: 'user',
      status: 'active'
    });

    await user.save();
    res.status(201).json({ message: "Registration Successful", success: true });
  } catch (err) {
    res.status(500).json({ message: "Database Error: " + err.message });
  }
});

// ✅ ২. Login Route (আপনার দেওয়া কোড)
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "ভুল ইমেইল বা পাসওয়ার্ড" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "ভুল ইমেইল বা পাসওয়ার্ড" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    res.json({ 
      token, 
      user: { id: user._id, name: user.name, email: user.email, balance: user.balance, role: user.role } 
    });
  } catch (err) {
    res.status(500).json({ message: "Server Error" });
  }
});

// Admin Route Example
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 10000;
  app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
}