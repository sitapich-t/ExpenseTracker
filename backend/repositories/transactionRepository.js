/**
 * transactionRepository.js
 * ------------------------
 * Data Access Layer สำหรับตาราง personal_transactions
 */
const supabase = require('../config/supabase');

const TABLE = 'personal_transactions';
const WITH_CATEGORY = '*, categories(id, name, icon_type)';

module.exports = {
  async listByUser(userId, { type, categoryId, month, year } = {}) {
    let query = supabase.from(TABLE).select(WITH_CATEGORY).eq('user_id', userId);

    if (type) query = query.eq('type', type);
    if (categoryId) query = query.eq('category_id', parseInt(categoryId));

    if (month && year) {
      const startDate = new Date(year, month - 1, 1).toISOString();
      const endDate = new Date(year, month, 0, 23, 59, 59).toISOString();
      query = query.gte('transaction_date', startDate).lte('transaction_date', endDate);
    }

    return query.order('transaction_date', { ascending: false });
  },

  async findById(id, userId) {
    return supabase
      .from(TABLE)
      .select(WITH_CATEGORY)
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
  },

  async findMetaById(id, userId) {
    return supabase
      .from(TABLE)
      .select('category_id, transaction_date, type')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();
  },

  async insert(transaction) {
    return supabase.from(TABLE).insert([transaction]).select(WITH_CATEGORY).single();
  },

  async updateById(id, userId, updates) {
    return supabase
      .from(TABLE)
      .update(updates)
      .eq('id', id)
      .eq('user_id', userId)
      .select(WITH_CATEGORY)
      .single();
  },

  async deleteById(id, userId) {
    return supabase.from(TABLE).delete().eq('id', id).eq('user_id', userId);
  },

  async sumExpensesByBudget(budget) {
    const startDate = new Date(budget.year, budget.month - 1, 1).toISOString();
    const endDate = new Date(budget.year, budget.month, 0, 23, 59, 59).toISOString();

    let query = supabase
      .from(TABLE)
      .select('amount')
      .eq('user_id', budget.user_id)
      .eq('type', 'expense')
      .gte('transaction_date', startDate)
      .lte('transaction_date', endDate);

    if (budget.category_id !== null) {
      query = query.eq('category_id', budget.category_id);
    }

    return query;
  },

  async listForAnalytics(userId, { from, to } = {}) {
    let query = supabase
      .from(TABLE)
      .select('transaction_date, amount, type, categories(id, name, icon_type)')
      .eq('user_id', userId);

    if (from) query = query.gte('transaction_date', new Date(`${from}T00:00:00+07:00`).toISOString());
    if (to) query = query.lte('transaction_date', new Date(`${to}T23:59:59.999+07:00`).toISOString());

    return query.order('transaction_date', { ascending: true });
  },
};
