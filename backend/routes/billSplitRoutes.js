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

// ถ้าโปรเจกต์มี authMiddleware อยู่แล้ว (เห็นใน middlewares/authMiddleware.js)
// แนะนำให้ใส่ป้องกัน route เหล่านี้ด้วย เช่น:
// const { verifyToken } = require('../middlewares/authMiddleware');
// router.use(verifyToken);

router.post('/split-bill', splitBill);
router.post('/split-bill/preview', previewBillSplit);
router.post('/simplify-debts', simplifyDebtsHandler);

module.exports = router;