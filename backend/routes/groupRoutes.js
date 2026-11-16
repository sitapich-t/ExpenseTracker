const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const { slipUpload } = require('../middlewares/uploadMiddleware');
const groupController = require('../controllers/groupController');

router.get('/my', authenticate, groupController.getMyGroups);

router.get('/invite/:code', authenticate, groupController.getGroupByInviteCode);

router.post('/create', authenticate, groupController.createGroup);

router.post('/join', authenticate, groupController.joinGroup);

router.delete('/:id', authenticate, groupController.deleteGroup);

router.patch('/:id/status', authenticate, groupController.updateGroupStatus);

router.patch('/:id/settle-strategy', authenticate, groupController.updateGroupSettleStrategy);

// ==========================================
// Group Transactions Routes
// ==========================================
router.get('/:id/transactions', authenticate, groupController.getGroupTransactions);

router.post('/:id/transactions', authenticate, slipUpload, groupController.createGroupTransaction);

// แก้สัดส่วนของบิลที่มีอยู่ เพื่อแก้ยอดเคลียร์บิลโดยไม่เปลี่ยนยอดรวมกลุ่ม
router.patch('/:id/transactions/:transactionId/split', authenticate, groupController.updateGroupTransactionSplit);
router.delete('/:id/transactions/:transactionId', authenticate, groupController.deleteGroupTransaction);

router.post('/:id/slips', authenticate, slipUpload, groupController.uploadGroupSlip);

// คำนวณยอดสะสาง + รายการโอนเงิน ของทั้งกลุ่ม (อ่าน split_data ของแต่ละบิล)
router.get('/:id/settlement', authenticate, groupController.getGroupSettlement);

router.post('/:id/reminders', authenticate, groupController.sendDebtReminders);

router.post('/:id/payments/confirm', authenticate, groupController.confirmPaymentReceived);

// ==========================================
// Group Members Routes
// ==========================================

router.get('/:id/members', authenticate, groupController.getGroupMembers);

router.post('/:id/members', authenticate, groupController.addGroupMember);

// Settlements (simplified debts - stored in DB)
router.get('/:id/settlements', authenticate, groupController.getGroupSettlements);
router.patch('/:id/settlements/:settlementId/paid', authenticate, groupController.markSettlementPaid);

module.exports = router;