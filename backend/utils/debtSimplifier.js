/**
 * debtSimplifier.js
 * -----------------
 * Core algorithm สำหรับลดจำนวนธุรกรรมการโอนเงินให้น้อยที่สุด (Debt Simplification)
 * ระยะที่ 1: ใช้ Greedy Algorithm (จับคู่ผู้เป็นหนี้มากสุด กับ ผู้ควรได้รับเงินคืนมากสุด)
 *
 * หมายเหตุ: การหาคำตอบที่ optimal ที่สุด (จำนวนธุรกรรมน้อยที่สุดเท่าที่เป็นไปได้)
 * เป็นปัญหา NP-hard (คล้าย subset-sum) การใช้ Greedy จะได้คำตอบที่ดีมากในทางปฏิบัติ
 * แต่ไม่การันตี optimal 100% — หากต้องการ optimal จริง ให้พิจารณาทำใน Phase ถัดไป
 * (เช่น backtracking / ILP) เมื่อจำนวนคนในกลุ่มไม่มากเกินไป
 */

const DEFAULT_TOLERANCE = 0.01; // บาท

/** แปลงบาท -> สตางค์ (integer) เพื่อเลี่ยงปัญหา floating point */
function toSatang(baht) {
  return Math.round(baht * 100);
}

/**
 * ลดจำนวนธุรกรรมการโอนเงินระหว่างสมาชิกในกลุ่ม
 *
 * @param {Array<{person: string, amount: number}>} balances
 *        - person: ชื่อ/id ของสมาชิก
 *        - amount: ยอดสุทธิ (บาท) โดย
 *            amount > 0  หมายถึง "ควรได้รับเงินคืน" (เป็นเจ้าหนี้)
 *            amount < 0  หมายถึง "ต้องจ่ายเงิน" (เป็นลูกหนี้)
 * @param {Object} [options]
 * @param {number} [options.tolerance=0.01] - ค่าความคลาดเคลื่อนที่ยอมรับได้ (บาท)
 *        สำหรับตรวจสอบว่าผลรวม balances ทั้งหมดควรเท่ากับ 0
 * @returns {Array<{from: string, to: string, amount: number}>} รายการธุรกรรมที่ต้องโอน
 */
function simplifyDebts(balances, options = {}) {
  const { tolerance = DEFAULT_TOLERANCE } = options;

  if (!Array.isArray(balances) || balances.length === 0) {
    return [];
  }

  // 1) ตรวจสอบว่าผลรวม balance ทั้งหมดใกล้เคียง 0 (หนี้ต้องสมดุลกันเสมอ)
  const sumBaht = balances.reduce((s, b) => s + b.amount, 0);
  if (Math.abs(sumBaht) > tolerance) {
    throw new Error(
      `ผลรวม balances ต้องเท่ากับ 0 (คลาดเคลื่อนได้ไม่เกิน ${tolerance} บาท) ` +
        `แต่พบผลรวม = ${sumBaht}`
    );
  }

  // 2) แปลงเป็นหน่วยสตางค์ (integer) และตัดคนที่ยอดใกล้ 0 ทิ้ง
  let people = balances
    .map((b) => ({ person: b.person, amount: toSatang(b.amount) }))
    .filter((p) => Math.abs(p.amount) >= 1);

  const transactions = [];

  // 3) วนจับคู่ "เจ้าหนี้มากสุด" กับ "ลูกหนี้มากสุด" ทีละรอบ จนกว่าจะหมด
  //    (O(n) ต่อรอบในการหาค่ามากสุด, O(n) รอบ รวม O(n^2) ซึ่งเพียงพอสำหรับ Phase 1
  //    ถ้ากลุ่มมีสมาชิกจำนวนมาก ค่อยเปลี่ยนไปใช้ max-heap เพื่อลดเป็น O(n log n))
  while (true) {
    let maxCreditor = null;
    let maxDebtor = null;

    for (const p of people) {
      if (p.amount > 0 && (!maxCreditor || p.amount > maxCreditor.amount)) {
        maxCreditor = p;
      }
      if (p.amount < 0 && (!maxDebtor || p.amount < maxDebtor.amount)) {
        maxDebtor = p;
      }
    }

    if (!maxCreditor || !maxDebtor) break; // ไม่มีใครค้างจ่าย/ค้างรับแล้ว

    const settleAmount = Math.min(maxCreditor.amount, -maxDebtor.amount);

    transactions.push({
      from: maxDebtor.person,
      to: maxCreditor.person,
      amount: settleAmount / 100, // แปลงกลับเป็นบาท
    });

    maxCreditor.amount -= settleAmount;
    maxDebtor.amount += settleAmount;

    // ตัดคนที่ยอดหมดแล้วออก (เหลือ < 1 สตางค์)
    people = people.filter((p) => Math.abs(p.amount) >= 1);
  }

  return transactions;
}

module.exports = {
  simplifyDebts,
};