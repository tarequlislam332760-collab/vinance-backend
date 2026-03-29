const express = require('express');
const router = express.Router();
const { 
    createInvestment, 
    getMyInvestments, 
    getAllPlans, 
    createPlanByAdmin 
} = require('../controllers/investmentController');

// middleware/auth.js থেকে অবজেক্ট ডিস্ট্রাকচারিং করে ইম্পোর্ট করা হচ্ছে
const { auth, adminAuth } = require('../middleware/auth'); 

// --- ইউজারের জন্য রাউটস ---

// ১. সব ইনভেস্টমেন্ট প্ল্যান দেখার জন্য (Public or User)
router.get('/plans', getAllPlans);

// ২. নতুন ইনভেস্টমেন্ট করার জন্য (Logged-in User only)
router.post('/invest', auth, createInvestment);

// ৩. ইউজারের নিজের ইনভেস্টমেন্ট লগ দেখার জন্য (Logged-in User only)
router.get('/my-investments', auth, getMyInvestments);


// --- অ্যাডমিনের জন্য রাউটস ---

// ৪. নতুন ইনভেস্টমেন্ট প্ল্যান তৈরি করার জন্য (Admin only)
// এখানে adminAuth যোগ করা হয়েছে যাতে সাধারণ ইউজার প্ল্যান তৈরি করতে না পারে
router.post('/admin/create-plan', auth, adminAuth, createPlanByAdmin);

module.exports = router;