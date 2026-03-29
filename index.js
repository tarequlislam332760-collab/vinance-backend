const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') }); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();

app.use(cors({
  origin: ["http://localhost:5173", "http://localhost:3000", "https://vinance-frontend.vercel.app"],
  credentials: true
}));
app.use(express.json());

// ডাটাবেজ কানেকশন
mongoose.connect(process.env.MONGO_URI || "mongodb://127.0.0.1:27017/vinance")
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// ইউজার মডেল
const User = mongoose.models.User || mongoose.model('User', new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  balance: { type: Number, default: 0 },
  role: { type: String, enum: ['user', 'admin'], default: 'user' }
}, { timestamps: true }));

// রাউট কানেকশন
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
  } catch (err) { res.status(500).json({ message: "Registration failed" }); }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email: email.toLowerCase() });
  
  if (user && await bcrypt.compare(password, user.password)) {
    const token = jwt.sign(
      { id: user._id, role: user.role }, 
      (process.env.JWT_SECRET || 'secret_123').trim(),
      { expiresIn: '7d' }
    );
    res.json({ token, user: { id: user._id, name: user.name, balance: user.balance, role: user.role } });
  } else {
    res.status(400).json({ message: "Invalid credentials" });
  }
});

app.get("/", (req, res) => res.send("Vinance Server Live"));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

module.exports = app;