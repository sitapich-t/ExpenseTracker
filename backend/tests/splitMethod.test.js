/**
 * splitMethod.test.js
 * รัน: npx jest tests/splitMethod.test.js
 */
const { resolveSplit, validateSplit, SPLIT_METHODS } = require('../utils/splitMethod');
const { calculateGroupBalances } = require('../utils/balanceCalculator');
const { simplifyDebts } = require('../utils/debtSimplifier');

const A = 'alice';
const B = 'bob';
const C = 'charlie';

const sum = (obj, key) =>
  Object.values(obj).reduce((s, m) => s + m[key], 0);

describe('resolveSplit - โครงสร้างพื้นฐาน', () => {
  test('รองรับ 4 method ตามที่ประกาศไว้', () => {
    expect(SPLIT_METHODS).toEqual(['equal', 'percent', 'item', 'amount']);
  });

  test('ไม่ระบุ method -> default เป็น equal และหารทั้งกลุ่ม', () => {
    const r = resolveSplit({}, { subtotal: 300, memberIds: [A, B, C] });
    expect(r.method).toBe('equal');
    expect(r.participants).toEqual([A, B, C]);
    expect(r.members[A].total).toBeCloseTo(100, 2);
    expect(r.members[B].total).toBeCloseTo(100, 2);
    expect(r.members[C].total).toBeCloseTo(100, 2);
  });

  test('method ที่ไม่รองรับ -> throw', () => {
    expect(() => resolveSplit({ method: 'random' }, { subtotal: 100 })).toThrow(
      /ไม่รองรับ/
    );
  });

  test('เอกลักษณ์ price + sc + vat = total ของทุกคน ในทุก method', () => {
    const ctx = { subtotal: 999.99, scAmount: 100, vatAmount: 77, memberIds: [A, B, C] };
    const splits = [
      { method: 'equal' },
      { method: 'percent', shares: { [A]: 50, [B]: 30, [C]: 20 } },
      {
        method: 'item',
        items: [
          { id: 'i1', price: 600, sharedBy: [A, B] },
          { id: 'i2', price: 399.99, sharedBy: [C] },
        ],
      },
      { method: 'amount', amounts: { [A]: 500, [B]: 300, [C]: 376.99 } },
    ];

    for (const split of splits) {
      const { members } = resolveSplit(split, ctx);
      for (const [id, m] of Object.entries(members)) {
        expect(m.price + m.sc + m.vat).toBeCloseTo(m.total, 2);
        expect(m.total).toBeGreaterThanOrEqual(0);
        expect(id).toBeTruthy();
      }
      // ผลรวมต้องครบเท่ายอดเต็มพอดี
      expect(sum(members, 'total')).toBeCloseTo(999.99 + 100 + 77, 2);
    }
  });
});

describe('1) equal — หารเท่ากัน', () => {
  test('หารเท่ากันและผลรวมตรงเป๊ะ แม้หารไม่ลงตัว', () => {
    const r = resolveSplit(
      { method: 'equal', memberIds: [A, B, C] },
      { subtotal: 1000, scAmount: 100, vatAmount: 77 }
    );
    expect(sum(r.members, 'total')).toBeCloseTo(1177, 2);
    // 1000/3 = 333.33 x2 + 333.34 (สตางค์ที่เหลือตกไปคนที่มีส่วนเศษมากสุด)
    const totals = Object.values(r.members).map((m) => m.total);
    expect(Math.max(...totals) - Math.min(...totals)).toBeLessThanOrEqual(0.01);
  });

  test('memberIds ว่าง -> ใช้สมาชิกทั้งกลุ่ม', () => {
    const r = resolveSplit(
      { method: 'equal', memberIds: [] },
      { subtotal: 90, memberIds: [A, B, C] }
    );
    expect(r.participants).toEqual([A, B, C]);
  });

  test('ไม่มีสมาชิกเลย -> throw', () => {
    expect(() => resolveSplit({ method: 'equal' }, { subtotal: 100 })).toThrow(
      /ไม่พบสมาชิก/
    );
  });

  test('ตัดสมาชิกซ้ำออก', () => {
    const r = resolveSplit(
      { method: 'equal', memberIds: [A, A, B] },
      { subtotal: 100 }
    );
    expect(r.participants).toEqual([A, B]);
  });
});

