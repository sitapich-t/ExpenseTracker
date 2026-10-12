/**
 * groupRepository.js
 * ------------------
 * Data Access Layer สำหรับโดเมนกลุ่ม: groups, group_members, group_transactions
 */
const supabase = require('../config/supabase');

// ==========================================
// groups
// ==========================================
const groups = {
  async insert(group) {
    return supabase.from('groups').insert([group]).select();
  },

  async findById(id, select = '*') {
    return supabase.from('groups').select(select).eq('id', id).maybeSingle();
  },

  async findOwned(id, ownerId) {
    return supabase
      .from('groups')
      .select('id')
      .eq('id', id)
      .eq('created_by', ownerId)
      .maybeSingle();
  },

  async findByInviteCode(code, select) {
    return supabase.from('groups').select(select).eq('invite_code', code).maybeSingle();
  },

  async inviteCodeExists(code) {
    return supabase.from('groups').select('id').eq('invite_code', code).maybeSingle();
  },

  async selectTotalSpend(id) {
    return supabase.from('groups').select('total_spend').eq('id', id).single();
  },

  async findMembersCount(id) {
    return supabase.from('groups').select('members_count').eq('id', id).single();
  },

  // อัปเดต total_spend แบบ atomic ผ่าน PostgreSQL RPC
  // (ต้องรัน sql/update_group_spend.sql ก่อน; ถ้ายังไม่ได้รันจะได้ error)
  async updateSpend(groupId, delta) {
    return supabase.rpc('update_group_spend', { p_group_id: groupId, p_delta: delta });
  },

  async updateById(id, patch, { select, single = false } = {}) {
    let query = supabase.from('groups').update(patch).eq('id', id);
    if (select) query = query.select(select);
    if (single) return query.single();
    return query;
  },

  async deleteById(id) {
    return supabase.from('groups').delete().eq('id', id);
  },
};

// ==========================================
// group_members
// ==========================================
const members = {
  async listMembershipsByUser(userId) {
    return supabase.from('group_members').select('group_id, groups (*)').eq('user_id', userId);
  },

  async listMembershipsByGroupIds(groupIds) {
    return supabase
      .from('group_members')
      .select('group_id, user_id, users (id, name, email)')
      .in('group_id', groupIds);
  },

  async memberExists(groupId, userId) {
    return supabase
      .from('group_members')
      .select('id')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle();
  },

  async listMemberIds(groupId) {
    return supabase.from('group_members').select('user_id').eq('group_id', groupId);
  },

  async listMembers(groupId, select = '*') {
    return supabase.from('group_members').select(select).eq('group_id', groupId);
  },

  async insertMember(member, { select, single = false } = {}) {
    let query = supabase.from('group_members').insert([member]);
    if (select) query = query.select(select);
    if (single) return query.single();
    return query;
  },

  async deleteMembersByGroup(groupId) {
    return supabase.from('group_members').delete().eq('group_id', groupId);
  },
};

// ==========================================
// group_transactions
// ==========================================
const transactions = {
  async listByGroupIds(groupIds) {
    return supabase
      .from('group_transactions')
      .select('*')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false });
  },

  async listByGroup(groupId, { select = '*', order = { column: 'created_at', ascending: false } } = {}) {
    return supabase
      .from('group_transactions')
      .select(select)
      .eq('group_id', groupId)
      .order(order.column, { ascending: order.ascending });
  },

  async listForSettlement(groupId) {
    return supabase
      .from('group_transactions')
      .select('id, title, type, subtotal, amount, sc_amount, vat_amount, paid_by, split_data, transaction_date')
      .eq('group_id', groupId);
  },

  async insertTransaction(payload, { single = false } = {}) {
    let query = supabase.from('group_transactions').insert([payload]).select();
    if (single) return query.single();
    return query;
  },

  async deleteByGroup(groupId) {
    return supabase.from('group_transactions').delete().eq('group_id', groupId);
  },
};

module.exports = { groups, members, transactions };
