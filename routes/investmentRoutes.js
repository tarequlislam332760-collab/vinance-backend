const express = require('express');
const router = express.Router();
const { 
    createInvestment, 
    getMyInvestments, 
    getAllPlans, 
    createPlanByAdmin 
} = require('../controllers/investmentController');

// index.js থেকে auth এবং adminAuth মিডলওয়্যার আনা হচ্ছে
const { auth, adminAuth } = require('../index'); 

// --- ইউজারের জন্য রাউটস ---

// ১. সব ইনভেস্টমেন্ট প্ল্যান দেখার জন্য (আপনার AI Trading Plans পেজের জন্য)
router.get('/plans', getAllPlans);

// ২. নতুন ইনভেস্টমেন্ট করার জন্য
router.post('/invest', auth, createInvestment);

// ৩. ইউজারের নিজের ইনভেস্টমেন্ট লগ দেখার জন্য (My Investment Logs পেজের জন্য)
router.get('/my-investments', auth, getMyInvestments);


// --- অ্যাডমিনের জন্য রাউটস ---

// ৪. নতুন ইনভেস্টমেন্ট প্ল্যান তৈরি করার জন্য (অ্যাডমিন প্যানেলের জন্য)
router.post('/admin/create-plan', auth, adminAuth, createPlanByAdmin);

module.exports = router;