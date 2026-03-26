const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  
  // ১. রোল ম্যানেজমেন্ট (সবচেয়ে গুরুত্বপূর্ণ)
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },

  // ২. অ্যাকাউন্ট স্ট্যাটাস (ক্লায়েন্ট যেন কাউকে ব্যান করতে পারে)
  status: { 
    type: String, 
    enum: ['active', 'banned', 'pending'], 
    default: 'active' 
  },

  balance: { type: Number, default: 10000 },
  
  // ৩. প্রোফাইল পিকচার (ঐচ্ছিক কিন্তু প্রফেশনাল লুকের জন্য ভালো)
  profileImage: { type: String, default: '' },

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', UserSchema);