const express = require('express');
const multer = require('multer');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const personalController = require('../controllers/personalController');

// Setup Multer สำหรับอัปโหลดรูปสแกนใบเสร็จ
const upload = multer({ dest: 'uploads/' });

// ==========================================
// Budgets Routes
// ==========================================
router.get('/budgets', authenticate, personalController.getBudgets);
router.post('/budgets', authenticate, personalController.setBudget);
router.put('/budgets/:id', authenticate, personalController.updateBudget);
router.delete('/budgets/:id', authenticate, personalController.deleteBudget);

// ==========================================
// Transactions Routes
// ==========================================
router.get('/transactions', authenticate, personalController.getTransactions);
router.post('/transactions', authenticate, personalController.createTransaction);
// ✅ เพิ่ม authenticate เพื่อกันคนที่ไม่ login ยิง OCR endpoint นี้ได้
router.post('/transactions/scan-receipt', authenticate, upload.single('receipt'), personalController.scanReceipt);
router.put('/transactions/:id', authenticate, personalController.updateTransaction);
router.delete('/transactions/:id', authenticate, personalController.deleteTransaction);

module.exports = router;