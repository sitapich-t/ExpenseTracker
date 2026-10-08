const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const store = require('../utils/memoryStore');
const { signFlowToken, signAccessToken, TTL } = require('../utils/jwt');
const { generateOTP } = require('../utils/otp');
const userService = require('../services/userService');
const { sendOtpEmail } = require('../services/emailService');
const {
  recordOtpSent,
  recordFailedVerify,
  clearVerifyAttempts
} = require('../middlewares/rateLimitMiddleware');

const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// ==========================================
// REGISTER FLOW (stateless, OTP ผ่าน อีเมล)
// ==========================================

exports.registerRequestOtp = async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();
    const cleanName = String(name || '').trim();

    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    if (!cleanName) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    }
    if (cleanPassword.length < 8) {
      return res
        .status(400)
        .json({ success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
    }

    const existing = await userService.findUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ success: false, error: 'อีเมลนี้ถูกลงทะเบียนแล้ว' });
    }

    const hashedPassword = await bcrypt.hash(cleanPassword, 10);
    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    const registration_token = signFlowToken(
      'register_otp',
      { email: cleanEmail, name: cleanName, hashedPassword, otpHash },
      TTL.register_otp
    );

    await sendOtpEmail(cleanEmail, otp, 'register');
    recordOtpSent('register', { email: cleanEmail, ip: req.ip });

    return res.json({
      success: true,
      message: 'ส่งรหัส OTP ไปทางอีเมลแล้ว',
      registration_token,
      expires_in: TTL.register_otp
    });
  } catch (err) {
    console.error('❌ Register Request OTP Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message}` });
  }
};

exports.registerVerifyOtp = async (req, res) => {
  try {
    const t = req.flowToken;
    const otp = String((req.body && req.body.otp) || '').trim();

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, error: 'รหัส OTP ต้องมี 6 หลัก' });
    }

    const ok = await bcrypt.compare(otp, t.otpHash);
    if (!ok) {
      const remaining = recordFailedVerify('register', t);
      return res.status(401).json({
        success: false,
        error: 'รหัส OTP ไม่ถูกต้อง',
        attempts_remaining: remaining
      });
    }

    const existing = await userService.findUserByEmail(t.email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'อีเมลนี้ถูกลงทะเบียนแล้ว' });
    }

    const id = uuidv4();
    const { error } = await supabase
      .from('users')
      .insert([
        {
          id,
          email: t.email,
          password_hash: t.hashedPassword,
          name: t.name,
          is_verified: true,
          token_version: 0
        }
      ])
      .select();

    if (error) {
      if (error.code === '23505') {
        return res.status(409).json({ success: false, error: 'อีเมลนี้ถูกลงทะเบียนแล้ว' });
      }
      throw new Error(`Database Insert Error: ${error.message}`);
    }

    clearVerifyAttempts(t);

    const token = signAccessToken({ id, name: t.name, email: t.email, ver: 0 });

    return res.json({
      success: true,
      message: 'สมัครสมาชิกสำเร็จ',
      token,
      user: { id, name: t.name, email: t.email }
    });
  } catch (err) {
    console.error('❌ Register Verify OTP Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message}` });
  }
};

