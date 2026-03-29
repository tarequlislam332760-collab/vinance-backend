const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  try {
    const token = req.header('Authorization')?.split(' ')[1];

    if (!token) {
      return res.status(401).json({ message: "No token, authorization denied" });
    }

    // টোকেন ভেরিফাই করা হচ্ছে
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret_123');
    
    // decoded ডাটা req.user এ সেট করা হচ্ছে
    req.user = decoded; 
    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid or expired" });
  }
};

module.exports = auth;