const express = require('express');
const router = express.Router();
const authenticate = require('../middleware/authMiddleware');

// ==========================================
// 1. PERSONAL TRANSACTIONS API
// ==========================================

// GET: ดึงรายการรายรับ-รายจ่ายส่วนบุคคลทั้งหมด
router.get('/transactions', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const supabase = req.supabase;

    const { data, error } = await supabase
      .from('personal_transactions')
      .select('*, categories(name, icon_type)')
      .eq('user_id', userId)
      .order('transaction_date', { ascending: false });

    if (error) throw error;
    return res.json({ success: true, data: data || [] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// POST: บันทึกรายการรายรับ-รายจ่ายใหม่
router.post('/transactions', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const supabase = req.supabase;
    const { category_id, title, type, amount, merchant, transaction_date } = req.body || {};

    if (!title || amount === undefined) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อรายการและจำนวนเงิน' });
    }

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ success: false, error: 'จำนวนเงินต้องมากกว่า 0' });
    }

    const newTx = {
      user_id: userId,
      category_id: category_id || null,
      title: String(title).trim(),
      type: type === 'income' ? 'income' : 'expense',
      amount: parsedAmount,
      merchant: merchant || null,
      transaction_date: transaction_date || new Date().toISOString()
    };

    const { data, error } = await supabase
      .from('personal_transactions')
      .insert([newTx])
      .select();

    if (error) throw error;
    return res.status(201).json({ success: true, message: 'บันทึกรายการสำเร็จ', data: data[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. PERSONAL BUDGETS API
// ==========================================

// POST: ตั้งค่าหรืออัปเดตงบประมาณประจำเดือน (Upsert)
router.post('/budgets', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const supabase = req.supabase;
    const { monthly_limit, month, year } = req.body || {};

    const parsedLimit = parseFloat(monthly_limit);
    const parsedMonth = parseInt(month, 10);
    const parsedYear = parseInt(year, 10);

    if (isNaN(parsedLimit) || parsedLimit < 0) {
      return res.status(400).json({ success: false, error: 'งบประมาณต้องไม่ติดลบ' });
    }
    if (!parsedMonth || parsedMonth < 1 || parsedMonth > 12) {
      return res.status(400).json({ success: false, error: 'เดือนต้องอยู่ระหว่าง 1 - 12' });
    }
    if (!parsedYear || parsedYear < 2024) {
      return res.status(400).json({ success: false, error: 'ปีต้องระบุเป็น พ.ศ./ค.ศ. ตั้งแต่ 2024 ขึ้นไป' });
    }

    const { data, error } = await supabase
      .from('personal_budgets')
      .upsert(
        {
          user_id: userId,
          monthly_limit: parsedLimit,
          month: parsedMonth,
          year: parsedYear
        },
        { onConflict: 'user_id,month,year' }
      )
      .select();

    if (error) throw error;
    return res.status(200).json({ success: true, message: 'ตั้งงบประมาณสำเร็จ', data: data[0] });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// GET: ดึงสรุปงบประมาณเทียบกับรายจ่ายจริงประจำเดือน
router.get('/budgets/summary', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const supabase = req.supabase;

    const now = new Date();
    const month = parseInt(req.query.month || now.getMonth() + 1, 10);
    const year = parseInt(req.query.year || now.getFullYear(), 10);

    // 1. ดึงงบประมาณที่ตั้งไว้
    const { data: budgetData, error: budgetError } = await supabase
      .from('personal_budgets')
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year)
      .maybeSingle();

    if (budgetError) throw budgetError;

    // 2. คำนวณขอบเขตวันที่ของเดือน
    const startDate = new Date(year, month - 1, 1).toISOString();
    const endDate = new Date(year, month, 0, 23, 59, 59, 999).toISOString();

    // 3. รวมยอดรายจ่าย (expense) ในช่วงเดือนนั้น
    const { data: txData, error: txError } = await supabase
      .from('personal_transactions')
      .select('amount')
      .eq('user_id', userId)
      .eq('type', 'expense')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    if (txError) throw txError;

    const totalExpense = (txData || []).reduce((sum, tx) => sum + Number(tx.amount), 0);
    const monthlyLimit = budgetData ? Number(budgetData.monthly_limit) : 0;
    const remaining = monthlyLimit - totalExpense;
    const percentageUsed = monthlyLimit > 0 ? Number(((totalExpense / monthlyLimit) * 100).toFixed(2)) : 0;

    return res.json({
      success: true,
      data: {
        month,
        year,
        monthly_limit: monthlyLimit,
        total_expense: totalExpense,
        remaining,
        percentage_used: percentageUsed
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;