const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const { slipUpload } = require('../middlewares/uploadMiddleware');
const groupController = require('../controllers/groupController');

/**
 * @openapi
 * tags:
 *   - name: Groups
 *   - name: Group Transactions
 *   - name: Settlement
 */

// ==========================================
// Groups Routes (mounted at /api/v1/groups)
// ==========================================

/**
 * @openapi
 * /api/v1/groups/my:
 *   get:
 *     summary: ดูกลุ่มทั้งหมดที่ผู้ใช้เป็นสมาชิก
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: รายการกลุ่ม
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.get('/my', authenticate, groupController.getMyGroups);

/**
 * @openapi
 * /api/v1/groups/invite/{code}:
 *   get:
 *     summary: ดูกลุ่มผ่านรหัสเชิญ
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: code
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: ข้อมูลกลุ่ม
 *       404:
 *         description: ไม่พบกลุ่ม
 */
router.get('/invite/:code', authenticate, groupController.getGroupByInviteCode);

/**
 * @openapi
 * /api/v1/groups/create:
 *   post:
 *     summary: สร้างกลุ่มใหม่ (ผู้สร้างเป็นเจ้าของ)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name: { type: string, example: "ทริปเกาะช้าง" }
 *               description: { type: string }
 *     responses:
 *       201:
 *         description: สร้างกลุ่มสำเร็จ คืน invite_code
 *       400:
 *         description: ข้อมูลไม่ถูกต้อง
 */
router.post('/create', authenticate, groupController.createGroup);

/**
 * @openapi
 * /api/v1/groups/join:
 *   post:
 *     summary: เข้าร่วมกลุ่มด้วย invite code
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [invite_code]
 *             properties:
 *               invite_code: { type: string }
 *     responses:
 *       200:
 *         description: เข้าร่วมกลุ่มสำเร็จ
 *       404:
 *         description: รหัสเชิญไม่ถูกต้อง
 */
router.post('/join', authenticate, groupController.joinGroup);

/**
 * @openapi
 * /api/v1/groups/{id}:
 *   delete:
 *     summary: ลบกลุ่ม (เฉพาะเจ้าของ)
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: ลบกลุ่มสำเร็จ
 *       403:
 *         description: ไม่ใช่เจ้าของกลุ่ม
 *       404:
 *         description: ไม่พบกลุ่ม
 */
router.delete('/:id', authenticate, groupController.deleteGroup);

/**
 * @openapi
 * /api/v1/groups/{id}/status:
 *   patch:
 *     summary: เปลี่ยนสถานะกลุ่ม (active/closed)
 *     tags: [Groups]
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
 *             required: [status]
 *             properties:
 *               status: { type: string, enum: [active, closed] }
 *     responses:
 *       200:
 *         description: เปลี่ยนสถานะสำเร็จ
 *       403:
 *         description: ไม่ใช่เจ้าของกลุ่ม
 */
router.patch('/:id/status', authenticate, groupController.updateGroupStatus);

// ==========================================
// Group Transactions Routes
// ==========================================

/**
 * @openapi
 * /api/v1/groups/{id}/transactions:
 *   get:
 *     summary: ดูธุรกรรมของกลุ่ม
 *     tags: [Group Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: รายการธุรกรรมของกลุ่ม
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.get('/:id/transactions', authenticate, groupController.getGroupTransactions);

/**
 * @openapi
 * /api/v1/groups/{id}/transactions:
 *   post:
 *     summary: บันทึกธุรกรรมของกลุ่ม (หารอัตโนมัติ)
 *     description: "รองรับ JSON (ส่ง slip_url ที่อัปโหลดไว้แล้ว) หรือ multipart (พร้อมไฟล์สลิป) total_spend อัปเดตแบบ atomic ผ่าน RPC และอ่านข้อมูลสลิปด้วย OCR อัตโนมัติ (คืนใน ocr)"
 *     tags: [Group Transactions]
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
 *             required: [description, amount, split_type]
 *             properties:
 *               description: { type: string }
 *               amount: { type: number }
 *               split_type: { type: string, enum: [equal, custom] }
 *               slip_url: { type: string }
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               description: { type: string }
 *               amount: { type: number }
 *               split_type: { type: string }
 *               slip: { type: string, format: binary }
 *     responses:
 *       201:
 *         description: บันทึกสำเร็จ — คืน slip_url และข้อมูลที่อ่านได้จากสลิป (ocr)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 slip_url: { type: string, nullable: true }
 *                 ocr:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     merchant: { type: string }
 *                     total: { type: number }
 *                     netAmount: { type: number }
 *                     vat: { type: number }
 *                     serviceCharge: { type: number }
 *                     documentType: { type: string }
 *                     bankName: { type: string, nullable: true }
 *                     transactionId: { type: string, nullable: true }
 *                 transaction:
 *                   type: object
 *       403:
 *         description: ไม่ใช่สมาชิกกลุ่ม
 *       400:
 *         description: ข้อมูลไม่ถูกต้อง
 */
router.post('/:id/transactions', authenticate, slipUpload, groupController.createGroupTransaction);

