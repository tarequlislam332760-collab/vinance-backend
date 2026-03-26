const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
  name: { 
    type: String, 
    required: [true, "নাম দেওয়া বাধ্যতামূলক"] 
  },
  email: { 
    type: String, 
    required: [true, "ইমেইল দেওয়া বাধ্যতামূলক"], 
    unique: true,
    lowercase: true,
    trim: true
  },
  password: { 
    type: String, 
    required: [true, "পাসওয়ার্ড দেওয়া বাধ্যতামূলক"] 
  },
  
  // ১. রোল ম্যানেজমেন্ট
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },

  // ২. অ্যাকাউন্ট স্ট্যাটাস
  status: { 
    type: String, 
    enum: ['active', 'banned', 'pending'], 
    default: 'active' 
  },

  balance: { 
    type: Number, 
    default: 0 // শুরুতে ০ রাখা প্রফেশনাল, পরে এডমিন থেকে এড করবেন
  },
  
  // ৩. প্রোফাইল পিকচার
  profileImage: { 
    type: String, 
    default: '' 
  }

}, { 
  // এটি অটোমেটিক createdAt এবং updatedAt তৈরি করে দেবে
  timestamps: true 
});

module.exports = mongoose.model('User', UserSchema);