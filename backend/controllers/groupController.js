const supabase = require('../config/supabase');
const { v4: uuidv4 } = require('uuid');
const transactionService = require('../services/transactionService');
const { distributeSCVAT } = require('../utils/allocationUtils');
const { validateSplit } = require('../utils/splitMethod');
const { calculateSettlement } = require('../utils/settlementCalculator');
const { slipPathOf, removeSlip } = require('../middlewares/uploadMiddleware');

// ==========================================
// Groups Controllers (feature/group-management)
// ==========================================

// ดึงรายการกลุ่มทั้งหมดของผู้ใช้
// สีประจำสมาชิก (หน้าจอคาดว่า member.color เป็น hex)
const MEMBER_COLORS = ['#EF4444', '#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899'];

exports.getMyGroups = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    // 1) กลุ่มที่ฉันเป็นสมาชิก
    const { data: memberships, error: mErr } = await supabase
      .from('group_members')
      .select('group_id, groups (*)')
      .eq('user_id', userId);

    if (mErr) throw mErr;

    const groups = (memberships || []).map((m) => m.groups).filter(Boolean);
    if (groups.length === 0) {
      return res.json({ success: true, groups: [] });
    }

    const groupIds = groups.map((g) => g.id);

    // 2) สมาชิกทั้งหมด (เอาชื่อจริงมาด้วย)
    const { data: memberRows, error: memErr } = await supabase
      .from('group_members')
      .select('group_id, user_id, users (id, name, email)')
      .in('group_id', groupIds);

    if (memErr) throw memErr;

    // 3) บิล/ธุรกรรมของทุกกลุ่ม
    const { data: txRows, error: txErr } = await supabase
      .from('group_transactions')
      .select('*')
      .in('group_id', groupIds)
      .order('created_at', { ascending: false });

    if (txErr) throw txErr;

    const nameOf = (groupId, userId) => {
      const row = (memberRows || []).find((m) => m.group_id === groupId && m.user_id === userId);
      return row?.users?.name || row?.users?.email || 'สมาชิก';
    };

    // 4) ประกอบเป็นรูปแบบที่หน้าจอคาด (members / bills / settled / color)
    const enriched = groups.map((g) => {
      const members = (memberRows || [])
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
        members,
        bills,
      };
    });

    return res.json({ success: true, groups: enriched });
  } catch (err) {
    console.error('❌ Fetch groups error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// สร้างกลุ่มใหม่
// สร้างรหัสเชิญ 6 ตัว เช่น GR829A (ไม่ใช้ 0/O/1/I ที่อ่านยาก)
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const genInviteCode = (prefix = 'GR') =>
  prefix +
  Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join('');

// สุ่มรหัสที่ยังไม่ถูกใช้ (เผื่อชนกัน)
const genUniqueInviteCode = async () => {
  for (let i = 0; i < 8; i += 1) {
    const code = genInviteCode();
    const { data } = await supabase
      .from('groups')
      .select('id')
      .eq('invite_code', code)
      .maybeSingle();
    if (!data) return code;
  }
  return `${genInviteCode()}${Date.now().toString(36).slice(-2).toUpperCase()}`;
};

// column invite_code มากับ migration add_group_bill_split_columns.sql
// ถ้ายังไม่ได้ apply -> PostgREST จะตอบว่าหาคอลัมน์ไม่เจอ 2 รูปแบบ
//   1) 42703                     "column groups.invite_code does not exist"
//   2) PGRST204 / schema cache   "Could not find the 'invite_code' column of 'groups' in the schema cache"
//
// ไม่ต้อง restart server หลังรัน migration เสร็จ: cache ที่บอกว่า "ไม่มี" จะหมดอายุเอง
// แล้วลองใส่รหัสเชิญใหม่ (ค่าเริ่มต้นคือ null = ยังไม่รู้ ให้ลองก่อน)
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

// true = ลองใส่รหัสเชิญ (ยังไม่รู้ หรือรู้ว่ามี หรือเพิ่งหมดอายุการ "ไม่มี")
const inviteCodeUsable = () =>
  inviteCodeAvailable !== false || Date.now() - inviteCodeCheckedAt > INVITE_CODE_RETRY_MS;

// ดึงชื่อคอลัมน์ที่หายไปจาก error ของ PostgREST เพื่อรู้ว่าต้องตัด field ไหนออก
//   1) 42703        "column group_transactions.paid_by does not exist"
//   2) PGRST204     "Could not find the 'paid_by' column of 'group_transactions' in the schema cache"
const missingColumnOf = (err) => {
  const message = (err && err.message) || '';
  const match =
    message.match(/column\s+[\w.]+\.(\w+)\s+does not exist/i) ||
    message.match(/could not find the '(\w+)' column/i);
  return match ? match[1] : null;
};

// เป็นสมาชิกของกลุ่มนี้หรือไม่ — ใช้กันคนนอกกลุ่มอ่าน/เขียนบิลของกลุ่ม
const isGroupMember = async (groupId, userId) => {
  const { data, error } = await supabase
    .from('group_members')
    .select('id')
    .eq('group_id', groupId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
};

// รายชื่อสมาชิกทั้งหมดของกลุ่ม (user_id) — ใช้เป็นค่า default ตอนหารเท่ากัน
// และใช้ตรวจว่า split_data ที่ส่งมาอ้างเฉพาะสมาชิกจริง
const getGroupMemberIds = async (groupId) => {
  const { data, error } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId);

  if (error) throw error;
  return (data || []).map((m) => String(m.user_id));
};

/**
 * ตอบกลับพร้อมลบไฟล์ที่เผลออัปโหลดค้างไว้
 * ถ้า request นี้เป็น multipart และผ่าน validation ไม่ได้ ไฟล์จะถูกเก็บไว้
 * โดยไม่มีใครอ้างถึง (orphan) -> ต้องลบทิ้ง ไม่งั้นจะทยอยเติมดิสก์
 */
const early = (res, status, error) => {
  if (res.req && res.req.file) {
    try {
      removeSlip(slipPathOf(res.req.file));
    } catch {
      /* ลบไฟล์ไม่สำเร็จก็ปล่อยไป ไม่ควรทำให้ response พัง */
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

    // ใส่รหัสเชิญถ้าคอลัมน์น่าจะมีอยู่แล้ว (ยังไม่ apply migration = ข้ามไปก่อน)
    if (inviteCodeUsable()) {
      newGroup.invite_code = await genUniqueInviteCode();
    }

    let data = null;
    let error = null;

    ({ data, error } = await supabase.from('groups').insert([newGroup]).select());

    if (error && isMissingColumn(error) && newGroup.invite_code) {
      console.warn(
        '⚠️  groups.invite_code ยังไม่มีในฐานข้อมูล — สร้างกลุ่มโดยไม่ใส่รหัสเชิญ ' +
          '(รัน backend/sql/add_group_bill_split_columns.sql เพื่อเปิดใช้รหัสเชิญ)'
      );
      markInviteCodeUnavailable();
      delete newGroup.invite_code;
      ({ data, error } = await supabase.from('groups').insert([newGroup]).select());
    }

    if (error) throw error;
    markInviteCodeAvailable();


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
    const userId = req.user.id || req.user.user_id;

    if (!(await isGroupMember(id, userId))) {
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

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

// GET /:id/settlement
// คำนวณ "ใครต้องจ่ายใคร" ของทั้งกลุ่ม โดยอ่าน split_data ของแต่ละบิลที่บันทึกไว้
// รองรับทั้ง 3 เคส: equal / percent / sub-group (item, amount)
// ฝั่งหน้าจอไม่ต้องคำนวณเอง (เดิมหารเท่ากันอย่างเดียว แล้วผิดเมื่อบิลไม่ได้หารเท่ากัน)
exports.getGroupSettlement = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user.user_id;

    if (!(await isGroupMember(id, userId))) {
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

    const memberIds = await getGroupMemberIds(id);

    const { data, error } = await supabase
      .from('group_transactions')
      .select('id, title, type, subtotal, amount, sc_amount, vat_amount, paid_by, split_data, transaction_date')
      .eq('group_id', id);

    if (error) throw error;

    const result = calculateSettlement(data || [], memberIds);

    return res.json({
      success: true,
      balances: result.balances,
      transactions: result.transactions,
      // รายละเอียดต่อบิล เผื่อ UI อยากแสดงว่าใครโดนเท่าไร
      per_bill: result.perBill.map((b) => ({
        bill_id: b.billId,
        method: b.method,
        payer: b.paidBy,
        shares: b.shares,
      })),
      // บิลที่คำนวณไม่ได้ (split_data ไม่ครบ/เสีย) — ต้องให้ผู้ใช้รู้ ไม่เงียบทิ้ง
      skipped: result.skipped,
    });
  } catch (err) {
    console.error('❌ Get group settlement error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// อัปโหลดรูปสลิปล่วงหน้า แล้วเอา slip_url ที่ได้ไปใส่ตอน POST transaction
// (POST /:id/transactions ก็อัดไฟล์มาพร้อมกันได้ ถ้าสะดวกกว่า)
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

    return res.json({
      success: true,
      slip_url: slipPathOf(req.file),
      message: 'อัปโหลดสลิปสำเร็จ',
    });
  } catch (err) {
    if (req.file) removeSlip(slipPathOf(req.file));
    console.error('❌ Upload group slip error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// สร้างธุรกรรมใหม่ในกลุ่ม
// รองรับทั้ง JSON และ multipart (แนบรูปสลิปใน field "slip" มาพร้อมกันได้)
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

    // บิลของกลุ่ม: เฉพาะสมาชิกเท่านั้นที่เพิ่มได้
    if (!(await isGroupMember(id, userId))) {
      return early(res, 403, 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้');
    }

    // ถ้าอัปโหลดรูปมากับ request นี้ ให้ใช้รูปนั้น (ชนะ slip_url ที่ส่งมา)
    const uploadedSlip = slipPathOf(req.file);
    const finalSlipUrl = uploadedSlip || slip_url || null;

    const scRate = Math.max(0, parseFloat(sc_rate) || 0);
    const vatRate = Math.max(0, parseFloat(vat_rate) || 0);
    const vatBase = vat_base === 'itemOnly' ? 'itemOnly' : 'itemPlusSC';

    // ถ้าส่ง subtotal มาให้ถือว่านั้นคือราคาก่อน SC/VAT
    // ไม่งั้น amount คือราคาก่อน SC/VAT (แล้วค่อยบวก SC/VAT ตอนท้าย)
    const rawBase = subtotal !== undefined && subtotal !== null && subtotal !== '' ? subtotal : amount;
    const baseAmount = transactionService.parseAmount(rawBase);

    if (baseAmount <= 0) {
      return early(res, 400, 'จำนวนเงินต้องมากกว่า 0');
    }
    if (scRate > 100 || vatRate > 100) {
      return early(res, 400, 'อัตรา SC/VAT ต้องไม่เกิน 100');
    }

    // ใช้ core algorithm เดียวกับ bill-split (คิดเป็นสตางค์ กันเศษจาก float)
    // vatBase = 'itemPlusSC' = คิด VAT จาก (ราคา + SC) แบบมาตรฐานไทย
    const { summary } = distributeSCVAT(
      [{ id: 'total', price: baseAmount }],
      scRate / 100,
      vatRate / 100,
      { vatBase }
    );

    // multipart ส่ง field เป็น string มาทั้งหมด -> ต้อง parse ก่อน
    // ไม่งั้น jsonb จะเก็บเป็น "ค่าคงที่แบบ string" แทน object ({ memberIds, method })
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

    // ตรวจวิธีหารทันทีตอนบันทึก (fail fast)
    // ดีกว่าปล่อยให้บันทึกผ่าน แล้วพังตอนมาคิดยอดตอน settle
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

      // ทุกคนที่ถูกระบุใน split_data ต้องเป็นสมาชิกจริงในกลุ่ม
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
      // ใครเป็นคนจ่าย (ไม่ใช่ใครสร้าง) — ใช้คำนวณสัดส่วนใน settle
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
      // { memberIds: [...], method: 'equal' } — ใครเชิญอะไรบ้าง
      split_data: parsedSplitData,
    };

    // ถ้าคอลัมน์ยังไม่มีจริง (ยังไม่รัน migration) -> ตัดคอลัมน์ที่หายทีละตัว
    // แล้วรายงานกลับว่าตกหล่นอะไรบ้าง แทนที่จะทิ้งทั้งชุดแบบเงียบ ๆ
    const payload = { ...newTransaction };
    const droppedFields = [];
    let saved = null;
    let saveError = null;

    for (let attempt = 0; attempt <= 12; attempt += 1) {
      const result = await supabase
        .from('group_transactions')
        .insert([payload])
        .select()
        .single();

      saved = result.data;
      saveError = result.error;

      if (!saveError) break;

      const missing = isMissingColumn(saveError) ? missingColumnOf(saveError) : null;
      if (!missing || !(missing in payload)) break;

      delete payload[missing];
      droppedFields.push(missing);
    }

    if (saveError) {
      // บันทึกไม่ได้เลย -> อย่าทิ้งรูปไว้เปล่า ๆ
      if (req.file) removeSlip(finalSlipUrl);
      throw saveError;
    }

    if (droppedFields.length > 0) {
      console.warn(
        '⚠️  group_transactions ยังไม่มีคอลัมน์: ' +
          `${droppedFields.join(', ')} — รัน backend/sql/add_group_bill_split_columns.sql เพื่อเปิดใช้งาน`
      );
    }

    // อัปเดตยอดรวมของกลุ่ม (รายรับลบ รายจ่ายบวก)
    const { data: group } = await supabase
      .from('groups')
      .select('total_spend')
      .eq('id', id)
      .single();

    const delta = newTransaction.type === 'income' ? -summary.grandTotal : summary.grandTotal;
    const newTotalSpend = Number(group?.total_spend || 0) + delta;

    const { error: groupError } = await supabase
      .from('groups')
      .update({ total_spend: newTotalSpend, amount: newTotalSpend })
      .eq('id', id);

    if (groupError) console.error('❌ Update group total_spend error:', groupError);

    const degraded = droppedFields.length > 0;

    return res.json({
      success: true,
      message: degraded
        ? 'บันทึกรายการสำเร็จ (บางข้อมูลยังบันทึกไม่ได้ เพราะฐานข้อมูลยังไม่มีคอลัมน์ — กรุณารัน migration)'
        : 'บันทึกรายการสำเร็จ',
      split_saved: !degraded,
      dropped_fields: droppedFields,
      slip_url: finalSlipUrl,
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

// ค้นหากลุ่มจากรหัสเชิญ (หน้า join-group กรอกรหัสมาเรียกใช้ก่อนเข้าร่วม)
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

    const { data: group, error } = await supabase
      .from('groups')
      .select('id, name, category, members_count, icon, icon_bg, icon_color, invite_code')
      .eq('invite_code', code)
      .maybeSingle();

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

    // ค้นหาได้ = คอลัมน์มีอยู่จริงแล้ว (หายใจได้ ปิด cache ที่บอกว่าไม่มี)
    markInviteCodeAvailable();

    const userId = req.user.id || req.user.user_id;
    const { data: already } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', group.id)
      .eq('user_id', userId)
      .maybeSingle();

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

// เข้าร่วมกลุ่มด้วยตัวเอง (สแกน QR) — ผู้ใช้ที่เข้าร่วมคือคนใน token เสมอ
// ต่างจาก addGroupMember ที่รับ user_id จาก body (ซึ่งใครก็แอดสมาชิกได้)
exports.joinGroup = async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { group_id } = req.body || {};

    if (!group_id) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุ group_id' });
    }

    const { data: group } = await supabase
      .from('groups')
      .select('id, name')
      .eq('id', group_id)
      .maybeSingle();

    if (!group) {
      return res.status(404).json({ success: false, error: 'ไม่พบกลุ่มนี้' });
    }

    const { data: existing } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', group_id)
      .eq('user_id', userId)
      .maybeSingle();

    if (existing) {
      return res.status(400).json({ success: false, error: 'คุณเป็นสมาชิกของกลุ่มนี้อยู่แล้ว' });
    }

    const { error: insErr } = await supabase.from('group_members').insert([{
      id: uuidv4(),
      group_id,
      user_id: userId,
      joined_at: new Date().toISOString(),
    }]);
    if (insErr) throw insErr;

    // อัปเดตจำนวนสมาชิกให้ตรงกับข้อมูลจริง
    const { data: members } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', group_id);

    const { error: countErr } = await supabase
      .from('groups')
      .update({ members_count: members?.length || 1 })
      .eq('id', group_id);
    if (countErr) throw countErr;

    return res.json({ success: true, message: `เข้าร่วมกลุ่ม "${group.name}" สำเร็จ`, group });
  } catch (err) {
    console.error('❌ Join group error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};

// เปลี่ยนสถานะกลุ่ม (settled | pending | split) — ใช้ตอนกด "settle" ในหน้า settle-group
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

    // ต้องเป็นสมาชิกของกลุ่มนี้เท่านั้น
    const { data: membership } = await supabase
      .from('group_members')
      .select('id')
      .eq('group_id', id)
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      return res.status(403).json({ success: false, error: 'คุณไม่ได้เป็นสมาชิกของกลุ่มนี้' });
    }

    const { data, error } = await supabase
      .from('groups')
      .update({ status_type })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    return res.json({ success: true, message: 'อัปเดตสถานะกลุ่มสำเร็จ', group: data });
  } catch (err) {
    console.error('❌ Update group status error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
};