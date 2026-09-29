const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const { slipUpload } = require('../middlewares/uploadMiddleware');
const groupController = require('../controllers/groupController');

// ==========================================
// Groups Routes (mounted at /api/v1/groups)
// ==========================================
router.get('/my', authenticate, groupController.getMyGroups);
router.get('/invite/:code', authenticate, groupController.getGroupByInviteCode);
router.post('/create', authenticate, groupController.createGroup);
router.post('/join', authenticate, groupController.joinGroup);
router.delete('/:id', authenticate, groupController.deleteGroup);
router.patch('/:id/status', authenticate, groupController.updateGroupStatus);

// ==========================================
// Group Transactions Routes
// ==========================================
// slipUpload จะผ่านตัว multer เฉพาะเมื่อเป็น multipart เท่านั้น
// ถ้าส่ง JSON มาปกติ (ส่ง slip_url ที่อัปโหลดไว้แล้ว) ก็จะเดินต่อได้เลย
router.get('/:id/transactions', authenticate, groupController.getGroupTransactions);
router.post('/:id/transactions', authenticate, slipUpload, groupController.createGroupTransaction);
router.post('/:id/slips', authenticate, slipUpload, groupController.uploadGroupSlip);

// ==========================================
// Group Members Routes
// ==========================================
router.get('/:id/members', authenticate, groupController.getGroupMembers);
router.post('/:id/members', authenticate, groupController.addGroupMember);

module.exports = router;