const nodemailer = require('nodemailer');

const GMAIL_USER = process.env.GMAIL_USER || 'sitapich@gmail.com';
const GMAIL_PASS = process.env.GMAIL_PASS || 'hdfi owka mitt rfva';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_PASS
  }
});

const TITLES = {
  register: 'ยืนยันการสมัครสมาชิก',
  reset: 'ยืนยันการรีเซ็ตรหัสผ่าน'
};

async function sendOtpEmail(toEmail, otpCode, purpose = 'register') {
  try {
    await transporter.sendMail({
      from: `"Expense Tracker" <${GMAIL_USER}>`,
      to: toEmail,
      subject: 'รหัส OTP สำหรับยืนยันตัวตน - Expense Tracker',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 8px;">
          <h2>${TITLES[purpose] || TITLES.register}</h2>
          <p>รหัส OTP สำหรับยืนยันตัวตนของคุณคือ:</p>
          <h1 style="color: #4F46E5; letter-spacing: 5px;">${otpCode}</h1>
          <p>รหัสนี้จะหมดอายุภายใน <b>10 นาที</b></p>
          <p style="color: #888; font-size: 12px;">หากคุณไม่ได้เป็นคนทำรายการนี้ กรุณาข้ามอีเมลนี้</p>
        </div>
      `
    });
    console.log(`✉️ ส่งอีเมล OTP สำเร็จไปยัง: ${toEmail}`);
    return { ok: true };
  } catch (err) {
    console.error('⚠️ ส่งอีเมล OTP ล้มเหลว:', err.message);
    console.log(`🔑 OTP สำหรับใช้ยืนยันตัวตน (dev fallback): ${otpCode}`);
    return { ok: true, dev: true };
  }
}

module.exports = { sendOtpEmail };
