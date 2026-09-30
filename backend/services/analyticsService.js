// รับรายการ personal_transactions (join categories) แล้วคืนข้อมูลพร้อมใช้กับกราฟ
// รูปแบบ: { transaction_date, amount, type, categories: { id, name, icon_type } | null }

function toDateStr(t) {
  const d = new Date(t.transaction_date);
  // เลื่อน +7 ชม. แล้วอ่านค่า UTC เพื่อให้ได้วันที่ตามเวลาไทย
  const th = new Date(d.getTime() + 7 * 60 * 60 * 1000);
  return th.toISOString().slice(0, 10);
}
function filterByRange(items, from, to) {
  return items.filter((t) => {
    const d = toDateStr(t);
    return (!from || d >= from) && (!to || d <= to);
  });
}

function onlyExpenses(items) {
  return items.filter((t) => !t.type || t.type === 'expense');
}

function categoryName(t) {
  return (t.categories && t.categories.name) || 'อื่นๆ';
}

function groupSum(items, keyFn) {
  const map = new Map();
  for (const t of items) {
    const key = keyFn(t);
    map.set(key, (map.get(key) || 0) + Number(t.amount || 0));
  }
  return map;
}

function toChartData(map) {
  return { labels: [...map.keys()], values: [...map.values()] };
}

function monthRange(start, end) {
  const result = [];
  let [y, m] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    result.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return result;
}

function byCategory(items) {
  const map = groupSum(onlyExpenses(items), categoryName);
  const sorted = new Map([...map.entries()].sort((a, b) => b[1] - a[1]));
  return toChartData(sorted);
}

function byMonth(items) {
  const expenses = onlyExpenses(items);
  if (expenses.length === 0) return { labels: [], values: [] };

  const map = groupSum(expenses, (t) => toDateStr(t).slice(0, 7));
  const months = [...map.keys()].sort();
  const filled = monthRange(months[0], months[months.length - 1]);

  return { labels: filled, values: filled.map((m) => map.get(m) || 0) };
}

function getSummary(items) {
  const expenses = onlyExpenses(items);
  const amounts = expenses.map((t) => Number(t.amount || 0));
  const total = amounts.reduce((s, a) => s + a, 0);
  const count = amounts.length;
  return {
    total,
    count,
    average: count ? total / count : 0,
    max: count ? Math.max(...amounts) : 0,
  };
}

// ใช้ยอดรายรับ-รายจ่ายเทียบกัน (สำหรับการ์ดสรุป)
function getIncomeExpense(items) {
  let income = 0;
  let expense = 0;
  for (const t of items) {
    const a = Number(t.amount || 0);
    if (t.type === 'income') income += a;
    else expense += a;
  }
  return { income, expense, balance: income - expense };
}

function buildAnalytics(items, { from, to } = {}) {
  const filtered = filterByRange(items, from, to);
  return {
    summary: getSummary(filtered),
    incomeExpense: getIncomeExpense(filtered),
    byCategory: byCategory(filtered),
    byMonth: byMonth(filtered),
  };
}

module.exports = {
  filterByRange,
  groupSum,
  toChartData,
  monthRange,
  byCategory,
  byMonth,
  getSummary,
  getIncomeExpense,
  buildAnalytics,
};