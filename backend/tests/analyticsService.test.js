const {
  filterByRange,
  byCategory,
  byMonth,
  getSummary,
  getIncomeExpense,
  buildAnalytics,
} = require('../services/analyticsService');

const food = { id: 1, name: 'อาหาร', icon_type: 'food' };
const travel = { id: 2, name: 'เดินทาง', icon_type: 'car' };

const data = [
  { transaction_date: '2026-01-05T10:00:00.000Z', amount: 100, type: 'expense', categories: food },
  { transaction_date: '2026-01-20T10:00:00.000Z', amount: 50, type: 'expense', categories: travel },
  { transaction_date: '2026-03-02T10:00:00.000Z', amount: 200, type: 'expense', categories: food },
  { transaction_date: '2026-03-10T10:00:00.000Z', amount: 5000, type: 'income', categories: null },
];

describe('analyticsService', () => {
  test('filterByRange กรองตามช่วงวันที่', () => {
    expect(filterByRange(data, '2026-01-01', '2026-01-31')).toHaveLength(2);
  });

  test('byCategory รวมยอดตามชื่อหมวดและเรียงมากไปน้อย', () => {
    const r = byCategory(data);
    expect(r.labels).toEqual(['อาหาร', 'เดินทาง']);
    expect(r.values).toEqual([300, 50]);
  });

  test('byCategory ใช้ "อื่นๆ" เมื่อไม่มีหมวด', () => {
    const r = byCategory([
      { transaction_date: '2026-01-01', amount: 10, type: 'expense', categories: null },
    ]);
    expect(r.labels).toEqual(['อื่นๆ']);
  });

  test('byMonth เติมเดือนที่ไม่มีข้อมูลเป็น 0', () => {
    const r = byMonth(data);
    expect(r.labels).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(r.values).toEqual([150, 0, 200]);
  });

  test('byMonth คืนค่าว่างเมื่อไม่มีข้อมูล', () => {
    expect(byMonth([])).toEqual({ labels: [], values: [] });
  });

  test('getSummary คำนวณยอดรวม ค่าเฉลี่ย ค่าสูงสุด (เฉพาะรายจ่าย)', () => {
    const s = getSummary(data);
    expect(s.total).toBe(350);
    expect(s.count).toBe(3);
    expect(s.max).toBe(200);
  });

  test('getIncomeExpense แยกรายรับ รายจ่าย และคงเหลือ', () => {
    expect(getIncomeExpense(data)).toEqual({ income: 5000, expense: 350, balance: 4650 });
  });

  test('buildAnalytics รวมทุกอย่างพร้อมกรองช่วงเวลา', () => {
    const r = buildAnalytics(data, { from: '2026-03-01', to: '2026-03-31' });
    expect(r.summary.total).toBe(200);
    expect(r.byMonth.labels).toEqual(['2026-03']);
  });

    test('byMonth นับตามเวลาไทย (ข้ามเดือนหลัง 17:00Z)', () => {
    const r = byMonth([
      { transaction_date: '2026-01-31T18:00:00.000Z', amount: 100, type: 'expense', categories: null },
    ]);
    expect(r.labels).toEqual(['2026-02']);
  });
});