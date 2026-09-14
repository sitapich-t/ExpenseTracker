/**
 * billSplitController.js
 * -----------------------
 * รับ request จาก route แล้วเรียก billSplitService
 * Controller ทำหน้าที่แค่: validate input เบื้องต้น -> เรียก service -> ส่ง response
 * ไม่ควรมี business logic (การคำนวณ) อยู่ในนี้ ให้อยู่ใน service ทั้งหมด
 */

const {
  splitBillForGroup,
  settleGroupBalances,
  splitBillAndSettle,
} = require('../services/billSplitService');

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

module.exports = {
  splitBill,
  previewBillSplit,
  simplifyDebtsHandler,
};