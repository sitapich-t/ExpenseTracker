/**
 * debtSimplifier.js
 * ลดจำนวนธุรกรรมการโอนเงินระหว่างสมาชิกในกลุ่มให้เหลือน้อยที่สุด (Debt Simplification)
 *
 * แนวคิด: greedy matching — ในแต่ละรอบ จับคู่ "ลูกหนี้ที่ติดมากสุด" กับ
 * "เจ้าหนี้ที่ควรได้รับคืนมากสุด" แล้วโอนเท่าที่น้อยกว่าของทั้งคู่ ทำซ้ำจนหมด
 * ผลลัพธ์: จำนวนธุรกรรมสูงสุดคือ (จำนวนคน - 1) เสมอ
 */

const DEFAULT_TOLERANCE = 0.01;

/** ปัดเศษทศนิยม 2 ตำแหน่ง กันปัญหา floating point สะสมจากการบวกลบต่อเนื่อง */
function round2(num) {
  return Math.round((num + Number.EPSILON) * 100) / 100;
}

/**
 * @param {Array<{person: string, amount: number}>} balances
 *   amount > 0 -> เป็นเจ้าหนี้ ควรได้รับเงินคืนเท่านี้
 *   amount < 0 -> เป็นลูกหนี้ ติดหนี้เท่านี้
 * @param {number} [tolerance=0.01] ค่าความคลาดเคลื่อนที่ยอมรับได้จาก floating point
 * @returns {Array<{from: string, to: string, amount: number}>} รายการธุรกรรมที่ต้องโอน
 * @throws {Error} ถ้าผลรวม balances ไม่เท่ากับ 0 (เกิน tolerance)
 */
function simplifyDebts(balances, tolerance = DEFAULT_TOLERANCE) {
  if (!Array.isArray(balances)) {
    throw new TypeError('balances ต้องเป็น array');
  }
  if (balances.length === 0) return [];

  const total = balances.reduce((sum, b) => {
    if (typeof b.amount !== 'number' || Number.isNaN(b.amount)) {
      throw new TypeError(`amount ของ ${b.person} ต้องเป็นตัวเลข`);
    }
    return sum + b.amount;
  }, 0);

  if (Math.abs(total) > tolerance) {
    throw new Error(
      `ผลรวม balances ต้องเท่ากับ 0 (คลาดเคลื่อนได้ไม่เกิน ${tolerance}) แต่พบผลรวม = ${round2(total)}`
    );
  }

  // แยกเจ้าหนี้ / ลูกหนี้ ตัดคนที่ balance ~0 ทิ้ง แล้วเรียงจากมากไปน้อย
  const creditors = [];
  const debtors = [];
  for (const b of balances) {
    const amt = round2(b.amount);
    if (amt > tolerance) creditors.push({ person: b.person, amount: amt });
    else if (amt < -tolerance) debtors.push({ person: b.person, amount: -amt });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0; // pointer ของ debtors
  let j = 0; // pointer ของ creditors

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const payAmount = round2(Math.min(debtor.amount, creditor.amount));

    if (payAmount > tolerance) {
      transactions.push({ from: debtor.person, to: creditor.person, amount: payAmount });
    }

    debtor.amount = round2(debtor.amount - payAmount);
    creditor.amount = round2(creditor.amount - payAmount);

    if (debtor.amount <= tolerance) i++;
    if (creditor.amount <= tolerance) j++;
  }

  return transactions;
}

module.exports = { simplifyDebts };