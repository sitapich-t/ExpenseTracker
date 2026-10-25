/**
 * balanceCalculator.test.js
 * รัน: npx jest tests/balanceCalculator.test.js
 *
 * หมายเหตุ: ไม่มี allocateToMembers ในโค้ดจริง จึงสร้าง members จาก
 * distributeSCVAT + distributeAmount (ตัวเดียวกับที่ billSplitService ใช้)
 */
const {
  distributeSCVAT,
  distributeAmount,
  toSatang,
  toBaht,
} = require('../utils/allocationUtils');
const { calculateGroupBalances } = require('../utils/balanceCalculator');
const { simplifyDebts } = require('../utils/debtSimplifier');
const { splitBillForGroup } = require('../services/billSplitService');

/**
 * สร้าง members ในรูปที่ calculateGroupBalances ต้องการ: { memberId: { total } }
 * หารยอดสุทธิของแต่ละ item เท่าๆ กันระหว่างคนที่ assign (เหมือน billSplitService)
 */
function buildMembers(items, assignments, scRate, vatRate) {
  const { items: priced } = distributeSCVAT(items, scRate, vatRate);
  const satang = {};
  for (const it of priced) {
    const who = assignments[it.id];
    const shares = distributeAmount(
      toSatang(it.total),
      who.map(() => 1)
    );
    who.forEach((m, i) => {
      satang[m] = (satang[m] || 0) + shares[i];
    });
  }
  const members = {};
  for (const [m, s] of Object.entries(satang)) {
    members[m] = { total: toBaht(s) };
  }
  return members;
}

const amountOf = (balances, person) =>
  balances.find((b) => b.person === person).amount;

const sumSatang = (balances) =>
  balances.reduce((s, b) => s + toSatang(b.amount), 0);

describe('buildMembers (ตรวจ helper ด้วยค่าคำนวณมือ)', () => {
  test('300 บาท + SC 10% + VAT 7% = 353.10 หาร 3 คน = 117.70', () => {
    const members = buildMembers(
      [{ id: 'item1', price: 300 }],
      { item1: ['alice', 'bob', 'charlie'] },
      0.1,
      0.07
    );
    expect(members.alice.total).toBe(117.7);
    expect(members.bob.total).toBe(117.7);
    expect(members.charlie.total).toBe(117.7);
  });
});

