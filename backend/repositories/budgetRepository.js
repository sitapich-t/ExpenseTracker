/**
 * budgetRepository.js
 * -------------------
 * Data Access Layer สำหรับตาราง personal_budgets
 */
const supabase = require('../config/supabase');

const TABLE = 'personal_budgets';
const WITH_CATEGORY = '*, categories(id, name, icon_type)';

module.exports = {
  async listByUser(userId, { month, year } = {}) {
    let query = supabase.from(TABLE).select(WITH_CATEGORY).eq('user_id', userId);
    if (month) query = query.eq('month', parseInt(month));
    if (year) query = query.eq('year', parseInt(year));
    return query.order('id', { ascending: true });
  },

  async findExistingForUpsert(userId, { month, year, categoryId }) {
    let query = supabase
      .from(TABLE)
      .select('id, monthly_limit')
      .eq('user_id', userId)
      .eq('month', parseInt(month))
      .eq('year', parseInt(year));

    if (categoryId) {
      query = query.eq('category_id', parseInt(categoryId));
    } else {
      query = query.is('category_id', null);
    }

    return query.maybeSingle();
  },

  async findLimitById(id, userId) {
    return supabase
      .from(TABLE)
      .select('monthly_limit')
      .eq('id', parseInt(id))
      .eq('user_id', userId)
      .maybeSingle();
  },

  async findById(id) {
    return supabase.from(TABLE).select('*').eq('id', id).single();
  },

  async updateById(id, patch, userId) {
    let query = supabase.from(TABLE).update(patch).eq('id', id);
    if (userId) query = query.eq('user_id', userId);
    return query.select(WITH_CATEGORY).single();
  },

  async insert(budget) {
    return supabase.from(TABLE).insert([budget]).select(WITH_CATEGORY).single();
  },

  async deleteById(id, userId) {
    return supabase.from(TABLE).delete().eq('id', parseInt(id)).eq('user_id', userId);
  },

  async listRelevant({ userId, month, year, categoryId }) {
    let query = supabase
      .from(TABLE)
      .select('*')
      .eq('user_id', userId)
      .eq('month', month)
      .eq('year', year);

    if (categoryId !== null && categoryId !== undefined) {
      query = query.or(`category_id.eq.${categoryId},category_id.is.null`);
    } else {
      query = query.is('category_id', null);
    }

    return query;
  },

  async updateNotification(id, patch) {
    return supabase.from(TABLE).update(patch).eq('id', id);
  },
};
