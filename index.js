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

// আপনার Vercel ফ্রন্টএন্ডের সাথে ব্যাকএন্ড কানেক্ট করার জন্য এই অংশটি খুবই জরুরি
app.use(cors({
  origin: ["https://my-project-sage.vercel.app", "http://localhost:5173"], 
  methods: ["GET", "POST", "PUT", "DELETE"],
  credentials: true
}));

// --- Database Connection ---
mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log("✅ MongoDB Connected Successfully"))
  .catch((err) => console.log("❌ DB Connection Error:", err));

// --- Admin Authorization Middleware ---
const adminOnly = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (user && user.role === 'admin') {
      next();
    } else {
      res.status(403).json({ message: "Access Denied: Admins Only" });
    }
  } catch (err) {
    res.status(500).json({ message: "Admin verification failed" });
  }
};

// --- Auth Routes ---
app.post('/api/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    let user = await User.findOne({ email });
    if (user) return res.status(400).json({ message: "User already exists" });

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    user = new User({
      name,
      email,
      password: hashedPassword,
      balance: 0, 
      role: 'user'
    });

    await user.save();
    res.json({ message: "Registration Successful" });
  } catch (err) {
    res.status(500).json({ message: "Registration Failed" });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "Invalid Credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "Invalid Credentials" });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '24h' });
    
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
    res.status(500).json({ message: "Server Error" }); 
  }
});

// --- Admin Panel API ---
app.get('/api/admin/users', auth, adminOnly, async (req, res) => {
  try {
    const users = await User.find().select('-password');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.get('/api/admin/stats', auth, adminOnly, async (req, res) => {
  try {
    const userCount = await User.countDocuments();
    const allUsers = await User.find({});
    const totalBalance = allUsers.reduce((sum, u) => sum + (u.balance || 0), 0);
    
    res.json({
      users: userCount,
      deposit: totalBalance, 
      withdraw: totalBalance * 0.2, 
      profit: totalBalance * 0.1 
    });
  } catch (err) {
    res.status(500).json({ message: "Stats error" });
  }
});

app.put('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    const { name, balance, role } = req.body;
    const updatedUser = await User.findByIdAndUpdate(
      req.params.id, 
      { name, balance: parseFloat(balance), role }, 
      { new: true }
    );
    res.json(updatedUser);
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

app.post('/api/admin/:type-balance', auth, adminOnly, async (req, res) => {
  try {
    const { userId, amount } = req.body;
    const { type } = req.params; 
    const user = await User.findById(userId);
    
    if (!user) return res.status(404).json({ message: "User not found" });

    if (type === 'add') {
      user.balance += parseFloat(amount);
    } else if (type === 'deduct') {
      user.balance -= parseFloat(amount);
    }

    await user.save();
    res.json({ message: `Balance updated successfully` });
  } catch (err) {
    res.status(500).json({ message: "Balance update failed" });
  }
});

app.delete('/api/admin/users/:id', auth, adminOnly, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User Deleted Successfully" });
  } catch (err) {
    res.status(500).json({ message: "Failed to delete user" });
  }
});

// --- User Routes ---
app.get('/api/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    res.json({ user }); 
  } catch (err) { 
    res.status(500).json({ message: "Error fetching profile" }); 
  }
});

app.post('/api/trade', auth, async (req, res) => {
  try {
    const { type, amount, symbol } = req.body;
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (type === 'buy') {
      if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });
      user.balance -= parseFloat(amount);
    } else if (type === 'sell') {
      user.balance += parseFloat(amount);
    }

    await user.save();
    res.json({ message: "Trade Successful!", newBalance: user.balance });
  } catch (err) {
    res.status(500).json({ message: "Trade failed" });
  }
});

app.post('/api/deposit', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);
    user.balance += parseFloat(amount);
    await user.save();
    res.json({ message: "Deposit Success", newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: "Deposit Failed" }); }
});

app.post('/api/withdraw', auth, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findById(req.user.id);
    if (user.balance < amount) return res.status(400).json({ message: "Insufficient balance" });
    user.balance -= parseFloat(amount);
    await user.save();
    res.json({ message: "Withdraw Success", newBalance: user.balance });
  } catch (err) { res.status(500).json({ message: "Withdraw Failed" }); }
});

// --- Server Start ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server Running on port ${PORT}`));