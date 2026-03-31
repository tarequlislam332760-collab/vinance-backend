import jwt from 'jsonwebtoken';
import auth from './middleware/auth.js'; // পাথ (Path) ঠিক আছে কি না দেখে নিন
const auth = (req, res, next) => {
  try {
    // হেডার থেকে টোকেন নেওয়া হচ্ছে (ছোট হাতের বা বড় হাতের দুইটাই চেক করবে)
    const authHeader = req.headers.authorization || req.headers.Authorization;
    
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ 
        message: "No token provided or invalid format" 
      });
    }

    const token = authHeader.split(' ')[1];

    // টোকেন ভেরিফাই করা হচ্ছে
    // যদি JWT_SECRET না থাকে তবে এটি ক্যাচ ব্লকে যাবে
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // decoded ডাটা (id, role) req.user এ সেট করা হচ্ছে
    req.user = decoded; 
    
    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err.message);
    res.status(401).json({ 
      message: "Token is not valid or has expired" 
    });
  }
};

export default auth;