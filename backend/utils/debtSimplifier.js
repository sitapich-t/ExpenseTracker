/**
 * debtSimplifier.js
 * -----------------
 * Core algorithm สำหรับลดจำนวนธุรกรรมการโอนเงินให้น้อยที่สุด (Debt Simplification)
 * 
 * Strategies:
 * - 'greedy' (Default): จับคู่ลูกหนี้มากสุด กับ เจ้าหนี้มากสุด เพื่อให้จำนวนธุรกรรมน้อยที่สุด
 * - 'hub': ให้ลูกหนี้ทุกคนโอนไปที่เจ้าหนี้ (Hub) แล้ว Hub ค่อยกระจายให้เจ้าหนี้คนอื่น
 */

const DEFAULT_TOLERANCE = 0.01; // บาท

/**
 * แปลงบาท -> สตางค์ (integer) เพื่อเลี่ยงปัญหา floating point
 * @param {number} baht
 * @returns {number}
 */
function toSatang(baht) {
  return Math.round(baht * 100);
}

/**
 * เคลียร์เศษสตางค์ส่วนเกินที่เกิดจากการปัดเศษรายบุคคล
 * @param {Array<{person: string, amount: number}>} people
 * @returns {Array<{person: string, amount: number}>}
 */
function adjustResidual(people) {
  const residual = people.reduce((s, p) => s + p.amount, 0);
  if (residual !== 0 && people.length > 0) {
    const target = people.reduce((max, p) =>
      Math.abs(p.amount) > Math.abs(max.amount) ? p : max
    );
    target.amount -= residual;
  }
  return people.filter((p) => Math.abs(p.amount) >= 1);
}

/**
 * Strategy 1: Greedy Direct Matching
 * @param {Array<{person: string, amount: number}>} people
 * @returns {Array<{from: string, to: string, amount: number}>}
 */
function solveGreedy(people) {
  const transactions = [];

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

    if (!maxCreditor || !maxDebtor) break;

    const settleAmount = Math.min(maxCreditor.amount, -maxDebtor.amount);

    transactions.push({
      from: maxDebtor.person,
      to: maxCreditor.person,
      amount: settleAmount / 100,
    });

    maxCreditor.amount -= settleAmount;
    maxDebtor.amount += settleAmount;

    people = people.filter((p) => Math.abs(p.amount) >= 1);
  }

  return transactions;
}

/**
 * Strategy 2: Hub / Centralized Clearing
 * @param {Array<{person: string, amount: number}>} people
 * @param {string} [customHubPerson] ชื่อ person ที่ต้องการให้เป็น Hub
 * @returns {Array<{from: string, to: string, amount: number}>}
 */
function solveHub(people, customHubPerson) {
  const debtors = people.filter((p) => p.amount < 0);
  const creditors = people.filter((p) => p.amount > 0);

  if (debtors.length === 0 || creditors.length === 0) {
    return [];
  }

  let hub = null;

  if (customHubPerson) {
    hub = creditors.find((c) => c.person === customHubPerson);

    if (!hub) {
      const isDebtor = debtors.some((d) => d.person === customHubPerson);
      const reason = isDebtor
        ? `เป็นลูกหนี้ (ยอดสุทธิ < 0)`
        : `ไม่มีชื่ออยู่ในรายการยอดสุทธิ`;

      throw new Error(
        `Hub Person '${customHubPerson}' ไม่สามารถเป็น Hub ได้เนื่องจาก${reason} (Hub ต้องเป็นผู้ได้รับเงินคืนที่มียอดสุทธิ > 0 เท่านั้น)`
      );
    }
  } else {
    // หากไม่ได้ระบุ ให้เลือกเจ้าหนี้รายใหญ่ที่สุดโดยอัตโนมัติ
    hub = creditors.reduce((max, c) => (c.amount > max.amount ? c : max));
  }

  const transactions = [];

  // Step 1: ลูกหนี้ทุกคนโอนตรงเข้า Hub
  for (const debtor of debtors) {
    transactions.push({
      from: debtor.person,
      to: hub.person,
      amount: Math.abs(debtor.amount) / 100,
    });
  }

  // Step 2: Hub โอนกระจายไปให้เจ้าหนี้ท่านอื่น (ยกเว้นตัวเอง)
  for (const creditor of creditors) {
    if (creditor.person !== hub.person) {
      transactions.push({
        from: hub.person,
        to: creditor.person,
        amount: creditor.amount / 100,
      });
    }
  }

  return transactions;
}

/**
 * ลดจำนวนธุรกรรมการโอนเงินระหว่างสมาชิกในกลุ่ม
 *
 * @param {Array<{person: string, amount: number}>} balances
 *        - person: ชื่อ/id ของสมาชิก
 *        - amount: ยอดสุทธิ (บาท) โดย
 *            amount > 0  หมายถึง "ควรได้รับเงินคืน" (เจ้าหนี้)
 *            amount < 0  หมายถึง "ต้องจ่ายเงิน" (ลูกหนี้)
 * @param {Object} [options]
 * @param {number} [options.tolerance=0.01] ค่าความคลาดเคลื่อนที่ยอมรับได้ (บาท)
 * @param {'greedy'|'hub'} [options.strategy='greedy'] อัลกอริทึมที่ต้องการใช้
 * @param {string} [options.hubPerson] กำหนด Hub Person เอง (ใช้คู่กับ strategy='hub', ต้องเป็นผู้มียอดสุทธิ > 0)
 * @returns {Array<{from: string, to: string, amount: number}>} รายการธุรกรรมที่ต้องโอน
 */
function simplifyDebts(balances, options = {}) {
  const { tolerance = DEFAULT_TOLERANCE, strategy = 'greedy', hubPerson } = options;

  if (!Array.isArray(balances) || balances.length === 0) {
    return [];
  }

  if (!['greedy', 'hub'].includes(strategy)) {
    throw new Error(`Strategy ไม่ถูกต้อง: '${strategy}' (รองรับเฉพาะ 'greedy' หรือ 'hub')`);
  }

  // 1) ตรวจสอบว่าผลรวม balance ทั้งหมดใกล้เคียง 0
  const sumBaht = balances.reduce((s, b) => s + b.amount, 0);
  if (Math.abs(sumBaht) > tolerance) {
    throw new Error(
      `ผลรวม balances ต้องเท่ากับ 0 (คลาดเคลื่อนได้ไม่เกิน ${tolerance} บาท) แต่พบผลรวม = ${sumBaht}`
    );
  }

  // 2) แปลงเป็นสตางค์และปรับเศษ residual
  let people = balances
    .map((b) => ({ person: b.person, amount: toSatang(b.amount) }))
    .filter((p) => Math.abs(p.amount) >= 1);

  people = adjustResidual(people);

  // 3) คำนวณตาม Strategy ที่เลือก
  if (strategy === 'hub') {
    return solveHub(people, hubPerson);
  }

  return solveGreedy(people);
}

module.exports = {
  simplifyDebts,
};