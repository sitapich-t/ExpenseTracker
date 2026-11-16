const { v4: uuidv4 } = require('uuid');
const supabase = require('../config/supabase');
const transactionService = require('../services/transactionService');
const ocrService = require('../services/ocrService');
const { classifyCategory } = require('../services/categoryService');
const { distributeSCVAT } = require('../utils/allocationUtils');
const { validateSplit } = require('../utils/splitMethod');
const { calculateSettlement } = require('../utils/settlementCalculator');
const { slipPathOf, removeSlip } = require('../middlewares/uploadMiddleware');
const { groups, members, transactions } = require('../repositories/groupRepository');
const notificationRepo = require('../repositories/notificationRepository');
const { splitBillForGroup, settleGroupBalances } = require('../services/billSplitService');
const groupSettlementRepo = require('../repositories/groupSettlementRepository');

const isMissingTable = (err) => {
  const msg = String(err?.message || '');
  return err?.code === '42P01' || err?.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(msg);
};

async function listGroupPayments(groupId) {
  const { data, error } = await notificationRepo.payments.listByGroup(groupId);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return data || [];
}

async function computeGroupSettlement(groupId, options = {}) {
  const memberIds = await getGroupMemberIds(groupId);
  const { data, error } = await transactions.listForSettlement(groupId);
  if (error) throw error;
  const payments = await listGroupPayments(groupId);
  return { ...calculateSettlement(data || [], memberIds, payments, options), payments };
}

async function memberNameMap(groupId) {
  const { data } = await members.listMembershipsByGroupIds([groupId]);
  return new Map((data || []).map((m) => [String(m.user_id), m.users?.name || m.users?.email || 'สมาชิก']));
}

const fmtBaht = (n) =>
  Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

async function readSlipOcr(file) {
  if (!file) return null;
  try {
    const result = await ocrService.scanReceipt({ file });
    const { categoryId, confidence } = classifyCategory(
      result.merchant || '',
      result.parsedText || ''
    );
    return {
      merchant: result.merchant || '',
      total: result.total || 0,
      netAmount: result.netAmount ?? result.total ?? 0,
      vat: result.vat || 0,
      serviceCharge: result.serviceCharge || 0,
      date: result.date || null,
      items: result.items || [],
      documentType: result.documentType || 'receipt',
      bankName: result.bankName || null,
      transactionId: result.transactionId || null,
      parsedText: result.parsedText || '',
      categoryId,
      categoryConfidence: confidence,
    };
  } catch (err) {
    console.error('⚠️ OCR สลิปกลุ่มล้มเหลว:', err.message);
    return null;
  }
}

// ==========================================
// Groups Controllers
// ==========================================

