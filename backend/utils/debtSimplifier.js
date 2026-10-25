const DEFAULT_TOLERANCE = 0.01;

const round2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
const toSatang = (baht) => Math.round(baht * 100);

function simplifyDebts(balances, tolerance = DEFAULT_TOLERANCE) {
  if (!Array.isArray(balances)) {
    throw new TypeError('balances ต้องเป็น array');
  }
  if (balances.length === 0) return [];

  // คำนวณเป็นสตางค์จำนวนเต็ม กันเศษ 1 สตางค์ถูกมองเป็นศูนย์
  let totalSatang = 0;
  for (const b of balances) {
    if (typeof b.amount !== 'number' || Number.isNaN(b.amount)) {
      throw new TypeError(`amount ของ ${b.person} ต้องเป็นตัวเลข`);
    }
    totalSatang += toSatang(b.amount);
  }

  if (Math.abs(totalSatang) > toSatang(tolerance)) {
    throw new Error(
      `ผลรวม balances ต้องเท่ากับ 0 (คลาดเคลื่อนได้ไม่เกิน ${tolerance}) แต่พบผลรวม = ${round2(totalSatang / 100)}`
    );
  }

  const creditors = [];
  const debtors = [];
  for (const b of balances) {
    const amt = toSatang(b.amount);
    if (amt > 0) creditors.push({ person: b.person, amount: amt });
    else if (amt < 0) debtors.push({ person: b.person, amount: -amt });
  }
  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(debtor.amount, creditor.amount);

    transactions.push({ from: debtor.person, to: creditor.person, amount: pay / 100 });

    debtor.amount -= pay;
    creditor.amount -= pay;

    if (debtor.amount === 0) i++;
    if (creditor.amount === 0) j++;
  }

  return transactions;
}

module.exports = { simplifyDebts };