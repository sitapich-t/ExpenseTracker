const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const { scanUpload } = require('../middlewares/uploadMiddleware');
const personalController = require('../controllers/personalController');

/**
 * @openapi
 * tags:
 *   - name: Budgets
 *   - name: Transactions
 *   - name: Analytics
 */

/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

// ==========================================
// Budgets Routes
// ==========================================

/**
 * @openapi
 * /api/v1/personal/budgets:
 *   get:
 *     summary: ดูงบประมาณทั้งหมดของผู้ใช้
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: รายการงบประมาณ
 *       401:
 *         description: ต้องมี Access Token ที่ถูกต้อง
 */
router.get('/budgets', authenticate, personalController.getBudgets);

/**
 * @openapi
 * /api/v1/personal/budgets:
 *   post:
 *     summary: ตั้งงบประมาณ
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [category, monthly_limit]
 *             properties:
 *               category: { type: string, example: "food" }
 *               monthly_limit: { type: number, example: 3000 }
 *     responses:
 *       201:
 *         description: ตั้งงบสำเร็จ
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.post('/budgets', authenticate, personalController.setBudget);

/**
 * @openapi
 * /api/v1/personal/budgets/{id}:
 *   put:
 *     summary: แก้ไขงบประมาณ
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               category: { type: string }
 *               monthly_limit: { type: number }
 *     responses:
 *       200:
 *         description: แก้ไขสำเร็จ
 *       404:
 *         description: ไม่พบงบประมาณ
 */
router.put('/budgets/:id', authenticate, personalController.updateBudget);

/**
 * @openapi
 * /api/v1/personal/budgets/{id}:
 *   delete:
 *     summary: ลบงบประมาณ
 *     tags: [Budgets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *       404:
 *         description: ไม่พบงบประมาณ
 */
router.delete('/budgets/:id', authenticate, personalController.deleteBudget);

// ==========================================
// Transactions Routes
// ==========================================

/**
 * @openapi
 * /api/v1/personal/transactions:
 *   get:
 *     summary: ดูรายการธุรกรรม (รองรับ filter)
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: month
 *         in: query
 *         schema: { type: string, example: "2026-10" }
 *       - name: category
 *         in: query
 *         schema: { type: string }
 *       - name: type
 *         in: query
 *         schema: { type: string, enum: [income, expense] }
 *     responses:
 *       200:
 *         description: รายการธุรกรรม
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.get('/transactions', authenticate, personalController.getTransactions);

/**
 * @openapi
 * /api/v1/personal/transactions/{id}:
 *   get:
 *     summary: ดูธุรกรรมตาม id
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: ข้อมูลธุรกรรม
 *       404:
 *         description: ไม่พบธุรกรรม
 */
router.get('/transactions/:id', authenticate, personalController.getTransactionById);

/**
 * @openapi
 * /api/v1/personal/transactions:
 *   post:
 *     summary: บันทึกรายรับ/รายจ่าย
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [type, category, amount]
 *             properties:
 *               type: { type: string, enum: [income, expense] }
 *               category: { type: string }
 *               amount: { type: number, example: 150 }
 *               note: { type: string }
 *               date: { type: string, format: date }
 *     responses:
 *       201:
 *         description: บันทึกสำเร็จ
 *       400:
 *         description: ข้อมูลไม่ถูกต้อง
 */
router.post('/transactions', authenticate, personalController.createTransaction);

/**
 * @openapi
 * /api/v1/personal/transactions/scan-receipt:
 *   post:
 *     summary: สแกนใบเสร็จด้วย AI (OCR) เพื่อกรอกข้อมูลอัตโนมัติ
 *     description: "ยิงรูป/สแกนใบเสร็จ (multipart, field: receipt) คืนค่าที่อ่านได้ เช่น vat, serviceCharge, netAmount, items"
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               receipt:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: ข้อมูลที่อ่านจากใบเสร็จ
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 vat: { type: number, example: 7 }
 *                 serviceCharge: { type: number, example: 10 }
 *                 netAmount: { type: number, example: 1284 }
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name: { type: string }
 *                       quantity: { type: number }
 *                       price: { type: number }
 *       400:
 *         description: ไม่พบไฟล์ใบเสร็จ
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.post('/transactions/scan-receipt', authenticate, scanUpload, personalController.scanReceipt);

/**
 * @openapi
 * /api/v1/personal/transactions/{id}:
 *   put:
 *     summary: แก้ไขธุรกรรม
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               type: { type: string, enum: [income, expense] }
 *               category: { type: string }
 *               amount: { type: number }
 *               note: { type: string }
 *               date: { type: string, format: date }
 *     responses:
 *       200:
 *         description: แก้ไขสำเร็จ
 *       404:
 *         description: ไม่พบธุรกรรม
 */
router.put('/transactions/:id', authenticate, personalController.updateTransaction);

/**
 * @openapi
 * /api/v1/personal/transactions/{id}:
 *   delete:
 *     summary: ลบธุรกรรม
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: ลบสำเร็จ
 *       404:
 *         description: ไม่พบธุรกรรม
 */
router.delete('/transactions/:id', authenticate, personalController.deleteTransaction);

// ==========================================
// Analytics Routes
// ==========================================

/**
 * @openapi
 * /api/v1/personal/analytics:
 *   get:
 *     summary: สรุปสถิติรายรับ-รายจ่าย (รายเดือน/รายหมวด)
 *     tags: [Analytics]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: สถิติสรุป
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.get('/analytics', authenticate, personalController.getAnalytics);

module.exports = router;