// แก้สัดส่วนของบิลที่มีอยู่ เพื่อแก้ยอดเคลียร์บิลโดยไม่เปลี่ยนยอดรวมกลุ่ม
router.patch('/:id/transactions/:transactionId/split', authenticate, groupController.updateGroupTransactionSplit);

/**
 * @openapi
 * /api/v1/groups/{id}/slips:
 *   post:
 *     summary: อัปโหลดสลิปโอนเงินของกลุ่ม (อ่านข้อมูลสลิปด้วย OCR)
 *     tags: [Groups]
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
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               slip:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: อัปโหลดสำเร็จ คืน slip_url + ข้อมูลจาก OCR (bankName, transactionId, total ฯลฯ)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 slip_url: { type: string }
 *                 ocr:
 *                   type: object
 *                   nullable: true
 *                   properties:
 *                     merchant: { type: string }
 *                     total: { type: number }
 *                     netAmount: { type: number }
 *                     vat: { type: number }
 *                     serviceCharge: { type: number }
 *                     documentType: { type: string }
 *                     bankName: { type: string, nullable: true }
 *                     transactionId: { type: string, nullable: true }
 *                 message: { type: string }
 *       400:
 *         description: ไม่พบไฟล์สลิป
 *       403:
 *         description: ไม่ใช่สมาชิกกลุ่ม
 */
router.post('/:id/slips', authenticate, slipUpload, groupController.uploadGroupSlip);

// คำนวณยอดสะสาง + รายการโอนเงิน ของทั้งกลุ่ม (อ่าน split_data ของแต่ละบิล)

/**
 * @openapi
 * /api/v1/groups/{id}/settlement:
 *   get:
 *     summary: คำนวณยอดสะสางระหว่างสมาชิก
 *     description: "ใช้ debtSimplifier เพื่อผูกหนี้ให้เหลือจำนวนรายการน้อยที่สุด (ผลรวมเป็น 0 แบบเป๊ะ ไม่มีเศษสตางค์)"
 *     tags: [Settlement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: balances + รายการโอนเงินที่แนะนำ
 *       403:
 *         description: ไม่ใช่สมาชิกกลุ่ม
 */
router.get('/:id/settlement', authenticate, groupController.getGroupSettlement);

/**
 * @openapi
 * /api/v1/groups/{id}/reminders:
 *   post:
 *     summary: ส่งแจ้งเตือนทวงเงินไปยังลูกหนี้ทุกคนในกลุ่ม (หรือเฉพาะ debtor_id)
 *     description: ยอดเงินคำนวณจาก settlement ฝั่ง server (หักยอดที่ยืนยันรับเงินแล้ว)
 *     tags: [Settlement]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               debtor_id: { type: string, description: "ไม่ส่ง = ทวงทุกคน" }
 *     responses:
 *       200:
 *         description: "{ sent, recipients: [{ user_id, name, amount }] }"
 *       503:
 *         description: ยังไม่รัน migration create_debt_notifications.sql
 */
router.post('/:id/reminders', authenticate, groupController.sendDebtReminders);

/**
 * @openapi
 * /api/v1/groups/{id}/payments/confirm:
 *   post:
 *     summary: เจ้าหนี้ยืนยันว่าได้รับเงินจาก from_user แล้ว
 *     description: เฉพาะคนที่เป็นผู้รับเงิน (to) ของรายการนั้น; ไม่ส่ง amount = ยืนยันเต็มยอด
 *     tags: [Settlement]
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
 *             required: [from_user]
 *             properties:
 *               from_user: { type: string }
 *               amount: { type: number }
 *     responses:
 *       200:
 *         description: "{ payment, remaining, all_settled }"
 *       404:
 *         description: ไม่พบยอดค้างชำระจาก from_user ถึงผู้ใช้
 */
router.post('/:id/payments/confirm', authenticate, groupController.confirmPaymentReceived);

// ==========================================
// Group Members Routes
// ==========================================

/**
 * @openapi
 * /api/v1/groups/{id}/members:
 *   get:
 *     summary: ดูสมาชิกกลุ่มทั้งหมด
 *     tags: [Groups]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: รายการสมาชิก
 *       401:
 *         description: ไม่ได้ล็อกอิน
 */
router.get('/:id/members', authenticate, groupController.getGroupMembers);

/**
 * @openapi
 * /api/v1/groups/{id}/members:
 *   post:
 *     summary: เพิ่มสมาชิกในกลุ่ม
 *     description: "เฉพาะเจ้าของกลุ่มหรือสมาชิกปัจจุบันเท่านั้นที่เชิญสมาชิกใหม่ได้"
 *     tags: [Groups]
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
 *             required: [user_id]
 *             properties:
 *               user_id: { type: string }
 *     responses:
 *       201:
 *         description: เพิ่มสมาชิกสำเร็จ
 *       403:
 *         description: เฉพาะเจ้าของ/สมาชิกเท่านั้น
 *       404:
 *         description: ไม่พบกลุ่ม
 */
router.post('/:id/members', authenticate, groupController.addGroupMember);

module.exports = router;
