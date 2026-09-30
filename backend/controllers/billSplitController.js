/**
 * billSplitController.js
 * -----------------------
 * รับ request จาก route แล้วเรียก billSplitService
 * Controller ทำหน้าที่แค่: validate input เบื้องต้น -> เรียก service -> ส่ง response
 * ไม่ควรมี business logic (การคำนวณ) อยู่ในนี้ ให้อยู่ใน service ทั้งหมด
 */

const { splitBillForGroup, settleGroupBalances, splitBillAndSettle, splitByMethodAndSettle, SPLIT_METHODS } = require('../services/billSplitService');

/**
 * POST /api/groups/:groupId/split-bill
 * Body: {
 *   items: [{ id, price, paidBy, sharedBy }],
 *   scRate: 0.10,
 *   vatRate: 0.07,
 *   groupMembers: ['A','B','C'],
 *   vatBase: 'itemPlusSC'   // optional
 * }
 *
 * หารบิล + ลดจำนวนธุรกรรมในขั้นตอนเดียว คืน items, summary, balances, transactions
 */
async function splitBill(req, res) {
  try {
    const { items, scRate = 0, vatRate = 0, groupMembers = [], vatBase } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items ต้องเป็น array ที่มีอย่างน้อย 1 รายการ' });
    }
    if (typeof scRate !== 'number' || typeof vatRate !== 'number') {
      return res.status(400).json({ error: 'scRate และ vatRate ต้องเป็นตัวเลข' });
    }

    const result = splitBillAndSettle(items, scRate, vatRate, {
      groupMembers,
      ...(vatBase ? { vatBase } : {}),
    });

    return res.status(200).json(result);
  } catch (err) {
    // error จาก validation ภายใน service (เช่น item ขาด paidBy) ให้ตอบเป็น 400
    return res.status(400).json({ error: err.message });
  }
}

/**
 * POST /api/groups/:groupId/split-bill/preview
 * เหมือน splitBill แต่ไม่ simplify debts — ใช้ตอนอยากโชว์รายละเอียดต่อ item
 * และ balance ต่อคนก่อน โดยยังไม่ commit เป็นธุรกรรมจริง
 */
async function previewBillSplit(req, res) {
  try {
    const { items, scRate = 0, vatRate = 0, groupMembers = [], vatBase } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items ต้องเป็น array ที่มีอย่างน้อย 1 รายการ' });
    }

    const result = splitBillForGroup(items, scRate, vatRate, {
      groupMembers,
      ...(vatBase ? { vatBase } : {}),
    });

    return res.status(200).json(result);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/**
 * POST /api/groups/:groupId/simplify-debts
 * Body: { balances: [{ person, amount }] }
 *
 * ใช้แยกจาก splitBill ได้ ในกรณีที่ balances คำนวณมาจากที่อื่น
 * (เช่น สะสมจากหลายบิลในกลุ่มมารวมกันก่อน ค่อย simplify ทีเดียว)
 */
async function simplifyDebtsHandler(req, res) {
  try {
    const { balances } = req.body;

    if (!Array.isArray(balances) || balances.length === 0) {
      return res.status(400).json({ error: 'balances ต้องเป็น array ที่มีอย่างน้อย 1 รายการ' });
    }

    const transactions = settleGroupBalances(balances);
    return res.status(200).json({ transactions });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
}

/**
 * POST /api/v1/bill-split/split
 * Body: {
 *   split: { method: 'equal'|'percent'|'item'|'amount', ... },
 *   paidBy: 'user-id',
 *   items: [{ id, price }]        // หรือ subtotal: number
 *   scRate: 0.10, vatRate: 0.07,
 *   groupMembers: ['A','B','C'],
 *   vatBase: 'itemPlusSC'          // optional
 * }
 *
 * รองรับ 3 เคสการหาร:
 *   1. equal   { split: { method:'equal',   memberIds:['A','B'] } }
 *   2. percent { split: { method:'percent', shares:{ A:60, B:40 } } }        (รวมต้อง = 100)
 *   3. sub-group แบบ item-based   { split: { method:'item',   items:[{ id, price, sharedBy:['A'] }] } }
 *              sub-group แบบ amount-based { split: { method:'amount', amounts:{ A:120, B:80 } } }  (รวมต้อง = ยอดบิล)
 *
 * คืน method, members (ส่วนที่แต่ละคนโดน), summary, balances, transactions
 */
async function split(req, res) {
  try {
    const { split: splitConfig, paidBy, items, subtotal, scRate = 0, vatRate = 0, groupMembers = [], vatBase } = req.body || {};

    if (!splitConfig || typeof splitConfig !== 'object') {
      return res.status(400).json({ error: 'split ต้องเป็น object ที่ระบุ method' });
    }
    if (!SPLIT_METHODS.includes(String(splitConfig.method || '').toLowerCase())) {
      return res.status(400).json({ error: `method ไม่รองรับ (รองรับ: ${SPLIT_METHODS.join(', ')})` });
    }
    if (!paidBy) {
      return res.status(400).json({ error: 'กรุณาระบุ paidBy (คนที่จ่ายทั้งบิล)' });
    }
    if (typeof scRate !== 'number' || typeof vatRate !== 'number') {
      return res.status(400).json({ error: 'scRate และ vatRate ต้องเป็นตัวเลข' });
    }

    const result = splitByMethodAndSettle({
      split: splitConfig,
      paidBy,
      items,
      subtotal,
      scRate,
      vatRate,
      options: { groupMembers, ...(vatBase ? { vatBase } : {}) },
    });

    return res.status(200).json(result);
  } catch (err) {
    // validation ภายใน (เช่น shares ไม่รวม 100, items ไม่ตรงยอด) -> 400
    return res.status(400).json({ error: err.message });
  }
}

module.exports = {
  splitBill,
  previewBillSplit,
  simplifyDebtsHandler,
  split,
};