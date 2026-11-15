const bcrypt = require('bcrypt');
const supabase = require('../config/supabase'); // 1. เพิ่มการเชื่อมต่อ Supabase (เช็กชื่อตัวแปร export ใน config/supabase.js ด้วยนะครับ)
const { findUserByEmail } = require('../services/userService');
const { signAccessToken } = require('../utils/jwt');
const { recordFailedLogin, clearLoginAttempts } = require('../middlewares/rateLimitMiddleware');

function generateToken(user) {
  return signAccessToken({
    id: user.id,
    name: user.name,
    email: user.email,
    avatar_url: user.avatar_url || null    
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
      const attemptsLeft = await recordFailedLogin(cleanEmail);
      return sendLoginError(res, attemptsLeft);
    }

    const ok = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!ok) {
      const attemptsLeft = await recordFailedLogin(cleanEmail);
      return sendLoginError(res, attemptsLeft);
    }

    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        error: 'บัญชีนี้ยังไม่ได้ยืนยันตัวตน กรุณาติดต่อผู้ดูแลระบบ'
      });
    }

    // ล็อกอินสำเร็จ -> ล้างประวัติการใส่รหัสผ่านผิด
    await clearLoginAttempts(cleanEmail);

    const token = generateToken(user);
    return res.json({
      success: true,
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      user: { 
        id: user.id, 
        email: user.email, 
        name: user.name, 
        phone: user.phone || '',
        ver: user.token_version ?? user.ver ?? 1,
        avatar_url: user.avatar_url || null // <-- เพิ่มบรรทัดนี้
      }
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

// 2. ใช้ exports.updateProfile เพื่อให้ไฟล์ route เรียกใช้ได้
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.user?.id || req.body.userId;
    const { name, phone, avatar_url } = req.body; // 3. ใช้ name ให้ตรงกับ user.name ในระบบเดิม

    if (!userId) {
      return res.status(401).json({ success: false, error: 'ไม่พบข้อมูลผู้ใช้งาน' });
    }

    if (!name || !String(name).trim()) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อ-นามสกุล' });
    }

    const updatePayload = {
      name: String(name).trim(),
      phone: phone ? String(phone).trim() : null,
    };
    if (avatar_url) {
      updatePayload.avatar_url = avatar_url;
    }

    // อัปเดตข้อมูลลงตาราง users ใน Supabase
    const { data, error } = await supabase
      .from('users')
      .update(updatePayload)
      .eq('id', userId)
      .select('id, email, name, phone, avatar_url')
      .single();

    if (error) throw error;

    return res.status(200).json({
      success: true,
      message: 'อัปเดตข้อมูลส่วนตัวเรียบร้อยแล้ว',
      user: data
    });
  } catch (error) {
    console.error('❌ Update Profile Error:', error);
    return res.status(500).json({ success: false, error: `เกิดข้อผิดพลาดในการบันทึกข้อมูล: ${error.message}` });
  }
};