describe('2) percent — หารตามเปอร์เซ็นต์', () => {
  test('แบ่งตามเปอร์เซ็นต์และรวมได้ 100%', () => {
    const r = resolveSplit(
      { method: 'percent', shares: { [A]: 50, [B]: 30, [C]: 20 } },
      { subtotal: 1000, scAmount: 0, vatAmount: 0 }
    );
    expect(r.members[A].total).toBeCloseTo(500, 2);
    expect(r.members[B].total).toBeCloseTo(300, 2);
    expect(r.members[C].total).toBeCloseTo(200, 2);
  });

  test('เปอร์เซ็นต์ที่ไม่ลงตัว (33.33 x3) ต้องไม่ทำให้สตางค์ตกหล่น', () => {
    const r = resolveSplit(
      { method: 'percent', shares: { [A]: 33.33, [B]: 33.33, [C]: 33.34 } },
      { subtotal: 1000, scAmount: 0, vatAmount: 0 }
    );
    expect(sum(r.members, 'total')).toBeCloseTo(1000, 2);
  });

  test('SC/VAT แบ่งตามสัดส่วนเปอร์เซ็นต์เดียวกัน', () => {
    const r = resolveSplit(
      { method: 'percent', shares: { [A]: 80, [B]: 20 } },
      { subtotal: 1000, scAmount: 100, vatAmount: 77 }
    );
    expect(r.members[A].sc).toBeCloseTo(80, 2);
    expect(r.members[B].sc).toBeCloseTo(20, 2);
    expect(sum(r.members, 'sc')).toBeCloseTo(100, 2);
    expect(sum(r.members, 'vat')).toBeCloseTo(77, 2);
  });

  test('เปอร์เซ็นต์รวม != 100 -> throw (ไม่ normalize เงียบ)', () => {
    expect(() =>
      resolveSplit(
        { method: 'percent', shares: { [A]: 30, [B]: 30 } },
        { subtotal: 100 }
      )
    ).toThrow(/ต้องเท่ากับ 100/);
  });

  test('เปอร์เซ็นต์เป็นลบ -> throw', () => {
    expect(() =>
      resolveSplit(
        { method: 'percent', shares: { [A]: 120, [B]: -20 } },
        { subtotal: 100 }
      )
    ).toThrow(/ไม่ถูกต้อง/);
  });

  test('คนที่ 0% ได้ 0 บาท (ข้อมูลถูกต้อง ไม่ error)', () => {
    const r = resolveSplit(
      { method: 'percent', shares: { [A]: 100, [B]: 0 } },
      { subtotal: 500 }
    );
    expect(r.members[B].total).toBeCloseTo(0, 2);
    expect(sum(r.members, 'total')).toBeCloseTo(500, 2);
  });

  test('ไม่มี shares -> throw', () => {
    expect(() => resolveSplit({ method: 'percent' }, { subtotal: 100 })).toThrow(
      /shares/
    );
  });
});

