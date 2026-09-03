const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');

const JWT_SECRET = process.env.JWT_SECRET || 'student_wallet_jwt_secret_key_2026';

// ==========================================
// HELPER FUNCTIONS
// ==========================================
async function findUserByEmail(email) {
  if (!supabase) {
    throw new Error('Supabase Client ไม่ได้ถูกเริ่มต้น ตรวจสอบค่า SUPABASE_URL และ SUPABASE_KEY ในไฟล์ .env');
  }

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .limit(1);

  if (error) {
    throw new Error(`Database Query Error: ${error.message}`);
  }

  return data && data.length > 0 ? data[0] : null;
}

async function insertUserRecord(user) {
  if (!supabase) {
    throw new Error('Supabase Client ไม่ได้ถูกเริ่มต้น ตรวจสอบค่า SUPABASE_URL และ SUPABASE_KEY ในไฟล์ .env');
  }

  const { data, error } = await supabase
    .from('users')
    .insert([user])
    .select();

  if (error) {
    throw new Error(`Database Insert Error: ${error.message}`);
  }

  if (!data || data.length === 0) {
    throw new Error('ไม่สามารถบันทึกข้อมูลผู้ใช้ลงใน Database ได้');
  }

  return data[0];
}

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

// ==========================================
// CONTROLLERS
// ==========================================

// REGISTER
exports.register = async (req, res) => {
  try {
    const { email, password, name, username } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();
    const cleanName = String(name || username || '').trim();

    if (!cleanEmail || !cleanPassword || !cleanName) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    if (cleanPassword.length < 8) {
      return res.status(400).json({ success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
    }

    const existing = await findUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ success: false, message: 'Email already exists', error: 'อีเมลนี้ถูกใช้งานในระบบแล้ว' });
    }

    const password_hash = await bcrypt.hash(cleanPassword, 10);
    const id = uuidv4();
    const userRecord = { id, email: cleanEmail, password_hash, name: cleanName };
    const savedUser = await insertUserRecord(userRecord);

    const token = generateToken({ id: savedUser.id, email: savedUser.email, name: savedUser.name });

    return res.status(201).json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ',
      token,
      data: { id: savedUser.id, email: savedUser.email, name: savedUser.name }
    });
  } catch (err) {
    console.error('❌ Register Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message || 'Unknown error'}` });
  }
};

// LOGIN
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

    const token = generateToken({ id: user.id, email: user.email, name: user.name });
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