const MEMBER_COLORS = ['#EF4444', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'];

exports.getMyGroups = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const { data: memberships, error: mErr } = await members.listMembershipsByUser(userId);
    if (mErr) throw mErr;

    const groupsList = (memberships || []).map((m) => m.groups).filter(Boolean);
    if (groupsList.length === 0) {
      return res.json({ success: true, groups: [] });
    }

    const groupIds = groupsList.map((g) => g.id);

    const { data: memberRows, error: memErr } = await members.listMembershipsByGroupIds(groupIds);
    if (memErr) throw memErr;

    const { data: txRows, error: txErr } = await transactions.listByGroupIds(groupIds);
    if (txErr) throw txErr;

    const nameOf = (groupId, uid) => {
      const row = (memberRows || []).find((m) => m.group_id === groupId && m.user_id === uid);
      return row?.users?.name || row?.users?.email || 'สมาชิก';
    };

    const enriched = groupsList.map((g) => {
      const groupMembers = (memberRows || [])
        .filter((m) => m.group_id === g.id)
        .map((m, i) => ({
          id: m.user_id,
          name: m.users?.name || m.users?.email || 'สมาชิก',
          color: MEMBER_COLORS[i % MEMBER_COLORS.length],
        }));

      const bills = (txRows || [])
        .filter((t) => t.group_id === g.id)
        .map((t) => {
          const payer = t.paid_by || t.created_by;
          return {
            id: t.id,
            title: t.title,
            payer,
            payerName: nameOf(g.id, payer),
            amount: String(t.amount),
            subtotal: t.subtotal !== undefined && t.subtotal !== null ? String(t.subtotal) : null,
            scRate: t.sc_rate ?? 0,
            scAmount: t.sc_amount !== undefined && t.sc_amount !== null ? String(t.sc_amount) : null,
            vatRate: t.vat_rate ?? 0,
            vatAmount: t.vat_amount !== undefined && t.vat_amount !== null ? String(t.vat_amount) : null,
            slipUrl: t.slip_url || null,
            splitData: t.split_data || null,
            type: t.type,
            date: t.transaction_date,
          };
        });

      return {
        ...g,
        color: g.icon_color,
        description: g.category,
        settled: g.status_type === 'settled',
        members: groupMembers,
        bills,
      };
    });

    return res.json({ success: true, groups: enriched });
  } catch (err) {
    console.error('❌ Fetch groups error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genInviteCode = (prefix = 'GR') =>
  prefix +
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

const genUniqueInviteCode = async () => {
  for (let i = 0; i < 8; i += 1) {
    const code = genInviteCode();
    const { data } = await groups.inviteCodeExists(code);
    if (!data) return code;
  }
  return `${genInviteCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
};

const INVITE_CODE_RETRY_MS = 30 * 1000;
let inviteCodeAvailable = null;
let inviteCodeCheckedAt = 0;

const isMissingColumn = (err) => {
  if (!err) return false;
  const message = err.message || '';
  return (
    err.code === '42703' ||
    err.code === 'PGRST204' ||
    /column .* does not exist/i.test(message) ||
    /could not find the .* column/i.test(message) ||
    /schema cache/i.test(message)
  );
};

const inviteCodeUsable = () =>
  inviteCodeAvailable !== false || Date.now() - inviteCodeCheckedAt > INVITE_CODE_RETRY_MS;

const missingColumnOf = (err) => {
  const message = (err && err.message) || '';
  const match =
    message.match(/column\s+[\w.]+\.(\w+)\s+does not exist/i) ||
    message.match(/could not find the '(\w+)' column/i);
  return match ? match[1] : null;
};

const isGroupMember = async (groupId, userId) => {
  const { data, error } = await members.memberExists(groupId, userId);
  if (error) throw error;
  return Boolean(data);
};

const getGroupMemberIds = async (groupId) => {
  const { data, error } = await members.listMemberIds(groupId);
  if (error) throw error;
  return (data || []).map((m) => String(m.user_id));
};

const early = (res, status, error) => {
  if (res.req && res.req.file) {
    try {
      removeSlip(slipPathOf(res.req.file));
    } catch {
      /* ignore */
    }
  }
  return res.status(status).json({ success: false, error });
};

const markInviteCodeUnavailable = () => {
  inviteCodeAvailable = false;
  inviteCodeCheckedAt = Date.now();
};

const markInviteCodeAvailable = () => {
  inviteCodeAvailable = true;
  inviteCodeCheckedAt = Date.now();
};

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
      name: String(name || '').normalize('NFC').trim(),
      category: category || 'General',
      created_by: userId,
      members_count: 1,
      total_spend: 0,
      status_type: 'pending',
      amount: 0,
      icon,
      icon_bg: iconBg,
      icon_color: iconColor,
    };

    if (inviteCodeUsable()) {
      newGroup.invite_code = await genUniqueInviteCode();
    }

    let data = null;
    let error = null;

    ({ data, error } = await groups.insert(newGroup));

    if (error && isMissingColumn(error) && newGroup.invite_code) {
      markInviteCodeUnavailable();
      delete newGroup.invite_code;
      ({ data, error } = await groups.insert(newGroup));
    }

    if (error) throw error;
    markInviteCodeAvailable();

    const createdGroup = data[0];

    const { error: memberError } = await members.insertMember({
      id: uuidv4(),
      group_id: createdGroup.id,
      user_id: userId,
      joined_at: new Date().toISOString(),
    });

    if (memberError) throw memberError;

    return res.json({ success: true, message: 'สร้างกลุ่มสำเร็จ', group: createdGroup });
  } catch (err) {
    console.error('❌ Create Group Error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.deleteGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;

    const { data: group } = await groups.findOwned(id, userId);
    if (!group) {
      return res.status(404).json({ success: false, error: 'ไม่พบกลุ่มหรือคุณไม่มีสิทธิ์ลบกลุ่มนี้' });
    }

    const { error: membersError } = await members.deleteMembersByGroup(id);
    if (membersError) throw membersError;

    const { error: txError } = await transactions.deleteByGroup(id);
    if (txError) throw txError;

    const { error } = await groups.deleteById(id);
    if (error) throw error;

    return res.json({ success: true, message: 'ลบกลุ่มสำเร็จ' });
  } catch (err) {
    console.error('❌ Delete Group Error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.deleteGroupTransaction = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id, transactionId } = req.params;

    if (!(await isGroupMember(id, userId))) {
      return res.status(403).json({ success: false, error: 'ข้อความผู้ใช้ไม่ใช่สมาชิกของกลุ่มนี้' });
    }

    const { error } = await transactions.deleteByGroupAndId(id, transactionId);
    if (error) throw error;

    return res.json({ success: true, message: 'ลบรายการสำเร็จ' });
  } catch (err) {
    console.error('Delete Group Transaction Error:', err);
    return res.status(500).json({ success: false, error: 'Database Error: ' + err.message });
  }
};

// ==========================================
// Group Transactions Controllers
// ==========================================

exports.getGroupTransactions = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.user_id;

    if (!(await isGroupMember(id, userId))) {
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

    const { data, error } = await transactions.listByGroup(id);
    if (error) throw error;
    return res.json({ success: true, transactions: data || [] });
  } catch (err) {
    console.error('❌ Get group transactions error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// GET /:id/settlement
exports.getGroupSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.user_id;

    if (!(await isGroupMember(id, userId))) {
      return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงกลุ่มนี้' });
    }

    const settleOptions = {};
    const { data: groupMeta } = await groups.findById(id, 'settle_strategy, hub_person');
    const strategyParam = String(
      req.query?.strategy || req.body?.strategy || groupMeta?.settle_strategy || 'greedy'
    ).toLowerCase();
    const hubPersonParam =
      req.query?.hubPerson !== undefined
        ? req.query.hubPerson
        : req.body?.hubPerson !== undefined
          ? req.body.hubPerson
          : groupMeta?.hub_person;

    if (strategyParam) settleOptions.strategy = strategyParam;
    if (hubPersonParam) settleOptions.hubPerson = String(hubPersonParam);

    const result = await computeGroupSettlement(id, settleOptions);

    try {
      const simplified = Array.isArray(result.transactions) ? result.transactions : [];
      if (simplified.length > 0) {
        await groupSettlementRepo.deletePendingByGroupId(id);
        const toInsert = simplified
          .map((s) => ({
            group_id: id,
            from_user_id: s.from || s.from_user_id,
            to_user_id: s.to || s.to_user_id,
            amount: Number(s.amount),
            status: 'pending',
          }))
          .filter((s) => s.from_user_id && s.to_user_id && Number(s.amount) > 0);
        if (toInsert.length > 0) {
          await groupSettlementRepo.createMany(toInsert);
        }
      }
    } catch (syncErr) {
      console.error('sync group_settlements from getGroupSettlement error:', syncErr);
    }

    return res.json({
      success: true,
      balances: result.balances,
      transactions: result.transactions,
      payments: result.payments || [],
      per_bill: result.perBill.map((b) => ({
        bill_id: b.billId,
        method: b.method,
        payer: b.paidBy,
        shares: b.shares,
      })),
      skipped: result.skipped,
    });
  } catch (err) {
    console.error('❌ Get group settlement error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// ==========================================
// ทวงเงิน + ยืนยันรับเงิน
// ==========================================

const MIGRATION_HINT =
  'ระบบแจ้งเตือนยังไม่พร้อม (ผู้ดูแลต้องรัน backend/sql/create_debt_notifications.sql)';

exports.sendDebtReminders = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = String(req.user.id || req.user.user_id);
    const debtorId = req.body?.debtor_id ? String(req.body.debtor_id) : null;

    if (!(await isGroupMember(id, userId))) {
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

    const { data: groupMeta } = await groups.findById(id, 'name, settle_strategy, hub_person');
    const effectiveStrategy = String(req.body?.strategy || groupMeta?.settle_strategy || 'greedy').toLowerCase() === 'hub' ? 'hub' : 'greedy';
    const effectiveHubPerson = req.body?.hubPerson !== undefined
      ? (req.body.hubPerson ? String(req.body.hubPerson) : null)
      : (groupMeta?.hub_person ? String(groupMeta.hub_person) : null);

    const { transactions: debts } = await computeGroupSettlement(id, {
      strategy: effectiveStrategy,
      hubPerson: effectiveHubPerson,
    });
    const targets = debts.filter(
      (d) => String(d.from) !== userId && (!debtorId || String(d.from) === debtorId)
    );

    if (targets.length === 0) {
      return res.json({ success: true, sent: 0, recipients: [], message: 'ไม่มียอดค้างชำระที่ต้องทวง' });
    }

    const names = await memberNameMap(id);
    const groupName = groupMeta?.name || 'กลุ่ม';
    const senderName = names.get(userId) || 'สมาชิก';

    const rows = targets.map((d) => {
      const recipientName = names.get(String(d.to)) || 'สมาชิก';
      const formattedAmount = fmtBaht(d.amount);
      return {
        user_id: d.from,
        sender_id: userId,
        group_id: id,
        type: 'debt_reminder',
        title: `ทวงเงินกลุ่ม "${groupName}" (ยอด ฿${formattedAmount})`,
        message: `${senderName} แจ้งเตือน: คุณมียอดที่ต้องโอนชำระจำนวน ฿${formattedAmount} บาท ให้กับ ${recipientName}`,
        amount: d.amount,
      };
    });

    const { error } = await notificationRepo.notifications.insertMany(rows);
    if (error) {
      if (isMissingTable(error)) return res.status(503).json({ success: false, error: MIGRATION_HINT });
      throw error;
    }

    return res.json({
      success: true,
      sent: rows.length,
      recipients: targets.map((d) => ({
        user_id: d.from,
        name: names.get(String(d.from)) || 'สมาชิก',
        amount: d.amount,
      })),
    });
  } catch (err) {
    console.error('❌ Send reminders error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.confirmPaymentReceived = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = String(req.user.id || req.user.user_id);
    const fromUser = req.body?.from_user ? String(req.body.from_user) : '';

    if (!fromUser) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุผู้โอนเงิน (from_user)' });
    }
    if (fromUser === userId) {
      return res.status(400).json({ success: false, error: 'ไม่สามารถยืนยันรับเงินจากตัวเองได้' });
    }
    if (!(await isGroupMember(id, userId))) {
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

    const { data: groupMeta } = await groups.findById(id, 'name, settle_strategy, hub_person');
    const effectiveStrategy = String(req.body?.strategy || groupMeta?.settle_strategy || 'greedy').toLowerCase() === 'hub' ? 'hub' : 'greedy';
    const effectiveHubPerson = req.body?.hubPerson !== undefined
      ? (req.body.hubPerson ? String(req.body.hubPerson) : null)
      : (groupMeta?.hub_person ? String(groupMeta.hub_person) : null);

    const { transactions: debts } = await computeGroupSettlement(id, {
      strategy: effectiveStrategy,
      hubPerson: effectiveHubPerson,
    });
    const debt = debts.find((d) => String(d.from) === fromUser && String(d.to) === userId);
    if (!debt) {
      return res.status(404).json({ success: false, error: 'ไม่พบยอดค้างชำระจากสมาชิกคนนี้ถึงคุณ (หรือยืนยันรับเงินไปแล้ว)' });
    }

    let amount = req.body?.amount !== undefined ? Number(req.body.amount) : Number(debt.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ success: false, error: 'ยอดเงินไม่ถูกต้อง' });
    }
    if (amount > Number(debt.amount) + 0.01) {
      return res.status(400).json({ success: false, error: 'ยอดเงินมากกว่ายอดที่ค้างชำระ' });
    }
    amount = Math.round(amount * 100) / 100;

    const { data: payment, error } = await notificationRepo.payments.insert({
      group_id: id,
      from_user: fromUser,
      to_user: userId,
      amount,
      confirmed_by: userId,
    });
    if (error) {
      if (isMissingTable(error)) return res.status(503).json({ success: false, error: MIGRATION_HINT });
      throw error;
    }

    const names = await memberNameMap(id);
    const groupName = groupMeta?.name || 'กลุ่ม';

    try {
      await notificationRepo.notifications.insertMany([
        {
          user_id: fromUser,
          sender_id: userId,
          group_id: id,
          type: 'payment_confirmed',
          title: `ยืนยันรับเงินแล้ว — กลุ่ม "${groupName}"`,
          message: `${names.get(userId) || 'สมาชิก'} ยืนยันว่าได้รับเงิน ฿${fmtBaht(amount)} จากคุณเรียบร้อยแล้ว`,
          amount,
        },
      ]);
    } catch (notifyErr) {
      console.warn('⚠️ แจ้งเตือนการยืนยันรับเงินไม่สำเร็จ:', notifyErr.message);
    }

    try {
      const payerName = names.get(fromUser) || 'เพื่อน';
      const receiverName = names.get(userId) || 'เพื่อน';
      const groupLabel = groupMeta?.name ? ` (${groupMeta.name})` : '';
      const nowIso = new Date().toISOString();

      const { error: personalTxErr } = await supabase.from('personal_transactions').insert([
        // 1. บันทึกรายรับเข้าบัญชีคนรับเงิน (เจ้าหนี้)
        {
          id: uuidv4(),
          user_id: userId,
          category_id: null,
          title: `รับเงินคืนจาก ${payerName}${groupLabel}`,
          type: 'income',
          amount: amount,
          net_amount: amount,
          vat: 0,
          service_charge: 0,
          merchant: 'Group Settlement',
          transaction_date: nowIso,
        },
        // 2. หักรายจ่ายออกจากบัญชีคนจ่ายเงิน (ลูกหนี้)
        {
          id: uuidv4(),
          user_id: fromUser,
          category_id: null,
          title: `จ่ายค่าบิลกลุ่มคืนให้ ${receiverName}${groupLabel}`,
          type: 'expense',
          amount: amount,
          net_amount: amount,
          vat: 0,
          service_charge: 0,
          merchant: 'Group Settlement',
          transaction_date: nowIso,
        },
      ]);
      if (personalTxErr) throw personalTxErr;
    } catch (personalErr) {
      console.warn('⚠️ บันทึกรายรับ/รายจ่ายคืนเงินลงบัญชีส่วนบุคคลไม่สำเร็จ:', personalErr.message);
    }

    const after = await computeGroupSettlement(id, {
      strategy: effectiveStrategy,
      hubPerson: effectiveHubPerson,
    });
    const allSettled = after.transactions.length === 0;
    if (allSettled) {
      await groups.updateById(id, { status_type: 'settled' });
    }

    return res.json({
      success: true,
      message: 'ยืนยันรับเงินเรียบร้อย',
      payment,
      remaining: after.transactions,
      all_settled: allSettled,
    });
  } catch (err) {
    console.error('❌ Confirm payment error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.uploadGroupSlip = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.user_id;

    if (!(await isGroupMember(id, userId))) {
      if (req.file) removeSlip(slipPathOf(req.file));
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, error: 'กรุณาแนบไฟล์รูปสลิป (field: slip)' });
    }

    const ocr = await readSlipOcr(req.file);

    return res.json({
      success: true,
      slip_url: slipPathOf(req.file),
      ocr,
      message: ocr
        ? 'อัปโหลดสลิปและอ่านข้อมูลสำเร็จ'
        : 'อัปโหลดสลิปสำเร็จ (ไม่สามารถอ่านข้อมูลอัตโนมัติได้)',
    });
  } catch (err) {
    if (req.file) removeSlip(slipPathOf(req.file));
    console.error('❌ Upload group slip error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.createGroupTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.user_id;
    const {
      title, type, amount, subtotal, merchant,
      sc_rate = 0, vat_rate = 0, vat_base = 'itemPlusSC', category, date,
      paid_by, split_data, slip_url,
    } = req.body || {};

    if (!title || !title.trim() || amount === undefined || amount === null || amount === '') {
      return early(res, 400, 'กรุณากรอกชื่อรายการและจำนวนเงิน');
    }

    if (!(await isGroupMember(id, userId))) {
      return early(res, 403, 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้');
    }

    const { data: group, error: groupLookupError } = await groups.findById(id, 'status_type, name');
    if (groupLookupError) throw groupLookupError;
    if (!group) return early(res, 404, 'ไม่พบกลุ่มนี้');
    if (group.status_type === 'settled') {
      return early(res, 409, 'กลุ่มนี้เคลียร์บิลแล้ว ไม่สามารถเพิ่มรายการใหม่ได้');
    }

    const uploadedSlip = slipPathOf(req.file);
    const finalSlipUrl = uploadedSlip || slip_url || null;
    const ocr = req.file ? await readSlipOcr(req.file) : null;

    const scRate = Math.max(0, parseFloat(sc_rate) || 0);
    const vatRate = Math.max(0, parseFloat(vat_rate) || 0);
    const vatBase = vat_base === 'itemOnly' ? 'itemOnly' : 'itemPlusSC';

    const rawBase = subtotal !== undefined && subtotal !== null && subtotal !== '' ? subtotal : amount;
    const baseAmount = transactionService.parseAmount(rawBase);

    if (baseAmount <= 0) {
      return early(res, 400, 'จำนวนเงินต้องมากกว่า 0');
    }
    if (scRate > 100 || vatRate > 100) {
      return early(res, 400, 'อัตรา SC/VAT ต้องไม่เกิน 100');
    }

    const { summary } = distributeSCVAT(
      [{ id: 'total', price: baseAmount }],
      scRate / 100,
      vatRate / 100,
      { vatBase }
    );

    let parsedSplitData = split_data || null;
    if (typeof parsedSplitData === 'string') {
      try {
        parsedSplitData = JSON.parse(parsedSplitData);
      } catch {
        return early(res, 400, 'รูปแบบ split_data ไม่ถูกต้อง (ต้องเป็น JSON)');
      }
    }
    if (parsedSplitData !== null && typeof parsedSplitData !== 'object') {
      return early(res, 400, 'split_data ต้องเป็น object');
    }

    if (parsedSplitData && type !== 'income') {
      const groupMemberIds = await getGroupMemberIds(id);
      const check = validateSplit(parsedSplitData, {
        subtotal: baseAmount,
        scAmount: summary.totalSC,
        vatAmount: summary.totalVAT,
        memberIds: groupMemberIds,
      });
      if (!check.ok) {
        return early(res, 400, `วิธีหารบิลไม่ถูกต้อง: ${check.error}`);
      }

      const groupSet = new Set((groupMemberIds || []).map(String));
      const notInGroup = (check.result.participants || []).filter((p) => !groupSet.has(String(p)));
      if (notInGroup.length > 0) {
        return early(res, 400, 'สมาชิกที่ระบุใน split_data ไม่ได้อยู่ในกลุ่มนี้');
      }
    }

    const newTransaction = {
      id: uuidv4(),
      group_id: id,
      created_by: userId,
      paid_by: paid_by || userId,
      title: transactionService.normalizeTitle(title),
      type: type === 'income' ? 'income' : 'expense',
      subtotal: baseAmount,
      sc_rate: scRate,
      sc_amount: summary.totalSC,
      vat_rate: vatRate,
      vat_amount: summary.totalVAT,
      amount: summary.grandTotal,
      merchant: merchant || 'General',
      category: category || 'General',
      transaction_date: transactionService.resolveDate(date),
      slip_url: finalSlipUrl,
      split_data: parsedSplitData,
    };

    const payload = { ...newTransaction };
    const droppedFields = [];
    let saved = null;
    let saveError = null;

    for (let attempt = 0; attempt <= 12; attempt += 1) {
      const result = await transactions.insertTransaction(payload, { single: true });

      saved = result.data;
      saveError = result.error;

      if (!saveError) break;

      const missing = isMissingColumn(saveError) ? missingColumnOf(saveError) : null;
      if (!missing || !(missing in payload)) break;

      delete payload[missing];
      droppedFields.push(missing);
    }

    if (saveError) {
      if (req.file) removeSlip(finalSlipUrl);
      throw saveError;
    }

    const delta = newTransaction.type === 'income' ? -summary.grandTotal : summary.grandTotal;
    const { error: groupError } = await groups.updateSpend(id, delta);
    if (groupError) console.error('❌ Update group total_spend error:', groupError);

    try {
      const memberIds = await getGroupMemberIds(id);
      const otherMembers = memberIds.filter((mid) => String(mid) !== String(userId));
      if (otherMembers.length > 0) {
        const names = await memberNameMap(id);
        const payerName = names.get(String(userId)) || 'สมาชิก';
        const notifRows = otherMembers.map((mid) => ({
          user_id: mid,
          sender_id: userId,
          group_id: id,
          type: 'new_group_bill',
          title: `บิลใหม่ในกลุ่ม "${group?.name || 'กลุ่ม'}"`,
          message: `${payerName} ได้เพิ่มบิล "${newTransaction.title}" ยอดเงิน ฿${fmtBaht(summary.grandTotal)}`,
          amount: summary.grandTotal,
        }));
        await notificationRepo.notifications.insertMany(notifRows);
      }
    } catch (nErr) {
      console.warn('⚠️ แจ้งเตือนบิลใหม่ไม่สำเร็จ:', nErr.message);
    }

    try {
      const payerId = String(newTransaction.paid_by || userId);
      const groupLabel = group?.name ? ` (${group.name})` : '';

      const { error: personalInsertErr } = await supabase.from('personal_transactions').insert([
        {
          id: uuidv4(),
          user_id: payerId,
          category_id: null,
          title: `[กลุ่ม${groupLabel}] ${newTransaction.title}`,
          type: newTransaction.type,
          amount: summary.grandTotal,
          net_amount: baseAmount,
          vat: summary.totalVAT,
          service_charge: summary.totalSC,
          merchant: newTransaction.merchant || 'Group Expense',
          transaction_date: new Date(newTransaction.transaction_date).toISOString(),
        },
      ]);
      if (personalInsertErr) throw personalInsertErr;
    } catch (personalErr) {
      console.warn('⚠️ บันทึกรายจ่ายกลุ่มลงบัญชีส่วนบุคคลไม่สำเร็จ:', personalErr.message);
    }

    const degraded = droppedFields.length > 0;

    return res.json({
      success: true,
      message: degraded
        ? 'บันทึกรายการสำเร็จ (บางข้อมูลยังบันทึกไม่ได้ เพราะฐานข้อมูลยังไม่มีคอลัมน์ — กรุณารัน migration)'
        : 'บันทึกรายการสำเร็จ',
      split_saved: !degraded,
      dropped_fields: droppedFields,
      slip_url: finalSlipUrl,
      ocr,
      transaction: saved,
    });
  } catch (err) {
    if (req.file) removeSlip(slipPathOf(req.file));
    console.error('❌ Create group transaction error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// ==========================================
// Group Members Controllers
// ==========================================

exports.getGroupMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { data, error } = await members.listMembershipsByGroupIds([id]);
    if (error) throw error;
    return res.json({ success: true, members: data || [] });
  } catch (err) {
    console.error('❌ Get group members error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.addGroupMember = async (req, res) => {
  try {
    const { id } = req.params;
    const requesterId = req.user.id || req.user.user_id;
    const { user_id } = req.body || {};

    if (!user_id) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุ user_id ของสมาชิก' });
    }

    const [owned, requesterIsMember] = await Promise.all([
      groups.findOwned(id, requesterId),
      isGroupMember(id, requesterId),
    ]);
    if (!owned && !requesterIsMember) {
      return res.status(403).json({ success: false, error: 'เฉพาะเจ้าของกลุ่มหรือสมาชิกเท่านั้นที่เชิญสมาชิกใหม่ได้' });
    }

    const newMember = {
      id: uuidv4(),
      group_id: id,
      user_id,
      joined_at: new Date().toISOString(),
    };

    const { data: existingMember } = await members.memberExists(id, user_id);
    if (existingMember) {
      return res.status(400).json({ success: false, error: 'ผู้ใช้นี้เป็นสมาชิกกลุ่มอยู่แล้ว' });
    }

    const { data, error } = await members.insertMember(newMember, { select: '*', single: true });
    if (error) throw error;

    const { data: group } = await groups.findMembersCount(id);
    const currentCount = group?.members_count || 1;
    const { error: countError } = await groups.updateById(id, { members_count: currentCount + 1 });
    if (countError) throw countError;

    return res.json({ success: true, message: 'เพิ่มสมาชิกสำเร็จ', member: data });
  } catch (err) {
    console.error('❌ Add group member error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.getGroupByInviteCode = async (req, res) => {
  try {
    const code = String(req.params.code || '').trim().toUpperCase();
    if (!code) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุรหัสเชิญ' });
    }

    if (inviteCodeAvailable === false && !inviteCodeUsable()) {
      return res.status(503).json({
        success: false,
        error: 'ฟีเจอร์รหัสเชิญยังไม่เปิดใช้งาน (ยังไม่ได้รัน migration) — ลองสแกน QR แทน',
      });
    }

    const { data: group, error } = await groups.findByInviteCode(
      code,
      'id, name, category, members_count, icon, icon_bg, icon_color, invite_code'
    );

    if (error) {
      if (isMissingColumn(error)) {
        markInviteCodeUnavailable();
        return res.status(503).json({
          success: false,
          error: 'ฟีเจอร์รหัสเชิญยังไม่เปิดใช้งาน (ยังไม่ได้รัน migration) — ลองสแกน QR แทน',
        });
      }
      throw error;
    }
    if (!group) {
      return res.status(404).json({ success: false, error: `ไม่พบกลุ่มจากรหัส "${code}"` });
    }

    markInviteCodeAvailable();

    const userId = req.user.id || req.user.user_id;
    const { data: already } = await members.memberExists(group.id, userId);

    return res.json({
      success: true,
      group,
      already_member: Boolean(already),
    });
  } catch (err) {
    console.error('❌ Get group by invite code error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.joinGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { group_id } = req.body || {};

    if (!group_id) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุ group_id' });
    }

    const { data: group } = await groups.findById(group_id, 'id, name');
    if (!group) {
      return res.status(404).json({ success: false, error: 'ไม่พบกลุ่มนี้' });
    }

    const { data: existing } = await members.memberExists(group_id, userId);
    if (existing) {
      return res.status(400).json({ success: false, error: 'คุณเป็นสมาชิกของกลุ่มนี้อยู่แล้ว' });
    }

    const { error: insErr } = await members.insertMember({
      id: uuidv4(),
      group_id,
      user_id: userId,
      joined_at: new Date().toISOString(),
    });
    if (insErr) throw insErr;

    const { data: memberRows } = await members.listMembers(group_id, 'id');
    const { error: countErr } = await groups.updateById(group_id, {
      members_count: memberRows?.length || 1,
    });
    if (countErr) throw countErr;

    try {
      const { data: mRows } = await members.listMembers(group_id, 'user_id');
      const otherMembers = (mRows || [])
        .map((m) => String(m.user_id))
        .filter((mid) => mid !== String(userId));
      if (otherMembers.length > 0) {
        const names = await memberNameMap(group_id);
        const newMemberName = names.get(String(userId)) || 'สมาชิกใหม่';
        const notifRows = otherMembers.map((mid) => ({
          user_id: mid,
          sender_id: userId,
          group_id: group_id,
          type: 'member_joined',
          title: `สมาชิกใหม่ในกลุ่ม "${group.name}"`,
          message: `${newMemberName} ได้เข้าร่วมกลุ่มเรียบร้อยแล้ว`,
        }));
        await notificationRepo.notifications.insertMany(notifRows);
      }
    } catch (jErr) {
      console.warn('⚠️ แจ้งเตือนสมาชิกใหม่ไม่สำเร็จ:', jErr.message);
    }

    return res.json({ success: true, message: `เข้าร่วมกลุ่ม "${group.name}" สำเร็จ`, group });
  } catch (err) {
    console.error('❌ Join group error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.updateGroupStatus = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;
    const { status_type } = req.body || {};

    const allowed = ['settled', 'pending', 'split'];
    if (!allowed.includes(status_type)) {
      return res.status(400).json({
        success: false,
        error: `สถานะไม่ถูกต้อง (ต้องเป็น ${allowed.join(' | ')})`,
      });
    }

    const { data: membership } = await members.memberExists(id, userId);
    if (!membership) {
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

    // ป้องกันการกดเคลียร์บิลซ้ำถ้ากลุ่มถูก settled ไปแล้ว
    const { data: groupMeta } = await groups.findById(id, 'name, status_type, settle_strategy, hub_person');
    if (groupMeta?.status_type === 'settled' && status_type === 'settled') {
      return res.json({
        success: true,
        message: 'กลุ่มนี้ถูกเคลียร์บิลเรียบร้อยแล้ว',
        group: groupMeta,
      });
    }

    if (status_type === 'settled' && groupMeta) {
      try {
        const settlementResult = await computeGroupSettlement(id, {
          strategy: groupMeta.settle_strategy || 'greedy',
          hubPerson: groupMeta.hub_person || undefined,
        });
        const remainingDebts = settlementResult.transactions || [];
        const names = await memberNameMap(id);
        const groupLabel = groupMeta.name ? ` (${groupMeta.name})` : '';
        const nowIso = new Date().toISOString();

        for (const debt of remainingDebts) {
          const payerId = String(debt.from);
          const receiverId = String(debt.to);
          const payerName = names.get(payerId) || 'เพื่อน';
          const receiverName = names.get(receiverId) || 'เพื่อน';
          const debtAmount = Number(debt.amount);

          await notificationRepo.payments.insert({
            group_id: id,
            from_user: payerId,
            to_user: receiverId,
            amount: debtAmount,
            confirmed_by: userId,
          }).catch(() => {});

          await supabase.from('personal_transactions').insert([
            // 1. เพิ่มรายรับให้ฝั่งผู้รับเงิน
            {
              id: uuidv4(),
              user_id: receiverId,
              category_id: null,
              title: `รับเงินคืนจาก ${payerName}${groupLabel}`,
              type: 'income',
              amount: debtAmount,
              net_amount: debtAmount,
              vat: 0,
              service_charge: 0,
              merchant: 'Group Settlement',
              transaction_date: nowIso,
            },
            // 2. หักรายจ่ายจากฝั่งผู้โอนเงิน
            {
              id: uuidv4(),
              user_id: payerId,
              category_id: null,
              title: `จ่ายค่าบิลกลุ่มคืนให้ ${receiverName}${groupLabel}`,
              type: 'expense',
              amount: debtAmount,
              net_amount: debtAmount,
              vat: 0,
              service_charge: 0,
              merchant: 'Group Settlement',
              transaction_date: nowIso,
            },
          ]);
        }
      } catch (settleSyncErr) {
        console.warn('⚠️ บันทึกรายรับ/รายจ่ายตอนปิดกลุ่มไม่สำเร็จ:', settleSyncErr.message);
      }
    }

    const { data, error } = await groups.updateById(id, { status_type }, { select: '*', single: true });
    if (error) throw error;

    return res.json({ success: true, message: 'อัปเดตสถานะกลุ่มสำเร็จ', group: data });
  } catch (err) {
    console.error('❌ Update group status error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.updateGroupSettleStrategy = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { id } = req.params;
    const strategy = String(req.body?.strategy || 'greedy').toLowerCase();
    const hubPerson = strategy === 'hub' && req.body?.hubPerson ? String(req.body.hubPerson) : null;

    if (!['greedy', 'hub'].includes(strategy)) {
      return res.status(400).json({ success: false, error: 'รูปแบบการตัดหนี้ไม่ถูกต้อง' });
    }

    if (!(await isGroupMember(id, userId))) {
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

    const { data, error } = await groups.updateById(
      id,
      {
        settle_strategy: strategy,
        hub_person: hubPerson,
        strategy_locked: true,
      },
      { select: '*', single: true }
    );
    if (error) throw error;

    const result = await computeGroupSettlement(id, { strategy, hubPerson });
    const simplified = Array.isArray(result.transactions) ? result.transactions : [];
    await groupSettlementRepo.deletePendingByGroupId(id);
    if (simplified.length > 0) {
      const toInsert = simplified
        .map((s) => ({
          group_id: id,
          from_user_id: s.from,
          to_user_id: s.to,
          amount: Number(s.amount),
          status: 'pending',
        }))
        .filter((s) => s.from_user_id && s.to_user_id && Number(s.amount) > 0);
      if (toInsert.length > 0) {
        await groupSettlementRepo.createMany(toInsert);
      }
    }

    return res.json({
      success: true,
      message: 'บันทึกวิธีการเคลียร์บิลสำเร็จ',
      group: data,
      transactions: simplified,
    });
  } catch (err) {
    console.error('❌ Update settle strategy error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.updateGroupTransactionSplit = async (req, res) => {
  try {
    const { id, transactionId } = req.params;
    const userId = req.user.id || req.user.user_id;
    if (!(await isGroupMember(id, userId))) return early(res, 403, 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้');

    const { data: tx, error } = await transactions.findByIdInGroup(id, transactionId);
    if (error) throw error;
    if (!tx) return early(res, 404, 'ไม่พบบิลนี้ในกลุ่ม');
    if (tx.type === 'income') return early(res, 400, 'ไม่สามารถหารบิลรายรับได้');

    const split = req.body?.split_data;
    if (!split || typeof split !== 'object' || Array.isArray(split)) {
      return early(res, 400, 'split_data ต้องเป็น object');
    }
    const memberIds = await getGroupMemberIds(id);
    const check = validateSplit(split, {
      subtotal: tx.subtotal ?? tx.amount,
      scAmount: tx.sc_amount,
      vatAmount: tx.vat_amount,
      memberIds,
    });
    if (!check.ok) return early(res, 400, `วิธีหารบิลไม่ถูกต้อง: ${check.error}`);
    const allowed = new Set(memberIds.map(String));
    if (check.result.participants.some((memberId) => !allowed.has(String(memberId)))) {
      return early(res, 400, 'สมาชิกที่ระบุใน split_data ไม่ได้อยู่ในกลุ่มนี้');
    }
    const updated = await transactions.updateSplitData(id, transactionId, split);
    if (updated.error) throw updated.error;

    const statusUpdate = await groups.updateById(id, { status_type: 'pending' });
    if (statusUpdate.error) throw statusUpdate.error;
    return res.json({ success: true, transaction: updated.data });
  } catch (err) {
    console.error('Update group transaction split error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// ==========================================
// Group Settlements
// ==========================================

exports.getGroupSettlements = async (req, res) => {
  try {
    const { id: groupId } = req.params;
    const userId = req.user.id || req.user.user_id;

    if (!(await isGroupMember(groupId, userId))) {
      return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงกลุ่มนี้' });
    }

    const { data: groupMeta } = await groups.findById(groupId, 'settle_strategy, hub_person');
    const strategyParam = String(
      req.query?.strategy || req.body?.strategy || groupMeta?.settle_strategy || 'greedy'
    ).toLowerCase();
    const hubPersonParam =
      req.query?.hubPerson !== undefined
        ? req.query.hubPerson
        : req.body?.hubPerson !== undefined
          ? req.body.hubPerson
          : groupMeta?.hub_person;

    const txList = await transactions.findByGroupId(groupId);
    const memberList = await members.listMembershipsByGroupIds([groupId]);
    const memberIds = (memberList || []).map((m) => m.user_id).filter(Boolean);

    if (memberIds.length === 0) {
      return res.json({ success: true, settlements: [], balances: [] });
    }

    const items = (txList || []).map((t) => ({
      id: t.id,
      price: Number(t.amount || t.subtotal || 0),
      paidBy: t.paid_by || t.created_by,
      sharedBy: memberIds,
    }));

    const { balances } = splitBillForGroup(items, 0, 0, { groupMembers: memberIds });
    const simplified = settleGroupBalances(balances, {
      strategy: strategyParam,
      hubPerson: hubPersonParam || undefined,
    });

    let pending = await groupSettlementRepo.findPendingByGroupId(groupId);

    if (simplified.length > 0) {
      await groupSettlementRepo.deletePendingByGroupId(groupId);

      const toInsert = simplified
        .map((s) => ({
          group_id: groupId,
          from_user_id: s.from || s.from_user_id,
          to_user_id: s.to || s.to_user_id,
          amount: Number(s.amount),
          status: 'pending',
        }))
        .filter((s) => s.from_user_id && s.to_user_id && Number(s.amount) > 0);

      if (toInsert.length > 0) {
        pending = await groupSettlementRepo.createMany(toInsert);
      }
    }

    return res.json({ success: true, settlements: pending, balances, transactions: simplified });
  } catch (err) {
    console.error('getGroupSettlements error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

exports.markSettlementPaid = async (req, res) => {
  try {
    const { id: groupId, settlementId } = req.params;
    const userId = req.user.id || req.user.user_id;

    if (!(await isGroupMember(groupId, userId))) {
      return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์เข้าถึงกลุ่มนี้' });
    }

    const settlement = await groupSettlementRepo.findById(settlementId);
    if (!settlement || settlement.group_id !== groupId) {
      return res.status(404).json({ success: false, error: 'ไม่พบรายการชำระเงินนี้' });
    }

    if (settlement.status === 'paid') {
      return res.json({ success: true, settlement, message: 'รายการนี้ถูกชำระแล้ว' });
    }

    const updated = await groupSettlementRepo.markAsPaid(settlementId, userId);

    try {
      const receiverId = String(settlement.to_user_id);
      const payerId = String(settlement.from_user_id);
      const names = await memberNameMap(groupId);
      const { data: grpInfo } = await groups.findById(groupId, 'name');
      const payerName = names.get(payerId) || 'เพื่อน';
      const receiverName = names.get(receiverId) || 'เพื่อน';
      const groupLabel = grpInfo?.name ? ` (${grpInfo.name})` : '';
      const paidAmt = Number(settlement.amount);
      const nowIso = new Date().toISOString();

      const { error: personalTxErr } = await supabase.from('personal_transactions').insert([
        // 1. บันทึกรายรับเข้าบัญชีคนรับเงิน
        {
          id: uuidv4(),
          user_id: receiverId,
          category_id: null,
          title: `รับเงินคืนจาก ${payerName}${groupLabel}`,
          type: 'income',
          amount: paidAmt,
          net_amount: paidAmt,
          vat: 0,
          service_charge: 0,
          merchant: 'Group Settlement',
          transaction_date: nowIso,
        },
        // 2. หักรายจ่ายออกจากบัญชีคนจ่ายเงิน
        {
          id: uuidv4(),
          user_id: payerId,
          category_id: null,
          title: `จ่ายค่าบิลกลุ่มคืนให้ ${receiverName}${groupLabel}`,
          type: 'expense',
          amount: paidAmt,
          net_amount: paidAmt,
          vat: 0,
          service_charge: 0,
          merchant: 'Group Settlement',
          transaction_date: nowIso,
        },
      ]);
      if (personalTxErr) throw personalTxErr;
    } catch (personalErr) {
      console.warn('⚠️ บันทึกรายรับ/รายจ่ายคืนเงินลงบัญชีส่วนบุคคลไม่สำเร็จ:', personalErr.message);
    }

    return res.json({ success: true, settlement: updated });
  } catch (err) {
    console.error('markSettlementPaid error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};