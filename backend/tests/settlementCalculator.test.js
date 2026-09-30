/**
 * settlementCalculator.test.js
 * รัน: npx jest tests/settlementCalculator.test.js
 */
const { calculateSettlement } = require('../utils/settlementCalculator');
const { splitBillByMethod, splitByMethodAndSettle } = require('../services/billSplitService');

const A = 'alice';
const B = 'bob';
const C = 'charlie';
const MEM = [A, B, C];

/** สร้างแถวเหมือนที่อ่านมาจาก group_transactions */
const tx = (o) => ({
  id: o.id || Math.random().toString(36).slice(2),
  title: o.title || 'บิล',
  type: o.type || 'expense',
  subtotal: o.subtotal,
  amount: o.amount ?? o.subtotal,
  sc_amount: o.scAmount || 0,
  vat_amount: o.vatAmount || 0,
  paid_by: o.paidBy,
  split_data: o.splitData || null,
});

describe('calculateSettlement', () => {
  test('equal: คนจ่ายได้คืนส่วนที่คนอื่นเป็นหนี้', () => {
    const r = calculateSettlement(
      [tx({ subtotal: 300, paidBy: A, splitData: { method: 'equal' } })],
      MEM
    );
    expect(r.transactions).toHaveLength(2);
    const bal = Object.fromEntries(r.balances.map((b) => [b.person, b.amount]));
    expect(bal[A]).toBeCloseTo(200, 2);
    expect(bal[B]).toBeCloseTo(-100, 2);
    expect(bal[C]).toBeCloseTo(-100, 2);
  });

  test('percent: แบ่งตามสัดส่วน ไม่ใช่หารเท่ากัน', () => {
    const r = calculateSettlement(
      [
        tx({
          subtotal: 1000,
          paidBy: A,
          splitData: { method: 'percent', shares: { [A]: 70, [B]: 30 } },
        }),
      ],
      MEM
    );
    // A จ่าย 1000 โดนหักส่วนตัวเอง 700 -> ได้คืน 300 (เท่ากับ 30% ที่ B เป็นหนี้)
    const bal = Object.fromEntries(r.balances.map((b) => [b.person, b.amount]));
    expect(bal[A]).toBeCloseTo(300, 2);
    expect(bal[B]).toBeCloseTo(-300, 2);
    expect(bal[C]).toBeCloseTo(0, 2);
  });

  test('item: แต่ละคนโดนเฉพาะของตัวเอง', () => {
    const r = calculateSettlement(
      [
        tx({
          subtotal: 500,
          paidBy: B,
          splitData: {
            method: 'item',
            items: [
              { id: 'i1', price: 300, sharedBy: [A] },
              { id: 'i2', price: 200, sharedBy: [B, C] },
            ],
          },
        }),
      ],
      MEM
    );
    // A โดน 300, B โดน 100, C โดน 100 -> B จ่าย 500 ต้องได้คืน 400, A ต้องจ่าย 300, C ต้องจ่าย 100
    const bal = Object.fromEntries(r.balances.map((b) => [b.person, b.amount]));
    expect(bal[A]).toBeCloseTo(-300, 2);
    expect(bal[B]).toBeCloseTo(400, 2);
    expect(bal[C]).toBeCloseTo(-100, 2);
  });

  test('amount: ใช้ยอดตายตัวที่กรอก', () => {
    const r = calculateSettlement(
      [
        tx({
          subtotal: 200,
          paidBy: A,
          splitData: { method: 'amount', amounts: { [A]: 120, [B]: 80 } },
        }),
      ],
      MEM
    );
    const bal = Object.fromEntries(r.balances.map((b) => [b.person, b.amount]));
    expect(bal[A]).toBeCloseTo(80, 2);
    expect(bal[B]).toBeCloseTo(-80, 2);
  });

  test('SC/VAT ถูกหารตามวิธีของแต่ละบิล', () => {
    const r = calculateSettlement(
      [
        tx({
          subtotal: 1000,
          scAmount: 100,
          vatAmount: 70,
          paidBy: A,
          splitData: { method: 'percent', shares: { [A]: 50, [B]: 50 } },
        }),
      ],
      MEM
    );
    // ยอดรวม 1170 -> คนละ 585
    const bal = Object.fromEntries(r.balances.map((b) => [b.person, b.amount]));
    expect(bal[A]).toBeCloseTo(585, 2);
    expect(bal[B]).toBeCloseTo(-585, 2);
  });

  test('ผลรวม balance ต้อง = 0 เสมอ', () => {
    const r = calculateSettlement(
      [
        tx({ subtotal: 300, paidBy: A, splitData: { method: 'equal' } }),
        tx({ subtotal: 440, paidBy: B, splitData: { method: 'percent', shares: { [A]: 60, [B]: 40 } } }),
        tx({
          subtotal: 150,
          paidBy: C,
          splitData: {
            method: 'item',
            items: [
              { id: 'x', price: 100, sharedBy: [A] },
              { id: 'y', price: 50, sharedBy: [B, C] },
            ],
          },
        }),
      ],
      MEM
    );
    const total = r.balances.reduce((s, b) => s + b.amount, 0);
    expect(total).toBeCloseTo(0, 2);
  });

  test('สมาชิกที่ยังไม่มีภาระ ต้องโผล่ในผลลัพธ์ด้วยยอด 0', () => {
    const r = calculateSettlement(
      [tx({ subtotal: 100, paidBy: A, splitData: { method: 'equal', memberIds: [A] } })],
      MEM
    );
    const bal = Object.fromEntries(r.balances.map((b) => [b.person, b.amount]));
    expect(bal[C]).toBe(0);
    expect(Object.keys(bal).sort()).toEqual([A, B, C].sort());
  });

  test('ไม่มีบิล -> คืนค่าว่าง ไม่ throw', () => {
    const r = calculateSettlement([], MEM);
    expect(r.balances.every((b) => b.amount === 0)).toBe(true);
    expect(r.transactions).toEqual([]);
  });

  test('split_data ที่เสีย -> ข้ามและรายงานใน skipped (ไม่ทำให้ทั้งกลุ่มพัง)', () => {
    const r = calculateSettlement(
      [
        tx({ subtotal: 100, paidBy: A, splitData: { method: 'percent', shares: { [A]: 30, [B]: 30 } } }),
        tx({ subtotal: 100, paidBy: A, splitData: { method: 'equal' } }),
      ],
      MEM
    );
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/100/);
    // บิลที่ใช้ได้ยังคิดต่อ
    expect(r.transactions.length).toBeGreaterThan(0);
  });

  test('บิลไม่มี paid_by -> ข้ามและรายงาน', () => {
    const r = calculateSettlement([tx({ subtotal: 100, paidBy: null })], MEM);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/paid_by/);
  });

  test('บิลรายได้ (income) -> ไม่เข้าสู่การหาร', () => {
    const r = calculateSettlement(
      [
        tx({ type: 'income', subtotal: 5000, paidBy: A }),
        tx({ subtotal: 100, paidBy: A, splitData: { method: 'equal' } }),
      ],
      MEM
    );
    expect(r.skipped.some((s) => s.reason === 'income')).toBe(true);
    // บิลหารเท่ากัน 100 จาก 3 คน จ่ายโดย A -> A ได้คืน 2/3 = 66.66
    const bal = Object.fromEntries(r.balances.map((b) => [b.person, b.amount]));
    expect(bal[A]).toBeCloseTo(66.66, 2);
    expect(bal[B]).toBeCloseTo(-33.33, 2);
  });

  test('บิลเก่าที่ split_data = null -> หารเท่ากันทั้งกลุ่ม (backward compatible)', () => {
    const r = calculateSettlement([tx({ subtotal: 300, paidBy: A })], MEM);
    const bal = Object.fromEntries(r.balances.map((b) => [b.person, b.amount]));
    expect(bal[B]).toBeCloseTo(-100, 2);
    expect(r.skipped).toHaveLength(0);
  });
});

