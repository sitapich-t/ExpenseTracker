const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const groupController = require('../controllers/groupController');

// ==========================================
// Groups Routes (mounted at /api/v1/groups)
// ==========================================
router.get('/my', authenticate, groupController.getMyGroups);
router.post('/create', authenticate, groupController.createGroup);
router.delete('/:id', authenticate, groupController.deleteGroup);

// ==========================================
// Group Transactions Routes
// ==========================================
router.get('/:id/transactions', authenticate, groupController.getGroupTransactions);
router.post('/:id/transactions', authenticate, groupController.createGroupTransaction);

// ==========================================
// Group Members Routes
// ==========================================
router.get('/:id/members', authenticate, groupController.getGroupMembers);
router.post('/:id/members', authenticate, groupController.addGroupMember);

module.exports = router;