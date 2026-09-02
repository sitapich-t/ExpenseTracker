const db = require('../config/db');

exports.getTransactions = async (req, res) => {
  const result = await db.query('SELECT * FROM personal_transactions WHERE user_id = $1 ORDER BY transaction_date DESC', [req.user.userId]);
  res.json({ success: true, data: result.rows });
};

exports.createTransaction = async (req, res) => {
  const { categoryId, title, type, amount, merchant } = req.body;
  if (amount <= 0) return res.status(400).json({ success: false, message: 'Amount must be positive' });

  const result = await db.query(
    `INSERT INTO personal_transactions (user_id, category_id, title, type, amount, merchant)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [req.user.userId, categoryId, title, type, amount, merchant]
  );
  res.status(201).json({ success: true, data: result.rows[0] });
};

exports.updateTransaction = async (req, res) => {
  const { id } = req.params;
  const { title, amount, type } = req.body;
  const result = await db.query(
    `UPDATE personal_transactions SET title = $1, amount = $2, type = $3 WHERE id = $4 AND user_id = $5 RETURNING *`,
    [title, amount, type, id, req.user.userId]
  );
  res.json({ success: true, data: result.rows[0] });
};

exports.deleteTransaction = async (req, res) => {
  await db.query('DELETE FROM personal_transactions WHERE id = $1 AND user_id = $2', [req.params.id, req.user.userId]);
  res.json({ success: true, message: 'Deleted successfully' });
};