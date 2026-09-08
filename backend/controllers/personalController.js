const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const transactionService = require('../services/transactionService');
const ocrService = require('../services/ocrService');

// ==========================================
// Budgets Controllers
// ==========================================

exports.getBudgets = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { month, year } = req.query;

    let query = supabase
      .from('personal_budgets')
      .select('*, categories(id, name, icon_type)')
      .eq('user_id', userId);

    if (month) query = query.eq('month', parseInt(month));
    if (year) query = query.eq('year', parseInt(year));

    const { data, error } = await query.order('id', { ascending: true });

    if (error) throw error;
    return res.json({ success: true, budgets: data || [] });
  } catch (err) {
    console.error('❌ Get budgets error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.setBudget = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { category_id, monthly_limit, month, year } = req.body || {};

    if (!monthly_limit || !month || !year) {
      return res.status(400).json({
        success: false,
        error: 'กรุณากรอกข้อมูลให้ครบถ้วน (monthly_limit, month, year)'
      });
    }

    let checkQuery = supabase
      .from('personal_budgets')
      .select('id')
      .eq('user_id', userId)
      .eq('month', parseInt(month))
      .eq('year', parseInt(year));

    if (category_id) {
      checkQuery = checkQuery.eq('category_id', parseInt(category_id));
    } else {
      checkQuery = checkQuery.is('category_id', null);
    }

    const { data: existing } = await checkQuery.maybeSingle();

    let resultData;

    if (existing) {
      const { data, error } = await supabase
        .from('personal_budgets')
        .update({ monthly_limit: parseFloat(monthly_limit) })
        .eq('id', existing.id)
        .select('*, categories(id, name, icon_type)')
        .single();

      if (error) throw error;
      resultData = data;
    } else {
      const newBudget = {
        user_id: userId,
        category_id: category_id ? parseInt(category_id) : null,
        monthly_limit: parseFloat(monthly_limit),
        month: parseInt(month),
        year: parseInt(year)
      };

      const { data, error } = await supabase
        .from('personal_budgets')
        .insert([newBudget])
        .select('*, categories(id, name, icon_type)')
        .single();

      if (error) throw error;
      resultData = data;
    }

    return res.json({
      success: true,
      message: 'บันทึกงบประมาณสำเร็จ',
      budget: resultData
    });
  } catch (err) {
    console.error('❌ Set budget error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.updateBudget = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;
    const { monthly_limit, category_id } = req.body || {};

    if (monthly_limit === undefined && category_id === undefined) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุ monthly_limit หรือ category_id' });
    }

    // สร้าง object เฉพาะ field ที่ถูกส่งมา เพื่อไม่ให้ field ที่หายไปถูกเขียนทับ
    const updates = {};
    if (monthly_limit !== undefined) updates.monthly_limit = parseFloat(monthly_limit);
    if (category_id !== undefined) {
      updates.category_id = category_id === null || category_id === '' ? null : parseInt(category_id);
    }

    const { data, error } = await supabase
      .from('personal_budgets')
      .update(updates)
      .eq('id', parseInt(id))
      .eq('user_id', userId)
      .select('*, categories(id, name, icon_type)')
      .single();

    if (error) throw error;

    return res.json({ success: true, message: 'อัปเดตงบประมาณสำเร็จ', budget: data });
  } catch (err) {
    console.error('❌ Update budget error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.deleteBudget = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;

    const { error } = await supabase
      .from('personal_budgets')
      .delete()
      .eq('id', parseInt(id))
      .eq('user_id', userId);

    if (error) throw error;

    return res.json({ success: true, message: 'ลบงบประมาณสำเร็จ' });
  } catch (err) {
    console.error('❌ Delete budget error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// ==========================================
// Transactions Controllers
// ==========================================

exports.getTransactions = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { month, year, category_id, type } = req.query;

    let query = supabase
      .from('personal_transactions')
      .select('*, categories(id, name, icon_type)')
      .eq('user_id', userId);

    if (type) query = query.eq('type', type);
    if (category_id) query = query.eq('category_id', parseInt(category_id));

    if (month && year) {
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
      query = query.gte('transaction_date', startDate).lte('transaction_date', endDate);
    }

    const { data, error } = await query.order('transaction_date', { ascending: false });

    if (error) throw error;
    return res.json({ success: true, transactions: data || [] });
  } catch (err) {
    console.error('❌ Get transactions error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { title, type, amount, merchant, category_id, date, transaction_date } = req.body || {};

    if (!title || !amount) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อรายการและจำนวนเงิน' });
    }

    const newTransaction = {
      id: uuidv4(),
      user_id: userId,
      title: transactionService.normalizeTitle(title),
      type: type || 'expense',
      amount: transactionService.parseAmount(amount),
      merchant: merchant || 'General',
      category_id: transactionService.parseCategoryId(category_id),
      transaction_date: transactionService.resolveDate(date || transaction_date),
    };

    const { data, error } = await supabase
      .from('personal_transactions')
      .insert([newTransaction])
      .select('*, categories(id, name, icon_type)')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: 'บันทึกรายการสำเร็จ',
      transaction: data
    });
  } catch (err) {
    console.error('❌ Create transaction error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.updateTransaction = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;
    const { title, type, amount, merchant, category_id, transaction_date } = req.body || {};

    const updateData = {};
    if (title !== undefined) updateData.title = transactionService.normalizeTitle(title);
    if (type !== undefined) updateData.type = type;
    if (amount !== undefined) updateData.amount = transactionService.parseAmount(amount);
    if (merchant !== undefined) updateData.merchant = merchant;
    if (category_id !== undefined) updateData.category_id = transactionService.parseCategoryId(category_id);
    if (transaction_date !== undefined) updateData.transaction_date = transactionService.resolveDate(transaction_date);

    const { data, error } = await supabase
      .from('personal_transactions')
      .update(updateData)
      .eq('id', id)
      .eq('user_id', userId)
      .select('*, categories(id, name, icon_type)')
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: 'อัปเดตรายการสำเร็จ',
      transaction: data
    });
  } catch (err) {
    console.error('❌ Update transaction error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;

    const { error } = await supabase
      .from('personal_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    return res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (err) {
    console.error('❌ Delete transaction error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// สแกนใบเสร็จ (Mock Scanner Endpoint)
exports.scanReceipt = async (req, res) => {
  try {
    const { image } = req.body || {};
    const file = req.file;

    const { merchant, total, parsedText } = ocrService.scanReceipt({ file, image });

    return res.json({
      success: true,
      merchant,
      total,
      date: new Date().toISOString(),
      parsedText,
    });
  } catch (err) {
    console.error('❌ Scan receipt error:', err);
    return res.status(500).json({ success: false, error: 'การอ่านสแกนใบเสร็จล้มเหลว' });
  }
};