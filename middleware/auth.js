const jwt = require('jsonwebtoken');

const auth = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];
  if (!token) return res.status(401).json({ message: "No token, authorization denied" });

  try {
    const decoded = jwt.verify(token, (process.env.JWT_SECRET || 'secret_123').trim());
    req.user = decoded; 
    next();
  } catch (err) {
    res.status(401).json({ message: "Token is not valid or expired" });
  }
};

const adminAuth = (req, res, next) => {
  if (req.user && req.user.role === 'admin') next();
  else res.status(403).json({ message: "Admins Only!" });
};

module.exports = { auth, adminAuth };