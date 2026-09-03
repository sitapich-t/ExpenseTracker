const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'student_wallet_jwt_secret_key_2026';

module.exports = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, error: 'Access Token Required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(401).json({ success: false, error: 'Invalid or Expired Token' });
    }
    req.user = user;
    next();
  });
};