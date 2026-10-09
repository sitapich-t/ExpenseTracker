const bcrypt = require('bcrypt');
const { findUserByEmail } = require('../services/userService');
const { signAccessToken } = require('../utils/jwt');
const { recordFailedLogin, clearLoginAttempts } = require('../middlewares/rateLimitMiddleware');

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

    // กรณีไม่พบ User หรือ รหัสผ่านไม่ถูกต้อง
    if (!user) {
      const attemptsLeft = recordFailedLogin(cleanEmail);
      return sendLoginError(res, attemptsLeft);
    }

    const ok = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!ok) {
      const attemptsLeft = recordFailedLogin(cleanEmail);
      return sendLoginError(res, attemptsLeft);
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        error: 'บัญชีนี้ยังไม่ได้ยืนยันตัวตน กรุณาติดต่อผู้ดูแลระบบ'
      });
    }

    // ล็อกอินสำเร็จ -> ล้างประวัติการใส่รหัสผ่านผิด
    clearLoginAttempts(cleanEmail);

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

// Helper response สำหรับจัดการข้อความแจ้งเตือนจำนวนครั้งที่เหลือ
function sendLoginError(res, attemptsLeft) {
  if (attemptsLeft === 0) {
    return res.status(429).json({
      success: false,
      error: 'พยายามเข้าสู่ระบบผิดเกินกำหนด กรุณารอ 15 นาที แล้วลองใหม่อีกครั้ง'
    });
  }

  return res.status(400).json({
    success: false,
    error: `อีเมลหรือรหัสผ่านไม่ถูกต้อง (เหลือโอกาสลองอีก ${attemptsLeft} ครั้ง)`
  });
}