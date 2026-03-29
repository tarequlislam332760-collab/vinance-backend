const express = require('express');
const router = express.Router();
const { createInvestment, getMyInvestments, getAllPlans, createPlanByAdmin } = require('../controllers/investmentController');
const { auth, adminAuth } = require('../middleware/auth'); 

router.get('/plans', getAllPlans);
router.post('/invest', auth, createInvestment);
router.get('/my-investments', auth, getMyInvestments);
router.post('/admin/create-plan', auth, adminAuth, createPlanByAdmin);

module.exports = router;