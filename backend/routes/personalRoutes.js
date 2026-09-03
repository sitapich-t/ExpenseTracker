const express = require('express');
const router = express.Router();
const authenticate = require('../middlewares/authMiddleware');
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
router.post('/transactions', authenticate, personalController.createTransaction);
router.put('/transactions/:id', authenticate, personalController.updateTransaction);
router.delete('/transactions/:id', authenticate, personalController.deleteTransaction);

module.exports = router;