const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
const { scanUpload } = require('../middlewares/uploadMiddleware');
const personalController = require('../controllers/personalController');

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

router.get('/transactions/:id', authenticate, personalController.getTransactionById);

router.post('/transactions', authenticate, personalController.createTransaction);

router.post('/transactions/scan-receipt', authenticate, scanUpload, personalController.scanReceipt);

router.put('/transactions/:id', authenticate, personalController.updateTransaction);

router.delete('/transactions/:id', authenticate, personalController.deleteTransaction);

// ==========================================
// Analytics Routes
// ==========================================

router.get('/analytics', authenticate, personalController.getAnalytics);

module.exports = router;