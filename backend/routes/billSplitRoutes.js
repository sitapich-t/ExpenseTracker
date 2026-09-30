const express = require('express');
const router = express.Router();

const {
  splitBill,
  previewBillSplit,
  simplifyDebtsHandler,
  split,
} = require('../controllers/billSplitController');

// ป้องกันด้วย JWT เหมือน groupRoutes.js (endpoint นี้รับข้อมูลสมาชิก/ยอดเงินของกลุ่ม)
const authenticate = require('../middlewares/authMiddleware');

router.post('/split-bill', authenticate, splitBill);
router.post('/split-bill/preview', authenticate, previewBillSplit);
router.post('/simplify-debts', authenticate, simplifyDebtsHandler);

// หารบิลแบบเลือกวิธีหารได้ (equal / percent / item / amount)
router.post('/split', authenticate, split);

module.exports = router;