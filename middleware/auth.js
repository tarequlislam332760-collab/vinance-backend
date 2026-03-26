const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: "No token, authorization denied" });
    }

    // Token ভেরিফাই করা হচ্ছে
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // decoded-এ থাকা 'id' কে req.user-এ সেট করা হচ্ছে যাতে সব রাউটে পাওয়া যায়
    req.user = decoded; 
    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid" });
  }
};

module.exports = auth;