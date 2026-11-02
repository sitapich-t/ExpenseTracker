const supabase = require('../config/supabase');

class GroupSettlementRepository {
  async findPendingByGroupId(groupId) {
    const { data, error } = await supabase
      .from('group_settlements')
      .select('*')
      .eq('group_id', groupId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async findAllByGroupId(groupId) {
    const { data, error } = await supabase
      .from('group_settlements')
      .select('*')
      .eq('group_id', groupId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  }

  async deletePendingByGroupId(groupId) {
    const { error } = await supabase
      .from('group_settlements')
      .delete()
      .eq('group_id', groupId)
      .eq('status', 'pending');
    if (error) throw error;
    return true;
  }

  async createMany(settlements) {
    if (!settlements || settlements.length === 0) return [];
    const { data, error } = await supabase
      .from('group_settlements')
      .insert(settlements)
      .select();
    if (error) throw error;
    return data || [];
  }

  async markAsPaid(id, paidBy) {
    const { data, error } = await supabase
      .from('group_settlements')
      .update({
        status: 'paid',
        paid_at: new Date().toISOString(),
        paid_by: paidBy,
        updated_at: new Date().toISOString()
      })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async findById(id) {
    const { data, error } = await supabase
      .from('group_settlements')
      .select('*')
      .eq('id', id)
      .single();
    if (error) throw error;
    return data;
  }
}

module.exports = new GroupSettlementRepository();
