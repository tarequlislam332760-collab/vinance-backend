const express = require('express');
const router = express.Router();
const { 
    createInvestment, 
    getMyInvestments, 
    getAllPlans, 
    createPlanByAdmin 
} = require('../controllers/investmentController');

// ফাইল স্ট্রাকচার অনুযায়ী middleware ফোল্ডার থেকে auth ইম্পোর্ট করা হচ্ছে
const auth = require('../middleware/auth'); 

// নোট: যদি আপনার adminAuth আলাদা ফাংশন হয়, তবে সেটিও middleware/auth.js থেকে আনুন
// বর্তমানে আপনার দেওয়া কোড অনুযায়ী শুধু 'auth' এক্সপোর্ট করা আছে।
// যদি adminAuth লাগে তবে: const { auth, adminAuth } = require('../middleware/auth');

// --- ইউজারের জন্য রাউটস ---

// ১. সব ইনভেস্টমেন্ট প্ল্যান দেখার জন্য
router.get('/plans', getAllPlans);

// ২. নতুন ইনভেস্টমেন্ট করার জন্য (auth মিডলওয়্যার ব্যবহার করা হয়েছে)
router.post('/invest', auth, createInvestment);

// ৩. ইউজারের নিজের ইনভেস্টমেন্ট লগ দেখার জন্য
router.get('/my-investments', auth, getMyInvestments);


// --- অ্যাডমিনের জন্য রাউটস ---

// ৪. নতুন ইনভেস্টমেন্ট প্ল্যান তৈরি করার জন্য (অ্যাডমিন প্রোটেকশন থাকলে এখানে adminAuth যোগ করবেন)
router.post('/admin/create-plan', auth, createPlanByAdmin);

module.exports = router;