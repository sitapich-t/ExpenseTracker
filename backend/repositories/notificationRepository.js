/**
 * notificationRepository.js
 * -------------------------
 * Data Access Layer: notifications (กล่องแจ้งเตือน) + group_payments (ยืนยันรับเงิน)
 * ต้องรัน sql/create_debt_notifications.sql ก่อน
 */
const supabase = require('../config/supabase');

// ==========================================
// notifications
// ==========================================
const notifications = {
  async insertMany(rows) {
    return supabase.from('notifications').insert(rows).select();
  },

  async listByUser(userId, limit = 50) {
    return supabase
      .from('notifications')
      .select('id, type, title, message, amount, is_read, created_at, group_id, sender_id, groups(id, name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);
  },

  async countUnread(userId) {
    return supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_read', false);
  },

  // ids ว่าง = อ่านทั้งหมดของผู้ใช้คนนี้
  async markRead(userId, ids) {
    let query = supabase.from('notifications').update({ is_read: true }).eq('user_id', userId);
    if (Array.isArray(ids) && ids.length > 0) query = query.in('id', ids);
    return query;
  },
};

// ==========================================
// group_payments
// ==========================================
const payments = {
  async listByGroup(groupId) {
    return supabase
      .from('group_payments')
      .select('id, from_user, to_user, amount, confirmed_at')
      .eq('group_id', groupId)
      .order('confirmed_at', { ascending: false });
  },

  async insert(row) {
    return supabase.from('group_payments').insert([row]).select().single();
  },
};

module.exports = { notifications, payments };
