const jwt = require('jsonwebtoken');
const userRepository = require('../repositories/userRepository');

const JWT_SECRET = process.env.JWT_SECRET;

module.exports = async (req, res, next) => {
  try {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ success: false, error: 'Access Token Required' });
    }

    let payload;
    try {
      payload = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ success: false, error: 'Invalid or Expired Token' });
    }

    if (payload.type && payload.type !== 'access') {
      return res.status(401).json({ success: false, error: 'Invalid or Expired Token' });
    }

    if (typeof payload.ver !== 'number') {
      return res
        .status(401)
        .json({ success: false, error: 'เซสชันไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่' });
    }

    const { data: user, error } = await userRepository.findAuthById(payload.id);

    if (error) throw error;

    if (!user || user.token_version !== payload.ver) {
      return res
        .status(401)
        .json({ success: false, error: 'เซสชันหมดอายุแล้ว กรุณาเข้าสู่ระบบใหม่' });
    }

    req.user = payload;
    return next();
  } catch (err) {
    console.error('❌ Auth Middleware Error:', err);
    return res.status(500).json({ success: false, error: 'Server Error' });
  }
};
