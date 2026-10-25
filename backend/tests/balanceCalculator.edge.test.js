/**
 * balanceCalculator.edge.test.js
 * วางที่ backend/tests/  รัน: npx jest tests/balanceCalculator.edge.test.js
 *
 * เทสต์กรณีขอบเพิ่มเติมจาก balanceCalculator.test.js (ไม่ซ้ำของเดิม)
 * ใช้ members แบบกำหนดตัวเลขตรงๆ เพื่อตรวจด้วยมือได้ ไม่พึ่ง distributeAmount
 *
 * หมายเหตุ: กลุ่ม "ตรวจค่าไม่ถูกต้อง" คาดว่าจะล้มกับโค้ดปัจจุบัน
 * (calculateGroupBalances ยังไม่ validate share.total) เป็นบั๊กที่เจอ ไม่ใช่เทสต์ผิด
 */
const { toSatang } = require('../utils/allocationUtils');
const { calculateGroupBalances } = require('../utils/balanceCalculator');
const { simplifyDebts } = require('../utils/debtSimplifier');

const amountOf = (balances, person) => {
  const row = balances.find((b) => b.person === person);
  if (!row) throw new Error(`ไม่พบ ${person} ในผลลัพธ์`);
  return row.amount;
};
const sumSatang = (balances) =>
  balances.reduce((s, b) => s + toSatang(b.amount), 0);

const bill = (billId, paidBy, totals) => ({
  billId,
  paidBy,
  members: Object.fromEntries(
    Object.entries(totals).map(([k, v]) => [k, { total: v }])
  ),
});

describe('โครงสร้างบิล', () => {
  test('คนจ่ายไม่อยู่ใน members (จ่ายให้คนอื่นล้วน) → ได้คืนเต็มยอด', () => {
    const b = calculateGroupBalances([
      bill('b1', 'bob', { alice: 100, charlie: 50.5 }),
    ]);
    expect(amountOf(b, 'bob')).toBe(150.5);
    expect(amountOf(b, 'alice')).toBe(-100);
    expect(amountOf(b, 'charlie')).toBe(-50.5);
    expect(sumSatang(b)).toBe(0);
  });

  test('members มีแต่คนจ่ายคนเดียว → ทุกคนเป็น 0', () => {
    const b = calculateGroupBalances([bill('b1', 'alice', { alice: 80 })]);
    expect(b).toHaveLength(1);
    expect(amountOf(b, 'alice')).toBe(0);
  });

  test('คนเดียวจ่ายหลายบิล ยอดสะสมถูกต้อง', () => {
    const b = calculateGroupBalances([
      bill('b1', 'alice', { bob: 30.25 }),
      bill('b2', 'alice', { bob: 19.75 }),
    ]);
    expect(amountOf(b, 'alice')).toBe(50);
    expect(amountOf(b, 'bob')).toBe(-50);
  });

  test('จ่ายไขว้ยอดเท่ากัน หักล้างเป็น 0 และ simplifyDebts ไม่ throw', () => {
    const b = calculateGroupBalances([
      bill('b1', 'alice', { bob: 100 }),
      bill('b2', 'bob', { alice: 100 }),
    ]);
    expect(amountOf(b, 'alice')).toBe(0);
    expect(amountOf(b, 'bob')).toBe(0);
    expect(Object.is(amountOf(b, 'alice'), -0)).toBe(false);
    expect(Object.is(amountOf(b, 'bob'), -0)).toBe(false);
    expect(() => simplifyDebts(b)).not.toThrow();
  });
});

describe('ความแม่นยำตัวเลข', () => {
  test('0.1 + 0.2 ไม่เพี้ยนแบบ floating point', () => {
    const b = calculateGroupBalances([
      bill('b1', 'alice', { bob: 0.1, charlie: 0.2 }),
    ]);
    expect(amountOf(b, 'alice')).toBe(0.3);
    expect(amountOf(b, 'bob')).toBe(-0.1);
    expect(amountOf(b, 'charlie')).toBe(-0.2);
  });

  test('ยอด 1 สตางค์', () => {
    const b = calculateGroupBalances([bill('b1', 'alice', { bob: 0.01 })]);
    expect(amountOf(b, 'alice')).toBe(0.01);
    expect(amountOf(b, 'bob')).toBe(-0.01);
  });

  test('ยอดหลักล้านบาทยังเป็นศูนย์รวม', () => {
    const b = calculateGroupBalances([
      bill('b1', 'alice', { bob: 1234567.89, charlie: 7654321.11 }),
    ]);
    expect(amountOf(b, 'alice')).toBe(8888889);
    expect(sumSatang(b)).toBe(0);
  });

  test('ยอดติดลบ (ส่วนลด/คืนเงิน) ผลรวมยังเป็นศูนย์ และกลับทิศหนี้', () => {
    const b = calculateGroupBalances([bill('b1', 'alice', { bob: -10 })]);
    expect(amountOf(b, 'bob')).toBe(10);
    expect(amountOf(b, 'alice')).toBe(-10);
    expect(sumSatang(b)).toBe(0);
  });

  test('ยอดสมาชิกเป็น 0', () => {
    const b = calculateGroupBalances([
      bill('b1', 'alice', { bob: 0, charlie: 25 }),
    ]);
    expect(amountOf(b, 'bob')).toBe(0);
    expect(amountOf(b, 'alice')).toBe(25);
  });
});

