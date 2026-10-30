const { applyPayments, calculateSettlement } = require('../utils/settlementCalculator');

describe('applyPayments — หักยอดที่ยืนยันรับเงินแล้ว', () => {
  test('ไม่มี payments คืน balances เดิม', () => {
    const balances = [{ person: 'A', amount: 100 }, { person: 'B', amount: -100 }];
    expect(applyPayments(balances, [])).toBe(balances);
  });

  test('จ่ายเต็มยอด -> ทุกคนเหลือ 0', () => {
    const out = applyPayments(
      [{ person: 'A', amount: 100 }, { person: 'B', amount: -100 }],
      [{ from_user: 'B', to_user: 'A', amount: 100 }]
    );
    expect(out).toEqual([{ person: 'A', amount: 0 }, { person: 'B', amount: 0 }]);
  });

  test('จ่ายบางส่วน + เศษสตางค์ ไม่เพี้ยน', () => {
    const out = applyPayments(
      [{ person: 'A', amount: 66.67 }, { person: 'B', amount: -33.33 }, { person: 'C', amount: -33.34 }],
      [{ from_user: 'B', to_user: 'A', amount: 33.33 }]
    );
    const map = Object.fromEntries(out.map((b) => [b.person, b.amount]));
    expect(map).toEqual({ A: 33.34, B: 0, C: -33.34 });
  });

  test('ข้าม payment ที่ยอด <= 0 หรือข้อมูลไม่ครบ', () => {
    const balances = [{ person: 'A', amount: 50 }, { person: 'B', amount: -50 }];
    const out = applyPayments(balances, [
      { from_user: 'B', to_user: 'A', amount: 0 },
      { from_user: null, to_user: 'A', amount: 10 },
    ]);
    expect(out).toEqual(balances);
  });
});

describe('calculateSettlement + payments', () => {
  const bill = {
    id: 't1',
    type: 'expense',
    subtotal: 300,
    amount: 300,
    paid_by: 'A',
    split_data: { method: 'equal', memberIds: ['A', 'B', 'C'] },
  };

  test('ไม่มี payments: B, C ต้องโอนให้ A คนละ 100', () => {
    const r = calculateSettlement([bill], ['A', 'B', 'C']);
    expect(r.transactions).toHaveLength(2);
    r.transactions.forEach((t) => {
      expect(t.to).toBe('A');
      expect(t.amount).toBeCloseTo(100, 2);
    });
  });

  test('A ยืนยันรับเงินจาก B แล้ว -> เหลือเฉพาะ C', () => {
    const r = calculateSettlement([bill], ['A', 'B', 'C'], [{ from_user: 'B', to_user: 'A', amount: 100 }]);
    expect(r.transactions).toEqual([{ from: 'C', to: 'A', amount: 100 }]);
  });

  test('ยืนยันครบทุกคน -> ไม่เหลือรายการโอน', () => {
    const r = calculateSettlement([bill], ['A', 'B', 'C'], [
      { from_user: 'B', to_user: 'A', amount: 100 },
      { from_user: 'C', to_user: 'A', amount: 100 },
    ]);
    expect(r.transactions).toEqual([]);
  });
});
