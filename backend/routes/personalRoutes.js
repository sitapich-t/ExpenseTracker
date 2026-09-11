const express = require('express');
const multer = require('multer');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const personalController = require('../controllers/personalController');

// Setup Multer สำหรับอัปโหลดรูปสแกนใบเสร็จ
const upload = multer({ dest: 'uploads/' });

// รองรับทั้ง 2 แบบ: Multipart (field "receipt") และ JSON base64 (field "image")
const scanUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) return upload.single('receipt')(req, res, next);
  return next();
};

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
router.post('/transactions/scan-receipt', scanUpload, personalController.scanReceipt);
router.put('/transactions/:id', authenticate, personalController.updateTransaction);
router.delete('/transactions/:id', authenticate, personalController.deleteTransaction);

module.exports = router;