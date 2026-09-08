const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const transactionService = require('../services/transactionService');

// ==========================================
// Groups Controllers (feature/group-management)
// ==========================================

// ดึงรายการกลุ่มทั้งหมดของผู้ใช้
exports.getMyGroups = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ success: true, groups: data || [] });
  } catch (err) {
    console.error('❌ Fetch groups error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// สร้างกลุ่มใหม่
exports.createGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { name, category } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อกลุ่ม' });
    }

    let icon = 'home-outline';
    let iconBg = '#ede9fe';
    let iconColor = '#6d28d9';

    if (category === 'Trip') {
      icon = 'airplane-outline';
      iconBg = '#dbeafe';
      iconColor = '#2563eb';
    } else if (category === 'Food') {
      icon = 'restaurant-outline';
      iconBg = '#fef3c7';
      iconColor = '#d97706';
    } else if (category === 'Event') {
      icon = 'party-popper';
      iconBg = '#fce7f3';
      iconColor = '#db2777';
    }

    const newGroup = {
      id: uuidv4(),
      name: name.trim(),
      category: category || 'General',
      created_by: userId,
      members_count: 1,
      total_spend: 0,
      status_type: 'settled',
      amount: 0,
      icon,
      icon_bg: iconBg,
      icon_color: iconColor,
    };

    const { data, error } = await supabase.from('groups').insert([newGroup]).select();
    if (error) throw error;

    const createdGroup = data[0];

    // ให้ผู้สร้างกลุ่มเป็นสมาชิกคนแรกด้วย (มิฉะนั้น members กับ members_count ไม่ตรงกัน)
    const { error: memberError } = await supabase
      .from('group_members')
      .insert([{
        id: uuidv4(),
        group_id: createdGroup.id,
        user_id: userId,
        joined_at: new Date().toISOString(),
      }]);

    if (memberError) throw memberError;

    return res.json({ success: true, message: 'สร้างกลุ่มสำเร็จ', group: createdGroup });
  } catch (err) {
    console.error('❌ Create Group Error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// ลบกลุ่ม (เฉพาะผู้สร้าง) — ลบสมาชิก + ธุรกรรมของกลุ่มตามไปด้วย
exports.deleteGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;

    const { data: group } = await supabase
      .from('groups')
      .select('id')
      .eq('id', id)
      .eq('created_by', userId)
      .maybeSingle();

    if (!group) {
      return res.status(404).json({ success: false, error: 'ไม่พบกลุ่มหรือคุณไม่มีสิทธิ์ลบกลุ่มนี้' });
    }

    const { error: membersError } = await supabase
      .from('group_members')
      .delete()
      .eq('group_id', id);
    if (membersError) throw membersError;

    const { error: txError } = await supabase
      .from('group_transactions')
      .delete()
      .eq('group_id', id);
    if (txError) throw txError;

    const { error } = await supabase
      .from('groups')
      .delete()
      .eq('id', id);
    if (error) throw error;

    return res.json({ success: true, message: 'ลบกลุ่มสำเร็จ' });
  } catch (err) {
    console.error('❌ Delete Group Error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// ==========================================
// Group Transactions Controllers
// ==========================================

// ดึงรายการธุรกรรมของกลุ่ม
exports.getGroupTransactions = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('group_transactions')
      .select('*')
      .eq('group_id', id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ success: true, transactions: data || [] });
  } catch (err) {
    console.error('❌ Get group transactions error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// สร้างธุรกรรมใหม่ในกลุ่ม
exports.createGroupTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.user_id;
    const { title, type, amount, merchant, category, date, paid_by } = req.body || {};

    if (!title || !amount) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อรายการและจำนวนเงิน' });
    }

    const newTransaction = {
      id: uuidv4(),
      group_id: id,
      created_by: paid_by || userId,
      title: transactionService.normalizeTitle(title),
      type: type || 'expense',
      amount: transactionService.parseAmount(amount),
      merchant: merchant || 'General',
      category: category || 'General',
      transaction_date: transactionService.resolveDate(date),
    };

    const { data, error } = await supabase
      .from('group_transactions')
      .insert([newTransaction])
      .select()
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      message: 'บันทึกรายการสำเร็จ',
      transaction: data,
    });
  } catch (err) {
    console.error('❌ Create group transaction error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// ==========================================
// Group Members Controllers
// ==========================================

// ดึงสมาชิกทั้งหมดของกลุ่ม
exports.getGroupMembers = async (req, res) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', id);

    if (error) throw error;
    return res.json({ success: true, members: data || [] });
  } catch (err) {
    console.error('❌ Get group members error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// เพิ่มสมาชิกเข้ากลุ่ม
exports.addGroupMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุ user_id ของสมาชิก' });
    }

    const newMember = {
      id: uuidv4(),
      group_id: id,
      user_id,
      joined_at: new Date().toISOString(),
    };

    // เช็คว่าเป็นสมาชิกอยู่แล้วหรือยัง
    const { data: existingMember } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', id)
      .eq('user_id', user_id)
      .maybeSingle();

    if (existingMember) {
      return res.status(400).json({ success: false, error: 'ผู้ใช้นี้เป็นสมาชิกกลุ่มอยู่แล้ว' });
    }

    const { data, error } = await supabase
      .from('group_members')
      .insert([newMember])
      .select()
      .single();

    if (error) throw error;

    // อัปเดตจำนวนสมาชิกให้ตรงกับข้อมูลจริง
    const { data: group } = await supabase
      .from('groups')
      .select('members_count')
      .eq('id', id)
      .single();

    const currentCount = group?.members_count || 1;
    const { error: countError } = await supabase
      .from('groups')
      .update({ members_count: currentCount + 1 })
      .eq('id', id);

    if (countError) throw countError;

    return res.json({ success: true, message: 'เพิ่มสมาชิกสำเร็จ', member: data });
  } catch (err) {
    console.error('❌ Add group member error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};