/**
 * balanceCalculator.test.js
 * รัน: npx jest tests/balanceCalculator.test.js
 */
const { allocateToMembers } = require('../utils/allocationUtils');
const { calculateGroupBalances } = require('../utils/balanceCalculator');
const { simplifyDebts } = require('../utils/debtSimplifier');

describe('calculateGroupBalances', () => {
  test('บิลเดียว คนเดียวจ่ายแทนทุกคน ต้องได้ balance ถูกต้อง', () => {
    const bill = allocateToMembers(
      [{ id: 'item1', price: 300 }],
      { item1: ['alice', 'bob', 'charlie'] },
      0.10,
      0.07
    );

    const balances = calculateGroupBalances([
      { billId: 'bill1', paidBy: 'alice', members: bill.members },
    ]);

    // alice จ่ายเต็มบิล ควรได้ balance เป็นบวก (ได้คืนจาก bob กับ charlie)
    const aliceBalance = balances.find((b) => b.person === 'alice').amount;
    const bobBalance = balances.find((b) => b.person === 'bob').amount;
    const charlieBalance = balances.find((b) => b.person === 'charlie').amount;

    expect(aliceBalance).toBeGreaterThan(0);
    expect(bobBalance).toBeLessThan(0);
    expect(charlieBalance).toBeLessThan(0);

    // ผลรวม balance ทั้งกลุ่มต้อง = 0
    const total = balances.reduce((s, b) => s + b.amount, 0);
    expect(total).toBeCloseTo(0, 2);
  });

  test('หลายบิล หลายคนจ่ายสลับกัน ต้องรวม balance ข้ามบิลได้ถูกต้อง', () => {
    const bill1 = allocateToMembers(
      [{ id: 'item1', price: 290 }, { id: 'item2', price: 150 }],
      { item1: ['alice', 'bob'], item2: ['alice'] },
      0.10,
      0.07
    );

    const bill2 = allocateToMembers(
      [{ id: 'item1', price: 400 }],
      { item1: ['alice', 'bob', 'charlie'] },
      0.10,
      0.07
    );

    const balances = calculateGroupBalances([
      { billId: 'bill1', paidBy: 'alice', members: bill1.members },
      { billId: 'bill2', paidBy: 'bob', members: bill2.members },
    ]);

    const total = balances.reduce((s, b) => s + b.amount, 0);
    expect(total).toBeCloseTo(0, 2);

    // balances ที่ได้ ต้องส่งเข้า simplifyDebts ได้โดยไม่ throw
    expect(() => simplifyDebts(balances)).not.toThrow();
  });

  test('ไม่มี paidBy ต้อง throw error', () => {
    const bill = allocateToMembers(
      [{ id: 'item1', price: 100 }],
      { item1: ['alice'] },
      0,
      0
    );

    expect(() =>
      calculateGroupBalances([{ billId: 'bill1', members: bill.members }])
    ).toThrow();
  });

  test('ไม่มี members ต้อง throw error', () => {
    expect(() =>
      calculateGroupBalances([{ billId: 'bill1', paidBy: 'alice', members: {} }])
    ).toThrow();
  });

  test('array ว่าง คืน array ว่าง', () => {
    expect(calculateGroupBalances([])).toEqual([]);
  });

  test('คนจ่ายบิลเองคนเดียว (ไม่มีใครแชร์) balance ต้องเป็น 0', () => {
    const bill = allocateToMembers(
      [{ id: 'item1', price: 100 }],
      { item1: ['alice'] },
      0.10,
      0.07
    );

    const balances = calculateGroupBalances([
      { billId: 'bill1', paidBy: 'alice', members: bill.members },
    ]);

    const aliceBalance = balances.find((b) => b.person === 'alice').amount;
    expect(aliceBalance).toBeCloseTo(0, 2);
  });
});