describe('billSplitService.splitBillByMethod', () => {
  test('equal คืน members และ balances ที่สมดุล', () => {
    const r = splitBillByMethod({
      split: { method: 'equal' },
      paidBy: A,
      subtotal: 300,
      options: { groupMembers: MEM },
    });
    expect(r.method).toBe('equal');
    expect(r.members[A].total).toBeCloseTo(100, 2);
    expect(r.balances.reduce((s, b) => s + b.amount, 0)).toBeCloseTo(0, 2);
  });

  test('percent คิด SC/VAT แล้วค่อยหารตาม %', () => {
    const r = splitBillByMethod({
      split: { method: 'percent', shares: { [A]: 60, [B]: 40 } },
      paidBy: A,
      items: [{ id: 'x', price: 1000 }],
      scRate: 0.1,
      vatRate: 0.07,
      options: { groupMembers: [A, B] },
    });
    // ยอดรวม 1177
    expect(r.members[A].total).toBeCloseTo(706.2, 2);
    expect(r.members[B].total).toBeCloseTo(470.8, 2);
  });

  test('ไม่ระบุ paidBy -> throw', () => {
    expect(() => splitBillByMethod({ split: { method: 'equal' }, subtotal: 100 })).toThrow(
      /paidBy/
    );
  });

  test('ไม่ส่ง items และ subtotal -> throw', () => {
    expect(() =>
      splitBillByMethod({ split: { method: 'equal' }, paidBy: A, options: { groupMembers: [A] } })
    ).toThrow(/ยอดก่อนภาษี/);
  });

  test('splitByMethodAndSettle คืนรายการโอนเงินด้วย', () => {
    const r = splitByMethodAndSettle({
      split: { method: 'percent', shares: { [A]: 50, [B]: 50 } },
      paidBy: A,
      subtotal: 100,
      options: { groupMembers: [A, B] },
    });
    expect(r.transactions).toEqual([{ from: B, to: A, amount: 50 }]);
  });
});
