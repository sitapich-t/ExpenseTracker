export const CATEGORY_COLORS = [
  '#7C3AED', '#3B82F6', '#10B981', '#EC4899', '#F59E0B',
  '#EF4444', '#8B5CF6', '#14B8A6', '#F97316', '#6366F1',
];

const DAY_LABELS = ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา'];

export function formatBaht(num) {
  return '฿' + Number(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatShortBaht(num) {
  return num >= 1000 ? '฿' + (num / 1000).toFixed(1) + 'K' : '฿' + Number(num).toFixed(0);
}

export const txDate = (t) => new Date(t.transaction_date || t.created_at);
export const isExpense = (t) => t.type !== 'income';
const CATEGORY_TH = { Other: 'อื่นๆ', Food: 'อาหาร', Transport: 'เดินทาง', Shopping: 'ช้อปปิ้ง' };
export const translateCategory = (n) => CATEGORY_TH[n] || n;
const categoryNameOf = (t) => translateCategory(t.categories?.name || 'อื่นๆ');
const amountOf = (t) => parseFloat(t.amount) || 0;

// ต้นสัปดาห์ = วันจันทร์ 00:00
export function startOfWeek(d) {
  const x = new Date(d);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  x.setHours(0, 0, 0, 0);
  return x;
}

// รายจ่ายในช่วง [start, end) — ตัวกรองเดียวที่ทุกฟังก์ชันใช้ร่วมกัน
export function expensesBetween(transactions, start, end) {
  return transactions.filter((t) => {
    const d = txDate(t);
    return !isNaN(d) && d >= start && d < end && isExpense(t);
  });
}

export function totalExpenseBetween(transactions, start, end) {
  return expensesBetween(transactions, start, end).reduce((s, t) => s + amountOf(t), 0);
}

export function comparisonText(current, previous) {
  if (previous <= 0) return current > 0 ? 'ช่วงใหม่' : 'เท่ากับช่วงก่อน';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return 'เท่ากับช่วงก่อน';
  return `${pct > 0 ? '+' : ''}${pct}% จากช่วงก่อน`;
}

export function comparisonDirection(current, previous) {
  if (previous <= 0) return 'flat';
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct > 0) return 'up';
  if (pct < 0) return 'down';
  return 'flat';
}

export function buildCategoryBreakdown(transactions, start, end) {
  const byCat = {};
  expensesBetween(transactions, start, end).forEach((t) => {
    const key = t.categories?.id ?? t.category_id ?? 9;
    if (!byCat[key]) byCat[key] = { name: categoryNameOf(t), total: 0 };
    byCat[key].total += amountOf(t);
  });

  const rows = Object.values(byCat).sort((a, b) => b.total - a.total);
  const total = rows.reduce((s, r) => s + r.total, 0);

  return rows.map((r, i) => ({
    name: r.name,
    amount: formatBaht(r.total),
    percent: total > 0 ? Math.round((r.total / total) * 100) : 0,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));
}

function toTrends(values, labelFn) {
  const trends = values.map((val, idx) => ({
    label: labelFn(idx),
    amount: '฿' + Math.round(val),
    val: Math.round(val),
  }));
  return { trends, maxTrendVal: Math.max(...trends.map((t) => t.val), 1) };
}

export function buildDailyTrends(transactions, start, end) {
  const totals = [0, 0, 0, 0, 0, 0, 0]; // จ..อา
  expensesBetween(transactions, start, end).forEach((t) => {
    const dow = txDate(t).getDay();
    totals[dow === 0 ? 6 : dow - 1] += amountOf(t);
  });
  return toTrends(totals, (i) => DAY_LABELS[i]);
}

export function buildWeeklyTrends(transactions, start, end) {
  const totals = [0, 0, 0, 0, 0];
  expensesBetween(transactions, start, end).forEach((t) => {
    const w = Math.min(Math.floor((txDate(t).getDate() - 1) / 7), 4);
    totals[w] += amountOf(t);
  });

  let last = totals.length - 1;
  while (last > 0 && totals[last] === 0) last--;
  const active = totals.slice(0, Math.max(last + 1, 4));
  return toTrends(active, (i) => `สัปดาห์ ${i + 1}`);
}

export function buildPeriod({ transactions, start, end, previousStart, previousEnd, budgetLimit, trends }) {
  const totalExpense = totalExpenseBetween(transactions, start, end);
  const previousTotal = totalExpenseBetween(transactions, previousStart, previousEnd);
  const budgetRemaining = budgetLimit > 0 ? budgetLimit - totalExpense : 0;

  return {
    totalExpense: formatBaht(totalExpense),
    comparison: comparisonText(totalExpense, previousTotal),
    comparisonDirection: comparisonDirection(totalExpense, previousTotal),
    budgetRemaining: formatBaht(Math.max(budgetRemaining, 0)),
    budgetGoal: budgetLimit > 0 ? `เป้าหมาย ${formatBaht(budgetLimit)}` : 'ยังไม่ได้ตั้งงบ',
    budgetProgress: budgetLimit > 0 ? Math.min(totalExpense / budgetLimit, 1) : 0,
    donutCenter: formatShortBaht(totalExpense),
    categories: buildCategoryBreakdown(transactions, start, end),
    trends: trends.trends,
    maxTrendVal: trends.maxTrendVal,
  };
}

export const emptyPeriod = {
  totalExpense: formatBaht(0),
  comparison: '',
  comparisonDirection: 'flat',
  budgetRemaining: formatBaht(0),
  budgetGoal: 'ยังไม่ได้ตั้งงบ',
  budgetProgress: 0,
  donutCenter: formatBaht(0),
  categories: [],
  trends: [],
  maxTrendVal: 1,
};

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
];

// แปลงผลจาก GET /personal/analytics ให้อยู่ในรูปเดียวกับ buildPeriod (ใช้ component เดิมได้เลย)
export function buildYearPeriod(analytics, year) {
  // เติมให้ครบ 12 เดือน (API คืนเฉพาะช่วงที่มีข้อมูล)
  const totals = Array(12).fill(0);
  const { labels = [], values = [] } = analytics?.byMonth || {};
  labels.forEach((label, i) => {
    const [y, m] = label.split('-').map(Number);
    if (y === year) totals[m - 1] = values[i] || 0;
  });

  const trends = totals.map((val, i) => ({
    label: THAI_MONTHS_SHORT[i],
    amount: val >= 1000 ? (val / 1000).toFixed(1) + 'K' : String(Math.round(val)),
    val: Math.round(val),
  }));

  const { labels: cl = [], values: cv = [] } = analytics?.byCategory || {};
  const catTotal = cv.reduce((s, a) => s + a, 0);
  const categories = cl.map((name, i) => ({
    name: translateCategory(name),
    amount: formatBaht(cv[i]),
    percent: catTotal > 0 ? Math.round((cv[i] / catTotal) * 100) : 0,
    color: CATEGORY_COLORS[i % CATEGORY_COLORS.length],
  }));

  const total = analytics?.summary?.total || 0;
  return {
    ...emptyPeriod,
    totalExpense: formatBaht(total),
    donutCenter: formatShortBaht(total),
    categories,
    trends,
    maxTrendVal: Math.max(...trends.map((t) => t.val), 1),
  };
}