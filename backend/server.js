require('dotenv').config();
process.env.TZ = "Asia/Bangkok";

const { validateEnv } = require('./config/env');
validateEnv();

const express = require('express');
const cors = require('cors');
const logger = require('./utils/logger');
const requestIdMiddleware = require('./middlewares/requestIdMiddleware');
const errorMiddleware = require('./middlewares/errorMiddleware');

// ดึง Supabase Instance จาก config/supabase.js (จัดการ WebSocket & .env ให้เสร็จในตัว)
const supabase = require('./config/supabase');

// ดึง Routes
const authRoutes = require('./routes/authRoutes');
const personalRoutes = require('./routes/personalRoutes');
const groupRoutes = require('./routes/groupRoutes');
const billSplitRoutes = require('./routes/billSplitRoutes');

const { SLIP_DIR, ensureDir } = require('./middlewares/uploadMiddleware');

// OpenAPI Docs (swagger-ui) — ดูที่ /api-docs
const swaggerUi = require('swagger-ui-express');
const swaggerSpecs = require('./config/swagger');

// ==========================================
// ROOT ROUTES
// ==========================================

/**
 * @openapi
 * /:
 *   get:
 *     summary: หน้าแรกของ API
 *     tags: [System]
 *     responses:
 *       200:
 *         description: ข้อความบอกว่า API ทำงานอยู่
 */

/**
 * @openapi
 * /api/health:
 *   get:
 *     summary: Health check
 *     tags: [System]
 *     responses:
 *       200:
 *         description: สถานะของเซิร์ฟเวอร์และการเชื่อมต่อ Supabase
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status: { type: string, example: "ok" }
 *                 supabaseConnected: { type: boolean }
 */

const app = express();
app.use(requestIdMiddleware);

// จำกัด origin ของ CORS ตาม env (ค่าเริ่มต้น = หน้าเว็บ dev หลัก)
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean)
  : ['http://localhost:5173', 'http://localhost:8081'];
app.use(cors({ origin: ALLOWED_ORIGINS }));

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

app.get('/', (req, res) => {
  res.send('Expense Tracker API is running!');
});

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

// ==========================================
// OPENAPI DOCS (swagger-ui)
// ==========================================
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpecs, { customSiteTitle: 'Expense Tracker API Docs' }));
app.get('/api-docs.json', (req, res) => res.json(swaggerSpecs));

// จับ error ที่หลุดจาก route (เช่น multer พัง) ให้เป็น JSON เสมอ
app.use(errorMiddleware);

// ==========================================
// SERVER START
// ==========================================
app.listen(PORT, () => {
  logger.info('Server started', {
    url: `http://localhost:${PORT}`,
    health: `http://localhost:${PORT}/api/health`,
  });
});