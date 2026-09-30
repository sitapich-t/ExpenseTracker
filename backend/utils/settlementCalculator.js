/**
 * settlementCalculator.js
 * -----------------------
 * ชั้นประสานงาน: นำบิลทั้งหมดของกลุ่ม -> คำนวณ "ใครต้องจ่ายใคร"
 *
 * ไล่การพึ่งพา:
 *   splitMethod.resolveSplit     (split_data -> ส่วนที่แต่ละคนต้องจ่าย)
 *        -> balanceCalculator    (รวมหลายบิล -> net balance ต่อคน)
 *        -> debtSimplifier       (ตัดหนี้ -> รายการโอนเงิน)
 *
 * จุดสำคัญ: balanceCalculator เดิมรับ `members` ที่คำนวณไว้แล้ว
 * ฟังก์ชันนี้คือที่เดียวที่เรียก resolveSplit เพื่อแปลง split_data (ที่เก็บใน DB)
 * ให้เป็นรูปแบบที่ balanceCalculator เข้าใจ
 */

const { resolveSplit } = require('./splitMethod');
const { calculateGroupBalances } = require('./balanceCalculator');
const { simplifyDebts } = require('./debtSimplifier');

/** อ่านตัวเลขจาก DB ซึ่งอาจเป็น string / null */
function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * เตรียมบิลหนึ่งใบให้พร้อมคำนวณ
 * @param {Object} tx แถวจาก group_transactions
 * @param {string[]} memberIds สมาชิกทั้งกลุ่ม (default ของ 'equal')
 * @returns {{billId, paidBy, members, method, shares}}
 */
function prepareBill(tx, memberIds) {
  const billId = tx.id || tx.billId || 'unknown';
  const paidBy = tx.paid_by || tx.paidBy || null;

  if (!paidBy) {
    throw new Error(`บิล "${billId}" ไม่มีระบุคนจ่าย (paid_by)`);
  }

  // บิลรายได้ (income) ไม่ต้องหาร
  if (String(tx.type || 'expense').toLowerCase() === 'income') {
    return { billId, paidBy, members: { [paidBy]: { price: 0, sc: 0, vat: 0, total: 0 } }, method: 'income', shares: {}, skipped: true };
  }

  const subtotal = num(tx.subtotal) || num(tx.amount);
  const scAmount = num(tx.sc_amount);
  const vatAmount = num(tx.vat_amount);

  const result = resolveSplit(tx.split_data || {}, {
    subtotal,
    scAmount,
    vatAmount,
    memberIds,
  });

  return {
    billId,
    paidBy,
    members: result.members,
    method: result.method,
    shares: result.members,
  };
}

/**
 * คำนวณยอดสะสดและรายการโอนเงินทั้งกลุ่ม
 *
 * @param {Array<Object>} transactions แถวจาก group_transactions
 * @param {string[]} memberIds สมาชิกทั้งกลุ่ม
 * @returns {{balances:Array, transactions:Array, perBill:Array, skipped:Array}}
 */
function calculateSettlement(transactions, memberIds = []) {
  const prepared = [];
  const skipped = [];

  for (const tx of transactions || []) {
    try {
      const bill = prepareBill(tx, memberIds);
      if (bill.skipped) {
        skipped.push({ billId: bill.billId, reason: 'income' });
        continue;
      }
      prepared.push(bill);
    } catch (err) {
      // บิลที่คำนวณไม่ได้ (เช่น split_data เสีย/ไม่ครบ) — ข้ามไปและรายงานกลับ
      // ไม่ throw เพราะบิลเก่าที่บันทึกก่อนอัปเดตฟีเจอร์นี้อาจยังใช้รูปแบบเดิม
      skipped.push({
        billId: tx.id || tx.billId || 'unknown',
        title: tx.title || null,
        reason: err.message,
      });
    }
  }

  const balances = calculateGroupBalances(prepared);
  const settlements = prepared.length > 0 ? simplifyDebts(balances) : [];

  // เติมยอด 0 ให้สมาชิกที่ยังไม่มีภาระ เพื่อให้ UI แสดงครบทุกคน
  const seen = new Set(balances.map((b) => b.person));
  const fullBalances = balances.slice();
  for (const id of memberIds) {
    const key = String(id);
    if (!seen.has(key)) {
      fullBalances.push({ person: key, amount: 0 });
    }
  }

  return {
    balances: fullBalances,
    transactions: settlements,
    perBill: prepared,
    skipped,
  };
}

module.exports = {
  calculateSettlement,
  prepareBill,
};
