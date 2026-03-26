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

// --- Middleware & CORS Configuration ---
app.use(express.json());

// ✅ প্রোডাকশন লেভেল CORS ফিক্স
app.use(cors({
  origin: function (origin, callback) {
    // যেকোনো অরিজিন থেকে রিকোয়েস্ট এলাউ করবে (মোবাইল বা ওয়েব অ্যাপের জন্য নিরাপদ)
    if (!origin) return callback(null, true);
    return callback(null, true);
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true
}));

// OPTIONS রিকোয়েস্ট হ্যান্ডেল করা
app.options("*", cors());

// --- Database Connection ---
// নিশ্চিত করুন আপনার .env ফাইলে MONGO_URI ঠিক আছে
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => console.error("❌ DB Connection Error:", err.message));

// --- Auth Routes ---

// ১. রেজিস্ট্রেশন রাউট (এখানে আমি একটু এরর হ্যান্ডলিং বাড়িয়েছি)
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "সবগুলো ঘর পূরণ করুন" });
    }

    // ইমেইল চেক
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ message: "এই ইমেইল দিয়ে আগেই অ্যাকাউন্ট খোলা হয়েছে" });
    }

    // পাসওয়ার্ড হ্যাশ করা
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // নতুন ইউজার তৈরি
    user = new User({
      name,
      email,
      password: hashedPassword,
      balance: 5000, // আপনি চাইলে ডেমো ব্যালেন্স দিতে পারেন
      role: 'user'
    });

    await user.save();
    console.log("New User Registered:", email); // আপনার টার্মিনালে চেক করার জন্য
    res.status(201).json({ message: "Registration Successful", success: true });
  } catch (err) {
    console.error("Register Error:", err.message);
    res.status(500).json({ message: "Registration Failed", error: err.message });
  }
});

// ২. লগইন রাউট
app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "ইমেইল বা পাসওয়ার্ড ভুল" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "ইমেইল বা পাসওয়ার্ড ভুল" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    res.json({ 
      token, 
      user: { 
        id: user._id, 
        name: user.name, 
        email: user.email, 
        balance: user.balance, 
        role: user.role 
      } 
    });
  } catch (err) { 
    res.status(500).json({ message: "Server Error", error: err.message }); 
  }
});

// ... বাকি সব কোড (Admin & User Routes) আগের মতোই থাকবে ...

// --- Server Start ---
const PORT = process.env.PORT || 10000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server Running on port ${PORT}`);
});