// frontend/tests/frontend_softtest.mjs
// Comprehensive Software Test Suite for Frontend Business Logic & Calculations

import assert from 'node:assert/strict';
import {
  formatBaht,
  formatShortBaht,
  txDate,
  isExpense,
  translateCategory,
  startOfWeek,
  expensesBetween,
  totalExpenseBetween,
  comparisonText,
  comparisonDirection,
  buildCategoryBreakdown,
  buildDailyTrends,
  buildWeeklyTrends,
  buildPeriod,
  emptyPeriod,
  buildYearPeriod
} from '../src/lib/analyticsUtils.js';

import { digitsOnly, decimalOnly } from '../src/lib/inputSanitize.js';

let passed = 0;
let failed = 0;
const testResults = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    testResults.push({ name, status: 'PASSED', error: null });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    testResults.push({ name, status: 'FAILED', error: err.message });
    console.error(`  ✗ ${name}: ${err.message}`);
  }
}

console.log('\n========================================');
console.log('🧪 RUNNING FRONTEND SOFTTEST SUITE');
console.log('========================================\n');

// ----------------------------------------------------
// 1. Formatting & Input Sanitization
// ----------------------------------------------------
console.log('--- 1. Formatting & Input Sanitization ---');

test('formatBaht formats number to Thai Baht with 2 decimals', () => {
  assert.equal(formatBaht(1250.5), '฿1,250.50');
  assert.equal(formatBaht(0), '฿0.00');
  assert.equal(formatBaht('3000'), '฿3,000.00');
});

test('formatShortBaht formats thousands to K notation and units as integer', () => {
  assert.equal(formatShortBaht(500), '฿500');
  assert.equal(formatShortBaht(1200), '฿1.2K');
  assert.equal(formatShortBaht(25000), '฿25.0K');
});

test('digitsOnly removes non-digit characters correctly', () => {
  assert.equal(digitsOnly('abc123def456'), '123456');
  assert.equal(digitsOnly('1,250.50'), '125050');
  assert.equal(digitsOnly(null), '');
  assert.equal(digitsOnly(undefined), '');
});

test('decimalOnly retains only valid floating point digits with single dot', () => {
  assert.equal(decimalOnly('123.45'), '123.45');
  assert.equal(decimalOnly('12..34..56'), '12.3456');
  assert.equal(decimalOnly('฿1,500.75'), '1500.75');
  assert.equal(decimalOnly('abc'), '');
});

test('translateCategory correctly translates known categories and preserves unknown', () => {
  assert.equal(translateCategory('Food'), 'อาหาร');
  assert.equal(translateCategory('Transport'), 'เดินทาง');
  assert.equal(translateCategory('Shopping'), 'ช้อปปิ้ง');
  assert.equal(translateCategory('Other'), 'อื่นๆ');
  assert.equal(translateCategory('CustomCat'), 'CustomCat');
});

// ----------------------------------------------------
// 2. Date & Filtering Logic
// ----------------------------------------------------
console.log('\n--- 2. Date & Filtering Logic ---');

test('startOfWeek returns Monday at 00:00:00.000', () => {
  // Test with Wednesday 2026-10-28
  const wed = new Date(2026, 9, 28, 14, 30, 0); // month 9 is Oct
  const monday = startOfWeek(wed);
  assert.equal(monday.getDay(), 1, 'Day must be Monday (1)');
  assert.equal(monday.getDate(), 26, 'Monday of that week is Oct 26');
  assert.equal(monday.getHours(), 0);
  assert.equal(monday.getMinutes(), 0);
  assert.equal(monday.getSeconds(), 0);
});

test('startOfWeek returns the same day if input is already Monday', () => {
  const mon = new Date(2026, 9, 26, 18, 0, 0);
  const result = startOfWeek(mon);
  assert.equal(result.getDay(), 1);
  assert.equal(result.getDate(), 26);
  assert.equal(result.getHours(), 0);
});

test('expensesBetween filters out income and only includes transactions within range', () => {
  const sample = [
    { transaction_date: '2026-10-26T10:00:00Z', amount: '200', type: 'expense', categories: { name: 'Food', id: 1 } },
    { transaction_date: '2026-10-27T10:00:00Z', amount: '500', type: 'income', categories: { name: 'Salary', id: 2 } },
    { transaction_date: '2026-10-28T10:00:00Z', amount: '150', type: 'expense', categories: { name: 'Transport', id: 3 } },
    { transaction_date: '2026-11-05T10:00:00Z', amount: '300', type: 'expense', categories: { name: 'Food', id: 1 } }, // Out of range
  ];

  const start = new Date('2026-10-26T00:00:00Z');
  const end = new Date('2026-10-29T00:00:00Z');

  const filtered = expensesBetween(sample, start, end);
  assert.equal(filtered.length, 2, 'Should include only the 2 expenses within date range');
  assert.equal(totalExpenseBetween(sample, start, end), 350, 'Total expense should be 200 + 150 = 350');
});

