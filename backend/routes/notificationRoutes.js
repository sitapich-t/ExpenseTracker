const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const notificationController = require('../controllers/notificationController');

/**
 * @openapi
 * tags:
 *   - name: Notifications
 */

/**
 * @openapi
 * /api/v1/notifications:
 *   get:
 *     summary: ดึงแจ้งเตือนของฉัน (ทวงเงิน / ยืนยันรับเงิน) ล่าสุด 50 รายการ
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "{ notifications: [...], unread: number }"
 */
router.get('/', authenticate, notificationController.listMyNotifications);

/**
 * @openapi
 * /api/v1/notifications/read:
 *   patch:
 *     summary: ทำเครื่องหมายว่าอ่านแล้ว (ไม่ส่ง ids = อ่านทั้งหมด)
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids: { type: array, items: { type: string } }
 *     responses:
 *       200:
 *         description: สำเร็จ
 */
router.patch('/read', authenticate, notificationController.markNotificationsRead);

module.exports = router;
