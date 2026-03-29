const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config(); // Vercel-এ path.join দরকার নেই

const app = express();

// CORS Middleware
app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", "https://vinance-frontend.vercel.app"],
  credentials: true
}));
app.use(express.json());

// ডাটাবেজ কানেকশন (Vercel-এর জন্য অপ্টিমাইজড)
let isConnected = false;
const connectDB = async () => {
  if (isConnected) return;
  try {
    const db = await mongoose.connect(process.env.MONGO_URI);
    isConnected = db.connections[0].readyState;
    console.log("✅ DB Connected");
  } catch (err) {
    console.log("❌ DB Error:", err);
  }
};

// ইউজার মডেল
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true }));

// প্রতিটি রিকোয়েস্টে ডাটাবেজ চেক করবে
app.use(async (req, res, next) => {
  await connectDB();
  next();
});

// রাউট কানেকশন (নিশ্চিত করুন routes ফোল্ডার এবং ফাইলের নাম ছোট হাতের)
const investmentRoutes = require('./routes/investmentRoutes');
app.use('/api', investmentRoutes);

// --- অথেন্টিকেশন এপিআই ---
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
    res.status(500).json({ message: "Registration failed", error: err.message }); 
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    
    if (user && await bcrypt.compare(password, user.password)) {
      const secret = (process.env.JWT_SECRET || 'secret_123').trim();
      const token = jwt.sign(
        { id: user._id, role: user.role }, 
        secret,
        { expiresIn: '7d' }
      );
      res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
    } else {
      res.status(400).json({ message: "Invalid credentials" });
    }
  } catch (err) {
    res.status(500).json({ message: "Login error", error: err.message });
  }
});

app.get("/", (req, res) => res.send("Vinance Server Live"));

// --- এই অংশটি Vercel-এর জন্য সবচেয়ে গুরুত্বপূর্ণ ---
module.exports = app; 

// লোকাল পিসিতে চালানোর জন্য
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 5000;
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}