describe('ตรวจค่าไม่ถูกต้อง (คาดว่าล้มกับโค้ดปัจจุบัน = บั๊ก)', () => {
  test.each([
    ['NaN', NaN],
    ['undefined', undefined],
    ['Infinity', Infinity],
  ])('share.total = %s ต้อง throw ไม่ปล่อย NaN เข้า balance', (_n, v) => {
    expect(() =>
      calculateGroupBalances([bill('b1', 'alice', { bob: v })])
    ).toThrow();
  });

  test('สมาชิกเป็น null ต้อง throw', () => {
    expect(() =>
      calculateGroupBalances([
        { billId: 'b1', paidBy: 'alice', members: { bob: null } },
      ])
    ).toThrow();
  });

  test('สมาชิกในลิสต์บิลเป็น null ต้อง throw', () => {
    expect(() => calculateGroupBalances([null])).toThrow();
  });

  test.todo('billId ซ้ำ ควรถูกตรวจจับ (ตอนนี้นับซ้ำเงียบๆ)');
});

describe('คุณสมบัติของฟังก์ชัน', () => {
  test('ไม่แก้ไข input (deep freeze)', () => {
    const bills = [
      bill('b1', 'alice', { alice: 10, bob: 20 }),
      bill('b2', 'bob', { alice: 5.5, bob: 5.5 }),
    ];
    bills.forEach((x) => {
      Object.values(x.members).forEach(Object.freeze);
      Object.freeze(x.members);
      Object.freeze(x);
    });
    Object.freeze(bills);
    expect(() => calculateGroupBalances(bills)).not.toThrow();
  });

  test('สลับลำดับบิลแล้วผลต่อคนเท่าเดิม', () => {
    const bills = [
      bill('b1', 'alice', { bob: 33.33, charlie: 66.67 }),
      bill('b2', 'bob', { alice: 12.34, charlie: 56.78 }),
      bill('b3', 'charlie', { alice: 9.99, bob: 0.01 }),
    ];
    const a = calculateGroupBalances(bills);
    const b = calculateGroupBalances([...bills].reverse());
    for (const p of ['alice', 'bob', 'charlie']) {
      expect(amountOf(a, p)).toBe(amountOf(b, p));
    }
  });

  test('สุ่ม 500 รอบ: ผลรวม = 0, ตรงกับ oracle, simplifyDebts ไม่ throw', () => {
    // PRNG แบบ seed คงที่ เพื่อให้ผลซ้ำได้
    let seed = 20261026;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const people = ['p1', 'p2', 'p3', 'p4', 'p5'];

    for (let t = 0; t < 500; t++) {
      const nBills = 1 + Math.floor(rnd() * 6);
      const bills = [];
      const oracle = {};
      people.forEach((p) => (oracle[p] = 0));

      for (let i = 0; i < nBills; i++) {
        const paidBy = people[Math.floor(rnd() * people.length)];
        const totals = {};
        for (const p of people) {
          if (rnd() < 0.6) totals[p] = Math.floor(rnd() * 500000) / 100; // 0.00-4999.99
        }
        if (Object.keys(totals).length === 0) totals.p1 = 1;
        bills.push(bill(`b${i}`, paidBy, totals));

        for (const [p, v] of Object.entries(totals)) {
          if (p === paidBy) continue;
          const s = Math.round(v * 100);
          oracle[p] -= s;
          oracle[paidBy] += s;
        }
      }

      const out = calculateGroupBalances(bills);
      expect(sumSatang(out)).toBe(0);
      for (const row of out) {
        expect(Number.isFinite(row.amount)).toBe(true);
        expect(toSatang(row.amount)).toBe(oracle[row.person]);
      }
      expect(() => simplifyDebts(out)).not.toThrow();
    }
  });
});

describe('input ระดับบนสุด', () => {
  test('ไม่ใช่ array คืน [] (พฤติกรรมปัจจุบัน)', () => {
    expect(calculateGroupBalances(null)).toEqual([]);
    expect(calculateGroupBalances(undefined)).toEqual([]);
  });

  test('paidBy เป็นสตริงว่าง ต้อง throw', () => {
    expect(() =>
      calculateGroupBalances([bill('b1', '', { bob: 10 })])
    ).toThrow(/paidBy/);
  });
});