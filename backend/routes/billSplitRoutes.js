/**
 * billSplitRoutes.js
 * -------------------
 * Route สำหรับฟีเจอร์หารบิล + ลดจำนวนธุรกรรม
 *
 * วิธีติดตั้งเข้ากับโปรเจกต์ (เลือกวิธีใดวิธีหนึ่ง):
 *
 * วิธีที่ 1: ใช้ไฟล์นี้แยกเป็น route ของตัวเอง (แนะนำถ้าอยากให้ endpoint เป็นสัดส่วนชัดเจน)
 *   ใน server.js เพิ่ม:
 *     const billSplitRoutes = require('./routes/billSplitRoutes');
 *     app.use('/api/bill-split', billSplitRoutes);
 *   ผลลัพธ์: endpoint จะเป็น POST /api/bill-split/split-bill เป็นต้น
 *
 * วิธีที่ 2: รวมเข้ากับ groupRoutes.js เดิม (แนะนำถ้าอยากให้ endpoint อยู่ใต้ /api/groups/:groupId/...)
 *   เปิดไฟล์ backend/routes/groupRoutes.js แล้ว copy 3 บรรทัด route ด้านล่างไปวาง
 *   พร้อม import billSplitController เพิ่ม
 */

const express = require('express');
const router = express.Router();

const {
  splitBill,
  previewBillSplit,
  simplifyDebtsHandler,
} = require('../controllers/billSplitController');

// ป้องกันด้วย JWT เหมือน groupRoutes.js (endpoint นี้รับข้อมูลสมาชิก/ยอดเงินของกลุ่ม)
const authenticate = require('../middlewares/authMiddleware');

router.post('/split-bill', authenticate, splitBill);
router.post('/split-bill/preview', authenticate, previewBillSplit);
router.post('/simplify-debts', authenticate, simplifyDebtsHandler);

module.exports = router;