describe('calculateGroupBalances', () => {
  test('บิลเดียว alice จ่ายแทนทุกคน → alice +235.40, bob/charlie −117.70', () => {
    const members = buildMembers(
      [{ id: 'item1', price: 300 }],
      { item1: ['alice', 'bob', 'charlie'] },
      0.1,
      0.07
    );

    const balances = calculateGroupBalances([
      { billId: 'bill1', paidBy: 'alice', members },
    ]);

    expect(amountOf(balances, 'alice')).toBe(235.4);
    expect(amountOf(balances, 'bob')).toBe(-117.7);
    expect(amountOf(balances, 'charlie')).toBe(-117.7);
    expect(sumSatang(balances)).toBe(0);
  });

  test('หลายบิล จ่ายสลับกัน → alice +13.72, bob +143.21, charlie −156.93', () => {
    // bill1: item1 341.33 หาร alice/bob = 170.67/170.66, item2 176.55 alice คนเดียว
    //        → alice 347.22, bob 170.66 (รวม 517.88)
    const members1 = buildMembers(
      [
        { id: 'item1', price: 290 },
        { id: 'item2', price: 150 },
      ],
      { item1: ['alice', 'bob'], item2: ['alice'] },
      0.1,
      0.07
    );
    expect(members1.alice.total).toBe(347.22);
    expect(members1.bob.total).toBe(170.66);

    // bill2: 470.80 หาร 3 → alice 156.94, bob 156.93, charlie 156.93
    const members2 = buildMembers(
      [{ id: 'item1', price: 400 }],
      { item1: ['alice', 'bob', 'charlie'] },
      0.1,
      0.07
    );
    expect(members2.alice.total).toBe(156.94);
    expect(members2.bob.total).toBe(156.93);
    expect(members2.charlie.total).toBe(156.93);

    const balances = calculateGroupBalances([
      { billId: 'bill1', paidBy: 'alice', members: members1 },
      { billId: 'bill2', paidBy: 'bob', members: members2 },
    ]);

    expect(amountOf(balances, 'alice')).toBe(13.72);
    expect(amountOf(balances, 'bob')).toBe(143.21);
    expect(amountOf(balances, 'charlie')).toBe(-156.93);
    expect(sumSatang(balances)).toBe(0);

    expect(() => simplifyDebts(balances)).not.toThrow();
  });

  test('ไม่มี paidBy ต้อง throw error', () => {
    const members = buildMembers(
      [{ id: 'item1', price: 100 }],
      { item1: ['alice'] },
      0,
      0
    );
    expect(() =>
      calculateGroupBalances([{ billId: 'bill1', members }])
    ).toThrow(/paidBy/);
  });

  test('ไม่มี members ต้อง throw error', () => {
    expect(() =>
      calculateGroupBalances([{ billId: 'bill1', paidBy: 'alice', members: {} }])
    ).toThrow(/members/);
  });

  test('array ว่าง คืน array ว่าง', () => {
    expect(calculateGroupBalances([])).toEqual([]);
  });

  test('คนจ่ายบิลเองคนเดียว (ไม่มีใครแชร์) balance ต้องเป็น 0', () => {
    const members = buildMembers(
      [{ id: 'item1', price: 100 }],
      { item1: ['alice'] },
      0.1,
      0.07
    );
    const balances = calculateGroupBalances([
      { billId: 'bill1', paidBy: 'alice', members },
    ]);
    expect(amountOf(balances, 'alice')).toBe(0);
  });
});

describe('ตรวจข้ามระบบ: calculateGroupBalances vs splitBillForGroup (ตัวที่ production ใช้)', () => {
  test('บิลเดียว 300 บาท ต้องได้ balance ตรงกัน', () => {
    const real = splitBillForGroup(
      [
        {
          id: 'item1',
          price: 300,
          paidBy: 'alice',
          sharedBy: ['alice', 'bob', 'charlie'],
        },
      ],
      0.1,
      0.07
    );

    const members = buildMembers(
      [{ id: 'item1', price: 300 }],
      { item1: ['alice', 'bob', 'charlie'] },
      0.1,
      0.07
    );
    const viaCalc = calculateGroupBalances([
      { billId: 'bill1', paidBy: 'alice', members },
    ]);

    for (const p of ['alice', 'bob', 'charlie']) {
      expect(amountOf(viaCalc, p)).toBe(amountOf(real.balances, p));
    }
    expect(real.summary.grandTotal).toBe(353.1);
  });

  test('bill1 (290 + 150, มีเศษสตางค์) ต้องได้ balance ตรงกัน', () => {
    const real = splitBillForGroup(
      [
        { id: 'item1', price: 290, paidBy: 'alice', sharedBy: ['alice', 'bob'] },
        { id: 'item2', price: 150, paidBy: 'alice', sharedBy: ['alice'] },
      ],
      0.1,
      0.07
    );

    const members = buildMembers(
      [
        { id: 'item1', price: 290 },
        { id: 'item2', price: 150 },
      ],
      { item1: ['alice', 'bob'], item2: ['alice'] },
      0.1,
      0.07
    );
    const viaCalc = calculateGroupBalances([
      { billId: 'bill1', paidBy: 'alice', members },
    ]);

    expect(real.summary.grandTotal).toBe(517.88);
    expect(amountOf(real.balances, 'alice')).toBe(170.66);
    expect(amountOf(real.balances, 'bob')).toBe(-170.66);
    expect(amountOf(viaCalc, 'alice')).toBe(amountOf(real.balances, 'alice'));
    expect(amountOf(viaCalc, 'bob')).toBe(amountOf(real.balances, 'bob'));
  });
});