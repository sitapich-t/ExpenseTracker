const bcrypt = require('bcrypt');
const { findUserByEmail } = require('../services/userService');
const { signAccessToken } = require('../utils/jwt');

function generateToken(user) {
  return signAccessToken({
    id: user.id,
    name: user.name,
    email: user.email,
    ver: user.token_version || 0
  });
}

// LOGIN (เข้าสู่ระบบด้วยอีเมล + รหัสผ่าน)
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const user = await findUserByEmail(cleanEmail);
    if (!user) {
      return res.status(400).json({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const ok = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!ok) {
      return res.status(400).json({ success: false, error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        error: 'บัญชีนี้ยังไม่ได้ยืนยันตัวตน กรุณาติดต่อผู้ดูแลระบบ'
      });
    }

    const token = generateToken(user);
    return res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('❌ Login Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message}` });
  }
};