// ----------------------------------------------------
// 3. Analytics Comparison & Metrics
// ----------------------------------------------------
console.log('\n--- 3. Analytics Comparison & Metrics ---');

test('comparisonText and comparisonDirection compute accurate change percentages', () => {
  // Previous = 1000, Current = 1500 (+50%)
  assert.equal(comparisonText(1500, 1000), '+50% จากช่วงก่อน');
  assert.equal(comparisonDirection(1500, 1000), 'up');

  // Previous = 1000, Current = 800 (-20%)
  assert.equal(comparisonText(800, 1000), '-20% จากช่วงก่อน');
  assert.equal(comparisonDirection(800, 1000), 'down');

  // Equal
  assert.equal(comparisonText(1000, 1000), 'เท่ากับช่วงก่อน');
  assert.equal(comparisonDirection(1000, 1000), 'flat');

  // Previous was 0
  assert.equal(comparisonText(500, 0), 'ช่วงใหม่');
  assert.equal(comparisonDirection(500, 0), 'flat');
  assert.equal(comparisonText(0, 0), 'เท่ากับช่วงก่อน');
});

// ----------------------------------------------------
// 4. Donut Chart Breakdown Logic
// ----------------------------------------------------
console.log('\n--- 4. Donut Chart Breakdown Logic ---');

test('buildCategoryBreakdown groups by category and computes correct percentages', () => {
  const transactions = [
    { transaction_date: '2026-10-26T10:00:00Z', amount: '600', type: 'expense', categories: { name: 'Food', id: 1 } },
    { transaction_date: '2026-10-26T12:00:00Z', amount: '300', type: 'expense', categories: { name: 'Transport', id: 2 } },
    { transaction_date: '2026-10-27T08:00:00Z', amount: '100', type: 'expense', categories: { name: 'Shopping', id: 3 } },
  ];
  const start = new Date('2026-10-26T00:00:00Z');
  const end = new Date('2026-10-28T00:00:00Z');

  const breakdown = buildCategoryBreakdown(transactions, start, end);
  assert.equal(breakdown.length, 3);
  assert.equal(breakdown[0].name, 'อาหาร');
  assert.equal(breakdown[0].amount, '฿600.00');
  assert.equal(breakdown[0].percent, 60);

  assert.equal(breakdown[1].name, 'เดินทาง');
  assert.equal(breakdown[1].amount, '฿300.00');
  assert.equal(breakdown[1].percent, 30);

  assert.equal(breakdown[2].name, 'ช้อปปิ้ง');
  assert.equal(breakdown[2].amount, '฿100.00');
  assert.equal(breakdown[2].percent, 10);

  const totalPercent = breakdown.reduce((sum, item) => sum + item.percent, 0);
  assert.equal(totalPercent, 100, 'Percentages must sum to 100%');
});

test('buildCategoryBreakdown handles empty transactions gracefully', () => {
  const start = new Date('2026-10-26T00:00:00Z');
  const end = new Date('2026-10-28T00:00:00Z');
  const breakdown = buildCategoryBreakdown([], start, end);
  assert.deepEqual(breakdown, []);
});

// ----------------------------------------------------
// 5. Bar Chart Trend Logic (Daily & Weekly)
// ----------------------------------------------------
console.log('\n--- 5. Bar Chart Trend Logic ---');

test('buildDailyTrends generates 7 bars with Mon-Sun labels and accurate scaling', () => {
  // Monday = Oct 26, Tuesday = Oct 27
  const transactions = [
    { transaction_date: '2026-10-26T10:00:00Z', amount: '400', type: 'expense' },
    { transaction_date: '2026-10-27T14:00:00Z', amount: '800', type: 'expense' },
  ];
  const start = new Date('2026-10-26T00:00:00Z');
  const end = new Date('2026-11-02T00:00:00Z');

  const daily = buildDailyTrends(transactions, start, end);
  assert.equal(daily.trends.length, 7);
  assert.equal(daily.trends[0].label, 'จ');
  assert.equal(daily.trends[0].val, 400);
  assert.equal(daily.trends[1].label, 'อ');
  assert.equal(daily.trends[1].val, 800);
  assert.equal(daily.trends[2].val, 0); // Wed
  assert.equal(daily.maxTrendVal, 800, 'maxTrendVal must be max amount');
});

