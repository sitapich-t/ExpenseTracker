const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const nodemailer = require('nodemailer');
const { MailtrapTransport } = require('mailtrap');

const JWT_SECRET = process.env.JWT_SECRET || 'student_wallet_jwt_secret_key_2026';

// ==========================================
// MAILTRAP TRANSPORT CONFIGURATION
// ==========================================
const transporter = nodemailer.createTransport(
  MailtrapTransport({
    token: process.env.MAILTRAP_TOKEN,
  })
);

async function sendOtpEmail(toEmail, otpCode) {
  const sender = {
    address: process.env.MAILTRAP_SENDER_EMAIL || "hello@demomailtrap.co",
    name: process.env.MAILTRAP_SENDER_NAME || "Student Wallet",
  };

  await transporter.sendMail({
    from: sender,
    to: [toEmail],
    subject: 'รหัส OTP สำหรับยืนยันตัวตน - Student Wallet',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
        <h2>ยืนยันการสมัครสมาชิก</h2>
        <p>รหัส OTP สำหรับยืนยันอีเมลของคุณคือ:</p>
        <h1 style="color: #4F46E5; letter-spacing: 5px;">${otpCode}</h1>
        <p>รหัสนี้จะหมดอายุภายใน <b>10 นาที</b></p>
        <p style="color: #888; font-size: 12px;">หากคุณไม่ได้ทำการสมัครสมาชิก กรุณาข้ามอีเมลนี้</p>
      </div>
    `,
    category: "OTP Verification",
  });
}

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

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==========================================
// CONTROLLERS
// ==========================================

// 1. REGISTER (สมัครสมาชิก + ส่ง OTP)
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
    const otp = generateOTP();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // หมดอายุใน 10 นาที

    const userRecord = {
      id,
      email: cleanEmail,
      password_hash,
      name: cleanName,
      is_verified: false,
      otp_code: otp,
      otp_expires_at: otpExpiresAt.toISOString()
    };

    // บันทึกลง Supabase
    await insertUserRecord(userRecord);

    // ส่งอีเมล OTP หาผู้ใช้
    await sendOtpEmail(cleanEmail, otp);

    return res.status(201).json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ กรุณาเช็คอีเมลเพื่อนำรหัส OTP มายืนยัน',
      email: cleanEmail
    });
  } catch (err) {
    console.error('❌ Register Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message || 'Unknown error'}` });
  }
};

// 2. VERIFY OTP (ยืนยันรหัส OTP)
exports.verifyOtp = async (req, res) => {
  try {
    const { email, otp } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !otp) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุอีเมลและรหัส OTP' });
    }

    const user = await findUserByEmail(cleanEmail);
    if (!user) {
      return res.status(400).json({ success: false, error: 'ไม่พบผู้ใช้นี้ในระบบ' });
    }

    if (user.is_verified) {
      return res.status(400).json({ success: false, error: 'อีเมลนี้ได้รับการยืนยันตัวตนเรียบร้อยแล้ว' });
    }

    if (user.otp_code !== String(otp).trim()) {
      return res.status(400).json({ success: false, error: 'รหัส OTP ไม่ถูกต้อง' });
    }

    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ success: false, error: 'รหัส OTP หมดอายุแล้ว กรุณาขอรหัสใหม่' });
    }

    // อัปเดตสถานะเป็นยืนยันแล้ว และล้างรหัส OTP ออก
    const { error } = await supabase
      .from('users')
      .update({ is_verified: true, otp_code: null, otp_expires_at: null })
      .eq('id', user.id);

    if (error) throw error;

    // สร้าง JWT Token ส่งกลับเมื่อยืนยันสำเร็จ
    const token = generateToken({ id: user.id, email: user.email, name: user.name });

    return res.json({
      success: true,
      message: 'ยืนยันตัวตนสำเร็จ เข้าสู่ระบบเรียบร้อย',
      token,
      user: { id: user.id, email: user.email, name: user.name }
    });
  } catch (err) {
    console.error('❌ Verify OTP Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message}` });
  }
};

// 3. LOGIN (เข้าสู่ระบบ - เพิ่มการเช็ค is_verified)
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

    // ตรวจสอบการยืนยันตัวตนผ่าน OTP
    if (!user.is_verified) {
      return res.status(403).json({
        success: false,
        error: 'บัญชีนี้ยังไม่ได้ยืนยันตัวตน กรุณายืนยันรหัส OTP ในอีเมลก่อนเข้าสู่ระบบ'
      });
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