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

/**
 * @openapi
 * tags:
 *   - name: Bill Split
 */

/**
 * @openapi
 * /api/v1/bill-split/split-bill:
 *   post:
 *     summary: คำนวณการหารบิล (แบ่ง VAT/บริการ/คนจ่าย)
 *     tags: [Bill Split]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               totalAmount: { type: number }
 *               vat: { type: number }
 *               serviceCharge: { type: number }
 *               members:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *     responses:
 *       200:
 *         description: ผลการหารบิล (ยอดที่สมาชิกแต่ละคนต้องจ่าย)
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.post('/split-bill', authenticate, splitBill);

/**
 * @openapi
 * /api/v1/bill-split/split-bill/preview:
 *   post:
 *     summary: ดูตัวอย่างการหารบิลก่อนยืนยัน
 *     tags: [Bill Split]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               totalAmount: { type: number }
 *               vat: { type: number }
 *               serviceCharge: { type: number }
 *               members:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: ตัวอย่างผลลัพธ์
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.post('/split-bill/preview', authenticate, previewBillSplit);

/**
 * @openapi
 * /api/v1/bill-split/simplify-debts:
 *   post:
 *     summary: รวมหนี้ระหว่างสมาชิกให้เหลือโอนน้อยครั้งที่สุด
 *     description: "รับ balances แต่ละคน คืนรายการโอนเงินที่แนะนำ (ผลรวม 0 เป๊ะ)"
 *     tags: [Bill Split]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               balances:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     userId: { type: string }
 *                     amount: { type: number }
 *     responses:
 *       200:
 *         description: รายการโอนเงินที่แนะนำ
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.post('/simplify-debts', authenticate, simplifyDebtsHandler);

// หารบิลแบบเลือกวิธีหารได้ (equal / percent / item / amount)

/**
 * @openapi
 * /api/v1/bill-split/split:
 *   post:
 *     summary: หารบิลแบบเลือกวิธี (equal / percent / item / amount)
 *     tags: [Bill Split]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode: { type: string, enum: [equal, percent, item, amount] }
 *               total: { type: number }
 *               members:
 *                 type: array
 *     responses:
 *       200:
 *         description: ผลการหารตามวิธีที่เลือก
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.post('/split', authenticate, split);

module.exports = router;