test('buildDailyTrends handles zero-expense week without dividing by zero', () => {
  const start = new Date('2026-10-26T00:00:00Z');
  const end = new Date('2026-11-02T00:00:00Z');
  const daily = buildDailyTrends([], start, end);
  assert.equal(daily.trends.length, 7);
  assert.equal(daily.maxTrendVal, 1, 'maxTrendVal fallback must be at least 1');
});

test('buildWeeklyTrends generates weekly bars with Week labels and trims empty tail', () => {
  const transactions = [
    { transaction_date: '2026-10-02T10:00:00Z', amount: '1200', type: 'expense' },
    { transaction_date: '2026-10-15T14:00:00Z', amount: '1500', type: 'expense' },
  ];
  const start = new Date('2026-10-01T00:00:00Z');
  const end = new Date('2026-11-01T00:00:00Z');

  const weekly = buildWeeklyTrends(transactions, start, end);
  assert.ok(weekly.trends.length >= 4);
  assert.equal(weekly.trends[0].label, 'สัปดาห์ 1');
  assert.equal(weekly.trends[0].val, 1200);
  assert.equal(weekly.trends[2].label, 'สัปดาห์ 3');
  assert.equal(weekly.trends[2].val, 1500);
  assert.equal(weekly.maxTrendVal, 1500);
});

// ----------------------------------------------------
// 6. Complete Period Object Construction
// ----------------------------------------------------
console.log('\n--- 6. Complete Period Object Construction ---');

test('buildPeriod constructs full dashboard view model with budget remaining', () => {
  const transactions = [
    { transaction_date: '2026-10-26T10:00:00Z', amount: '500', type: 'expense', categories: { name: 'Food', id: 1 } },
  ];
  const start = new Date('2026-10-26T00:00:00Z');
  const end = new Date('2026-11-02T00:00:00Z');
  const prevStart = new Date('2026-10-19T00:00:00Z');
  const prevEnd = new Date('2026-10-26T00:00:00Z');

  const trends = buildDailyTrends(transactions, start, end);
  const period = buildPeriod({
    transactions,
    start,
    end,
    previousStart: prevStart,
    previousEnd: prevEnd,
    budgetLimit: 2000,
    trends,
  });

  assert.equal(period.totalExpense, '฿500.00');
  assert.equal(period.budgetRemaining, '฿1,500.00');
  assert.equal(period.budgetProgress, 0.25);
  assert.equal(period.donutCenter, '฿500');
  assert.equal(period.categories.length, 1);
  assert.equal(period.trends.length, 7);
});

// ----------------------------------------------------
// 7. Group Bill-Split Financial Math
// ----------------------------------------------------
console.log('\n--- 7. Group Bill-Split Financial Math ---');

test('Equal split with satang residual distributes exact cents with zero residual', () => {
  // 100 Baht split among 3 people: 33.34, 33.33, 33.33 -> sum = 100.00
  const totalSatang = 10000;
  const n = 3;
  const base = Math.floor(totalSatang / n);
  const remainder = totalSatang - base * n;

  const shares = [0, 1, 2].map((i) => base + (i < remainder ? 1 : 0));
  assert.equal(shares[0], 3334);
  assert.equal(shares[1], 3333);
  assert.equal(shares[2], 3333);
  assert.equal(shares.reduce((a, b) => a + b, 0), totalSatang, 'Sum of satangs must equal totalSatang');
});

test('Percentage split accurately computes per-member amounts from shares map', () => {
  const total = 500;
  const sharesMap = { user1: 50, user2: 30, user3: 20 };
  const memberAmounts = {};

  for (const [id, pct] of Object.entries(sharesMap)) {
    memberAmounts[id] = Math.round((total * (pct / 100)) * 100) / 100;
  }

  assert.equal(memberAmounts.user1, 250);
  assert.equal(memberAmounts.user2, 150);
  assert.equal(memberAmounts.user3, 100);
  const totalCalculated = Object.values(memberAmounts).reduce((a, b) => a + b, 0);
  assert.equal(totalCalculated, total);
});

// ----------------------------------------------------
// Summary
// ----------------------------------------------------
console.log('\n========================================');
console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED (TOTAL: ${passed + failed})`);
console.log('========================================\n');

if (failed > 0) {
  process.exit(1);
} else {
  console.log('🎉 ALL FRONTEND TESTS PASSED SUCCESSFULLY!\n');
}
