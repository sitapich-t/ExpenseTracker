require('dotenv').config();
process.env.TZ = "Asia/Bangkok";
const express = require('express');
const cors = require('cors');

// ดึง Supabase Instance จาก config/supabase.js (จัดการ WebSocket & .env ให้เสร็จในตัว)
const supabase = require('./config/supabase');

// ดึง Routes
const authRoutes = require('./routes/authRoutes');
const personalRoutes = require('./routes/personalRoutes');
const groupRoutes = require('./routes/groupRoutes');
const billSplitRoutes = require('./routes/billSplitRoutes');

const { SLIP_DIR, ensureDir } = require('./middlewares/uploadMiddleware');

const app = express();
app.use(cors());

// ขยายขีดจำกัดให้รับ Base64 String ขนาดใหญ่สำหรับสแกนใบเสร็จ
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// เสิร์ฟรูปสลิปที่อัปโหลดไว้ (เช่น /uploads/slips/<uuid>.jpg)
// mount แค่โฟลเดอร์ slips เท่านั้น ไฟล์อื่นใน uploads/ (เช่น OCR เก่า) จะไม่ถูกเปิดให้เข้าถึง
ensureDir(SLIP_DIR);
app.use(
  '/uploads/slips',
  express.static(SLIP_DIR, {
    index: false,
    dotfiles: 'ignore',
    maxAge: '7d',
    setHeaders: (res) => {
      // กัน browser เดาชนิดไฟล์เอง (กันพวก .html ที่อาจหลุดเข้ามาในอนาคต)
      res.setHeader('X-Content-Type-Options', 'nosniff');
    },
  })
);

const PORT = process.env.PORT || 3000;

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', supabaseConnected: !!supabase });
});

// ==========================================
// ROUTES MODULES
// ==========================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/personal', personalRoutes);
app.use('/api/v1/groups', groupRoutes);
app.use('/api/v1/bill-split', billSplitRoutes);

// จับ error ที่หลุดจาก route (เช่น multer พัง) ให้เป็น JSON เสมอ
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('❌ Unhandled error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal Server Error',
  });
});

// ==========================================
// SERVER START
// ==========================================
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`=========================================`);
});