exports.registerResendOtp = async (req, res) => {
  try {
    const t = req.flowToken;

    const existing = await userService.findUserByEmail(t.email);
    if (existing) {
      return res.status(409).json({ success: false, error: 'อีเมลนี้ถูกลงทะเบียนแล้ว' });
    }

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    const registration_token = signFlowToken(
      'register_otp',
      { email: t.email, name: t.name, hashedPassword: t.hashedPassword, otpHash },
      TTL.register_otp
    );

    await sendOtpEmail(t.email, otp, 'register');
    recordOtpSent('register', { email: t.email, ip: req.ip });

    return res.json({
      success: true,
      message: 'ส่งรหัส OTP ใหม่แล้ว',
      registration_token,
      expires_in: TTL.register_otp
    });
  } catch (err) {
    console.error('❌ Register Resend OTP Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message}` });
  }
};

// ==========================================
// PASSWORD RESET FLOW (stateless, OTP ผ่าน อีเมล)
// ==========================================

exports.resetRequestOtp = async (req, res) => {
  try {
    const cleanEmail = String((req.body && req.body.email) || '').trim().toLowerCase();

    if (!cleanEmail || !EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({ success: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }

    const user = await userService.findUserByEmail(cleanEmail);
    if (!user) {
      await bcrypt.hash('timing-equalizer', 10);
      return res.status(404).json({ success: false, error: 'ไม่พบอีเมลนี้ในระบบ' });
    }
    if (!user.is_verified) {
      return res
        .status(403)
        .json({ success: false, error: 'บัญชีนี้ยังไม่ได้ยืนยันตัวตน กรุณายืนยันรหัส OTP ก่อน' });
    }

    const otp = generateOTP();
    const otpHash = await bcrypt.hash(otp, 10);

    const password_reset_token = signFlowToken(
      'reset_otp',
      { userId: user.id, email: cleanEmail, otpHash },
      TTL.reset_otp
    );

    await sendOtpEmail(cleanEmail, otp, 'reset');
    recordOtpSent('reset', { email: cleanEmail, ip: req.ip });

    return res.json({
      success: true,
      message: 'ส่งรหัส OTP ไปทางอีเมลแล้ว',
      password_reset_token,
      expires_in: TTL.reset_otp
    });
  } catch (err) {
    console.error('❌ Reset Request OTP Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message}` });
  }
};

exports.resetVerifyOtp = async (req, res) => {
  try {
    const t = req.flowToken;
    const otp = String((req.body && req.body.otp) || '').trim();

    if (!/^\d{6}$/.test(otp)) {
      return res.status(400).json({ success: false, error: 'รหัส OTP ต้องมี 6 หลัก' });
    }

    const ok = await bcrypt.compare(otp, t.otpHash);
    if (!ok) {
      const remaining = recordFailedVerify('reset', t);
      return res.status(401).json({
        success: false,
        error: 'รหัส OTP ไม่ถูกต้อง',
        attempts_remaining: remaining
      });
    }

    clearVerifyAttempts(t);

    const reset_verified_token = signFlowToken(
      'reset_verified',
      { userId: t.userId, email: t.email },
      TTL.reset_verified
    );

    return res.json({
      success: true,
      message: 'ยืนยันตัวตนสำเร็จ',
      reset_verified_token,
      expires_in: TTL.reset_verified
    });
  } catch (err) {
    console.error('❌ Reset Verify OTP Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message}` });
  }
};

exports.resetConfirm = async (req, res) => {
  try {
    const t = req.flowToken;

    if (store.get(`used:${t.jti}`)) {
      return res
        .status(401)
        .json({ success: false, error: 'โทเคนนี้ถูกใช้แล้ว กรุณาร้องขอรหัส OTP ใหม่' });
    }

    const newPassword = String((req.body && req.body.newPassword) || '').trim();
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ success: false, error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 8 ตัวอักษร' });
    }

    const user = await userService.findUserById(t.userId);
    if (!user) {
      return res.status(404).json({ success: false, error: 'ไม่พบผู้ใช้ในระบบ' });
    }

    const password_hash = await bcrypt.hash(newPassword, 10);
    const { error } = await supabase
      .from('users')
      .update({ password_hash, token_version: (user.token_version || 0) + 1 })
      .eq('id', t.userId);

    if (error) throw new Error(`Database Update Error: ${error.message}`);

    store.set(`used:${t.jti}`, 1, 5 * 60 * 1000);

    return res.json({
      success: true,
      message: 'เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่'
    });
  } catch (err) {
    console.error('❌ Reset Confirm Error:', err);
    return res.status(500).json({ success: false, error: `Server Error: ${err.message}` });
  }
};