describe('3a) item — sub-group แบบ item-based', () => {
  test('แต่ละคนได้เฉพาะของที่ตัวเองกิน', () => {
    const r = resolveSplit(
      {
        method: 'item',
        items: [
          { id: 'ข้าว', price: 250, sharedBy: [A] },
          { id: 'ก๋วยเตี๋ยว', price: 150, sharedBy: [A, B] },
        ],
      },
      { subtotal: 400, scAmount: 0, vatAmount: 0 }
    );
    // A: 250 + 75 = 325, B: 75
    expect(r.members[A].total).toBeCloseTo(325, 2);
    expect(r.members[B].total).toBeCloseTo(75, 2);
    expect(r.members[C]).toBeUndefined();
  });

  test('item ที่หารหลายคน -> แบ่งเท่ากันภายใน item', () => {
    const r = resolveSplit(
      {
        method: 'item',
        items: [{ id: 'pizza', price: 300, sharedBy: [A, B, C] }],
      },
      { subtotal: 300, scAmount: 0, vatAmount: 0 }
    );
    expect(r.members[A].total).toBeCloseTo(100, 2);
    expect(r.members[B].total).toBeCloseTo(100, 2);
    expect(r.members[C].total).toBeCloseTo(100, 2);
  });

  test('SC/VAT แบ่งตามมูลค่าสินค้าที่แต่ละคนกิน', () => {
    const r = resolveSplit(
      {
        method: 'item',
        items: [
          { id: 'กุ้ง', price: 900, sharedBy: [A] },
          { id: 'ผัก', price: 100, sharedBy: [B] },
        ],
      },
      { subtotal: 1000, scAmount: 100, vatAmount: 70 }
    );
    // ยอดรวมทั้งบิล = 1000 + 100 + 70 = 1170
    // A กินของ 900/1000 -> 1053, B กินของ 100/1000 -> 117
    expect(r.members[A].total).toBeCloseTo(1053, 2);
    expect(r.members[B].total).toBeCloseTo(117, 2);
    expect(sum(r.members, 'total')).toBeCloseTo(1170, 2);
    expect(sum(r.members, 'sc')).toBeCloseTo(100, 2);
  });

  test('ผลรวมราคาสินค้าไม่ตรงกับยอดก่อนภาษี -> throw', () => {
    expect(() =>
      resolveSplit(
        { method: 'item', items: [{ id: 'x', price: 100, sharedBy: [A] }] },
        { subtotal: 200 }
      )
    ).toThrow(/ต้องตรงกับยอดก่อนภาษี/);
  });

  test('item ไม่มี sharedBy -> throw', () => {
    expect(() =>
      resolveSplit(
        { method: 'item', items: [{ id: 'x', price: 100 }] },
        { subtotal: 100 }
      )
    ).toThrow(/sharedBy/);
  });

  test('item ไม่มี id -> ตั้งชื่อให้อัตโนมัติ', () => {
    const r = resolveSplit(
      { method: 'item', items: [{ price: 100, sharedBy: [A] }] },
      { subtotal: 100 }
    );
    expect(r.items[0].id).toBe('item_0');
  });

  test('items ว่าง -> throw', () => {
    expect(() =>
      resolveSplit({ method: 'item', items: [] }, { subtotal: 100 })
    ).toThrow(/items/);
  });
});

describe('3b) amount — sub-group แบบ amount-based', () => {
  test('ได้ยอดตายตัวตามที่กรอกทุกคน', () => {
    const r = resolveSplit(
      { method: 'amount', amounts: { [A]: 120, [B]: 80 } },
      { subtotal: 200, scAmount: 0, vatAmount: 0 }
    );
    expect(r.members[A].total).toBeCloseTo(120, 2);
    expect(r.members[B].total).toBeCloseTo(80, 2);
  });

  test('ครอบคลุมยอดรวมรวม SC/VAT แล้ว', () => {
    const r = resolveSplit(
      { method: 'amount', amounts: { [A]: 600, [B]: 577 } },
      { subtotal: 1000, scAmount: 100, vatAmount: 77 }
    );
    expect(r.members[A].total).toBeCloseTo(600, 2);
    expect(r.members[B].total).toBeCloseTo(577, 2);
    expect(sum(r.members, 'price')).toBeCloseTo(1000, 2);
    expect(sum(r.members, 'sc')).toBeCloseTo(100, 2);
    expect(sum(r.members, 'vat')).toBeCloseTo(77, 2);
  });

  test('ผลรวมยอดที่กรอก != ยอดบิล -> throw', () => {
    expect(() =>
      resolveSplit(
        { method: 'amount', amounts: { [A]: 100, [B]: 50 } },
        { subtotal: 200 }
      )
    ).toThrow(/ต้องเท่ากับยอดรวมทั้งบิล/);
  });

  test('ยอดติดลบ -> throw', () => {
    expect(() =>
      resolveSplit(
        { method: 'amount', amounts: { [A]: -50, [B]: 250 } },
        { subtotal: 200 }
      )
    ).toThrow(/ต้องไม่ติดลบ/);
  });

  test('ไม่มี amounts -> throw', () => {
    expect(() => resolveSplit({ method: 'amount' }, { subtotal: 100 })).toThrow(
      /amounts/
    );
  });
});

