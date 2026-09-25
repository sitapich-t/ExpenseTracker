const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const transactionService = require('../services/transactionService');
const ocrService = require('../services/ocrService');
const budgetService = require('../services/budgetService'); // ← เพิ่มใหม่
const { classifyCategory } = require('../services/categoryService');

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
      .select('id, monthly_limit') // ← ต้องดึง monthly_limit เดิมมาด้วย เพื่อเทียบว่าค่าเปลี่ยนจริงไหม
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
      const newLimit = parseFloat(monthly_limit);
      const limitChanged = newLimit !== parseFloat(existing.monthly_limit);

      const updatePayload = { monthly_limit: newLimit };
      // reset สถานะแจ้งเตือนเฉพาะตอนวงเงิน "เปลี่ยนค่าจริง" เท่านั้น
      // ถ้ากดบันทึกค่าเดิมซ้ำ ไม่ต้อง reset — ป้องกันแจ้งเตือนซ้ำที่ระดับเดิม
      if (limitChanged) {
        updatePayload.last_notified_level = 'NORMAL';
      }

      const { data, error } = await supabase
        .from('personal_budgets')
        .update(updatePayload)
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

    // เช็คทันทีหลังตั้ง/แก้วงเงิน เผื่อยอดที่ใช้ไปแล้วเกิน threshold ทันที (เช่น ลดวงเงินลงต่ำกว่ายอดที่ใช้ไปแล้ว)
    let budgetAlert = null;
    try {
      budgetAlert = await budgetService.checkSingleBudgetById(resultData.id);
    } catch (alertErr) {
      console.error('⚠️ Budget alert check failed (setBudget):', alertErr);
    }

    return res.json({
      success: true,
      message: 'บันทึกงบประมาณสำเร็จ',
      budget: resultData,
      budgetAlert
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

    // ดึงค่าปัจจุบันก่อน เพื่อเทียบว่า monthly_limit เปลี่ยนค่าจริงไหม (กันแจ้งเตือนซ้ำถ้ากดบันทึกค่าเดิม)
    const { data: currentBudget } = await supabase
      .from('personal_budgets')
      .select('monthly_limit')
      .eq('id', parseInt(id))
      .eq('user_id', userId)
      .maybeSingle();

    // สร้าง object เฉพาะ field ที่ถูกส่งมา เพื่อไม่ให้ field ที่หายไปถูกเขียนทับ
    const updates = {};
    if (monthly_limit !== undefined) {
      const newLimit = parseFloat(monthly_limit);
      updates.monthly_limit = newLimit;
      const limitChanged = !currentBudget || newLimit !== parseFloat(currentBudget.monthly_limit);
      // reset สถานะแจ้งเตือนเฉพาะตอนวงเงิน "เปลี่ยนค่าจริง" เท่านั้น
      if (limitChanged) {
        updates.last_notified_level = 'NORMAL';
      }
    }
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

    let budgetAlert = null;
    try {
      budgetAlert = await budgetService.checkSingleBudgetById(data.id);
    } catch (alertErr) {
      console.error('⚠️ Budget alert check failed (updateBudget):', alertErr);
    }

    return res.json({ success: true, message: 'อัปเดตงบประมาณสำเร็จ', budget: data, budgetAlert });
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

exports.getTransactionById = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;

    const { data, error } = await supabase
      .from('personal_transactions')
      .select('*, categories(id, name, icon_type)')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      return res.status(404).json({ success: false, error: 'ไม่พบรายการนี้' });
    }

    return res.json({ success: true, transaction: data });
  } catch (err) {
    console.error('❌ Get transaction error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { title, type, amount, merchant, category_id, date, transaction_date, parsedText, items } = req.body || {};

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
      category_id: transactionService.resolveCategoryId({ category_id, merchant, parsedText }),
      transaction_date: transactionService.resolveDate(date || transaction_date),
      items: Array.isArray(items) ? items : [],   // ← เพิ่มบรรทัดนี้: บันทึก line items ลง DB
    };

    const { data, error } = await supabase
      .from('personal_transactions')
      .insert([newTransaction])
      .select('*, categories(id, name, icon_type)')
      .single();

    if (error) throw error;

    // เช็คงบประมาณหลังบันทึกรายการสำเร็จ (เฉพาะ expense เท่านั้นที่มีผลต่องบ)
    let budgetAlerts = [];
    if (data.type === 'expense') {
      try {
        budgetAlerts = await budgetService.checkBudgetsAfterTransaction({
          userId,
          categoryId: data.category_id,
          transactionDate: data.transaction_date,
        });
      } catch (alertErr) {
        console.error('⚠️ Budget alert check failed (createTransaction):', alertErr);
      }
    }

    return res.json({
      success: true,
      message: 'บันทึกรายการสำเร็จ',
      transaction: data,
      budgetAlerts // array ว่าง = ไม่มีอะไรต้องแจ้งเตือน, ไม่ว่าง = frontend โชว์ banner/toast
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

    // ยอดหรือหมวดหมู่อาจเปลี่ยน → เช็คงบใหม่ตามข้อมูลล่าสุดของรายการนี้
    let budgetAlerts = [];
    if (data.type === 'expense') {
      try {
        budgetAlerts = await budgetService.checkBudgetsAfterTransaction({
          userId,
          categoryId: data.category_id,
          transactionDate: data.transaction_date,
        });
      } catch (alertErr) {
        console.error('⚠️ Budget alert check failed (updateTransaction):', alertErr);
      }
    }

    return res.json({
      success: true,
      message: 'อัปเดตรายการสำเร็จ',
      transaction: data,
      budgetAlerts
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

    // ดึงข้อมูลก่อนลบ เพื่อรู้ category/date สำหรับเช็ค budget อีกครั้งหลังลบ
    // (ยอดลดลง อาจทำให้กลับมาต่ำกว่า threshold และต้อง reset สถานะแจ้งเตือน)
    const { data: existing } = await supabase
      .from('personal_transactions')
      .select('category_id, transaction_date, type')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    const { error } = await supabase
      .from('personal_transactions')
      .delete()
      .eq('id', id)
      .eq('user_id', userId);

    if (error) throw error;

    let budgetAlerts = [];
    if (existing && existing.type === 'expense') {
      try {
        budgetAlerts = await budgetService.checkBudgetsAfterTransaction({
          userId,
          categoryId: existing.category_id,
          transactionDate: existing.transaction_date,
        });
      } catch (alertErr) {
        console.error('⚠️ Budget alert check failed (deleteTransaction):', alertErr);
      }
    }

    return res.json({ success: true, message: 'ลบรายการสำเร็จ', budgetAlerts });
  } catch (err) {
    console.error('❌ Delete transaction error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// สแกนใบเสร็จ (รองรับทั้ง Multipart file "receipt" และ JSON base64 "image")
// หมายเหตุ: endpoint นี้แค่ "อ่าน" ใบเสร็จเท่านั้น ยังไม่ได้สร้าง transaction จริง
// ดังนั้นไม่ต้องเช็คงบประมาณตรงนี้ — จะเช็คตอน confirm ผ่าน POST /transactions (createTransaction) แทน
exports.scanReceipt = async (req, res) => {
  try {
    const { image } = req.body || {};
    const file = req.file;

    const result = await ocrService.scanReceipt({ file, image });

    // Auto-fill: เดา category_id จาก merchant + parsedText ที่ OCR อ่านได้
    const { categoryId, confidence } = classifyCategory(
      result.merchant || '',
      result.parsedText || ''
    );

    return res.json({
      success: true,
      merchant: result.merchant || '',
      total: result.total || 0,
      date: result.date || null, // ปล่อยว่างถ้าอ่านวันที่จากสลิปไม่ได้ ให้ผู้ใช้กรอกเอง ไม่ควรเดาเป็นวันนี้
      parsedText: result.parsedText || '',
      items: result.items || [],   // ← เพิ่มบรรทัดนี้: ส่ง line items ที่ OCR สกัดได้กลับไปด้วย
      documentType: result.documentType || 'receipt',
      bankName: result.bankName || null,
      transactionId: result.transactionId || null,
      categoryId: categoryId,
      categoryConfidence: confidence,
    });
  } catch (err) {
    console.error('❌ Scan receipt error:', err);
    return res.status(500).json({ success: false, error: err.message || 'การอ่านสแกนใบเสร็จล้มเหลว' });
  }
};