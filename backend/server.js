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

const app = express();
app.use(cors());

// ขยายขีดจำกัดให้รับ Base64 String ขนาดใหญ่สำหรับสแกนใบเสร็จ
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

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

// ==========================================
// SERVER START
// ==========================================
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`=========================================`);
});