describe('validateSplit — ใช้ตอนบันทึกบิล', () => {
  test('config ถูกต้อง -> ok:true', () => {
    const v = validateSplit(
      { method: 'percent', shares: { [A]: 50, [B]: 50 } },
      { subtotal: 100 }
    );
    expect(v.ok).toBe(true);
    expect(v.result.members[A].total).toBeCloseTo(50, 2);
  });

  test('config ผิด -> ok:false พร้อมข้อความ ไม่ throw', () => {
    const v = validateSplit(
      { method: 'percent', shares: { [A]: 30, [B]: 30 } },
      { subtotal: 100 }
    );
    expect(v.ok).toBe(false);
    expect(typeof v.error).toBe('string');
    expect(v.error).toMatch(/100/);
  });
});

describe('เข้ากับ balanceCalculator + debtSimplifier ได้', () => {
  test('percent: คนที่จ่ายเงินได้คืนส่วนที่คนอื่นเป็นหนี้', () => {
    const split = { method: 'percent', shares: { [A]: 50, [B]: 50 } };
    const { members } = resolveSplit(split, { subtotal: 1000 });
    const balances = calculateGroupBalances([
      { billId: 'b1', paidBy: A, members },
    ]);

    expect(balances.find((b) => b.person === A).amount).toBeCloseTo(500, 2);
    expect(balances.find((b) => b.person === B).amount).toBeCloseTo(-500, 2);
    expect(sum(balances.map((b) => ({ total: b.amount })), 'total')).toBeCloseTo(0, 2);
  });

  test('item: รวมหลายบิลแล้วตัดหนี้ได้', () => {
    const b1 = resolveSplit(
      {
        method: 'item',
        items: [
          { id: 'i1', price: 600, sharedBy: [A, B] },
          { id: 'i2', price: 400, sharedBy: [B] },
        ],
      },
      { subtotal: 1000 }
    );
    const b2 = resolveSplit(
      { method: 'amount', amounts: { [A]: 200, [B]: 300 } },
      { subtotal: 500 }
    );

    const balances = calculateGroupBalances([
      { billId: 'b1', paidBy: A, members: b1.members },
      { billId: 'b2', paidBy: B, members: b2.members },
    ]);

    expect(() => simplifyDebts(balances)).not.toThrow();
    // A จ่าย 1000 (เหลือที่ต้องรับคืน 500), B จ่าย 500 (ต้องจ่าย 1000) -> B ต้องโอนให้ A
    const txs = simplifyDebts(balances);
    expect(txs).toHaveLength(1);
    expect(txs[0].from).toBe(B);
    expect(txs[0].to).toBe(A);
    expect(txs[0].amount).toBeCloseTo(500, 2);
  });

  test('ผสม 3 method ในกลุ่มเดียว แล้วคิดยอดรวมยังสมดุล', () => {
    const bills = [
      { split: { method: 'equal' }, subtotal: 300 },
      { split: { method: 'percent', shares: { [A]: 70, [B]: 30 } }, subtotal: 200 },
      {
        split: {
          method: 'item',
          items: [
            { id: 'x', price: 100, sharedBy: [B] },
            { id: 'y', price: 50, sharedBy: [C] },
          ],
        },
        subtotal: 150,
      },
    ].map(({ split, subtotal }, i) => {
      const { members } = resolveSplit(split, { subtotal, memberIds: [A, B, C] });
      return { billId: `b${i}`, paidBy: A, members };
    });

    const balances = calculateGroupBalances(bills);
    const total = balances.reduce((s, b) => s + b.amount, 0);
    expect(total).toBeCloseTo(0, 2);
    expect(() => simplifyDebts(balances)).not.toThrow();
  });
});
