// ==========================================
// Budget Service — คำนวณ % การใช้งบ (personal_budgets)
// และเช็คว่าข้าม threshold (WARNING/OVER) หรือยัง
// ==========================================

const supabase = require('../config/supabase');

const THRESHOLDS = {
  WARNING: 0.8, // 80%
  OVER: 1.0,    // 100%
};

function getBudgetLevel(percentUsed) {
  if (percentUsed >= THRESHOLDS.OVER) return 'OVER';
  if (percentUsed >= THRESHOLDS.WARNING) return 'WARNING';
  return 'NORMAL';
}

// ดึงงบที่เกี่ยวข้องกับ transaction นี้:
// - ถ้ามี categoryId → เอาทั้งงบเฉพาะหมวดนั้น และงบรวม (category_id เป็น null)
// - ถ้าไม่มี categoryId → กระทบแค่งบรวมเท่านั้น
async function getRelevantBudgets({ userId, month, year, categoryId }) {
  let query = supabase
    .from('personal_budgets')
    .select('*')
    .eq('user_id', userId)
    .eq('month', month)
    .eq('year', year);

  if (categoryId !== null && categoryId !== undefined) {
    query = query.or(`category_id.eq.${categoryId},category_id.is.null`);
  } else {
    query = query.is('category_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

// รวมยอด "expense" เท่านั้น ภายในเดือน/ปีของ budget นั้น
async function sumSpentForBudget(budget) {
  const startDate = new Date(budget.year, budget.month - 1, 1).toISOString();
  const endDate = new Date(budget.year, budget.month, 0, 23, 59, 59).toISOString();

  let query = supabase
    .from('personal_transactions')
    .select('amount')
    .eq('user_id', budget.user_id)
    .eq('type', 'expense')
    .gte('transaction_date', startDate)
    .lte('transaction_date', endDate);

  if (budget.category_id !== null) {
    query = query.eq('category_id', budget.category_id);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
}

// เช็ค budget ก้อนเดียว → อัปเดต last_notified_level ถ้าข้าม threshold ใหม่
// คืน alert object ถ้ามีสิ่งที่ต้องแจ้งเตือน, คืน null ถ้าไม่มีอะไรเปลี่ยน
async function checkSingleBudget(budget) {
  const spent = await sumSpentForBudget(budget);
  const percentUsed = budget.monthly_limit > 0 ? spent / budget.monthly_limit : 0;
  const currentLevel = getBudgetLevel(percentUsed);
  const previousLevel = budget.last_notified_level || 'NORMAL';

  // แจ้งเตือนเฉพาะตอน "ข้าม" ระดับใหม่ (กัน spam ทุกครั้งที่มี transaction)
  if (currentLevel !== 'NORMAL' && currentLevel !== previousLevel) {
    await supabase
      .from('personal_budgets')
      .update({ last_notified_level: currentLevel, notified_at: new Date().toISOString() })
      .eq('id', budget.id);

    return {
      budgetId: budget.id,
      categoryId: budget.category_id,
      level: currentLevel,          // 'WARNING' | 'OVER'
      percentUsed,                  // เช่น 0.85
      spent,
      monthlyLimit: budget.monthly_limit,
      month: budget.month,
      year: budget.year,
    };
  }

  // กลับมาต่ำกว่า threshold แล้ว (เช่น ลบ/แก้ transaction) → reset สถานะ ไม่ต้องแจ้งเตือนซ้ำ
  if (currentLevel === 'NORMAL' && previousLevel !== 'NORMAL') {
    await supabase
      .from('personal_budgets')
      .update({ last_notified_level: 'NORMAL' })
      .eq('id', budget.id);
  }

  return null;
}

// เรียกหลัง create/update/delete transaction — เช็คทุก budget ที่เกี่ยวข้องกับ category + เดือนของ transaction นั้น
exports.checkBudgetsAfterTransaction = async ({ userId, categoryId, transactionDate }) => {
  const d = new Date(transactionDate || Date.now());
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  const budgets = await getRelevantBudgets({ userId, month, year, categoryId });
  const results = await Promise.all(budgets.map(checkSingleBudget));
  return results.filter(Boolean);
};

// เรียกหลัง setBudget/updateBudget — เช็คงบก้อนที่เพิ่งตั้ง/แก้เอง
// (เผื่อผู้ใช้ลดวงเงินลงจนต่ำกว่ายอดที่ใช้ไปแล้ว ทำให้เกิน threshold ทันทีโดยไม่มี transaction ใหม่)
exports.checkSingleBudgetById = async (budgetId) => {
  const { data: budget, error } = await supabase
    .from('personal_budgets')
    .select('*')
    .eq('id', budgetId)
    .single();

  if (error) throw error;
  return checkSingleBudget(budget);
};

// export ไว้เผื่อ frontend หรือ controller อื่นอยากคำนวณ level ตรงๆ โดยไม่ผ่าน DB
exports.getBudgetLevel = getBudgetLevel;
exports.THRESHOLDS = THRESHOLDS;