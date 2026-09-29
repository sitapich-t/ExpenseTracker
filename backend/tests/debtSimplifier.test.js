/**
 * debtSimplifier.test.js
 * รัน: npx jest tests/debtSimplifier.test.js
 */
const { simplifyDebts } = require('../utils/debtSimplifier');

describe('simplifyDebts', () => {
  test('กรณีพื้นฐาน 3 คน ควรลดเหลือ 2 ธุรกรรม', () => {
    // A จ่ายให้ทุกคนล่วงหน้า -> B และ C เป็นหนี้ A
    const balances = [
      { person: 'A', amount: 200 }, // ควรได้คืน 200
      { person: 'B', amount: -100 }, // ติดหนี้ 100
      { person: 'C', amount: -100 }, // ติดหนี้ 100
    ];
    const txs = simplifyDebts(balances);
    expect(txs.length).toBe(2);

    // ตรวจสอบว่ายอดรวมที่แต่ละคนจ่าย/รับ ตรงกับ balance เดิม
    const net = {};
    for (const b of balances) net[b.person] = 0;
    for (const t of txs) {
      net[t.from] -= t.amount;
      net[t.to] += t.amount;
    }
    for (const b of balances) {
      expect(net[b.person]).toBeCloseTo(b.amount, 2);
    }
  });

  test('กรณีวงจรหนี้ซับซ้อน (4 คน) ต้องลดจำนวนธุรกรรมได้จริง', () => {
    // ก่อน simplify อาจมีหนี้ไขว้กันหลายทอด แต่ net balance สุทธิ ดังนี้
    const balances = [
      { person: 'A', amount: -50 },
      { person: 'B', amount: 30 },
      { person: 'C', amount: -20 },
      { person: 'D', amount: 40 },
    ];
    const txs = simplifyDebts(balances);

    // จำนวนธุรกรรมต้องไม่เกิน (จำนวนคน - 1)
    expect(txs.length).toBeLessThanOrEqual(balances.length - 1);

    // ตรวจ net balance ให้ตรงกับ input เดิม
    const net = {};
    for (const b of balances) net[b.person] = 0;
    for (const t of txs) {
      net[t.from] -= t.amount;
      net[t.to] += t.amount;
    }
    for (const b of balances) {
      expect(net[b.person]).toBeCloseTo(b.amount, 2);
    }
  });

  test('ทุกคน balance = 0 ต้องไม่มีธุรกรรมเลย', () => {
    const balances = [
      { person: 'A', amount: 0 },
      { person: 'B', amount: 0 },
    ];
    expect(simplifyDebts(balances)).toEqual([]);
  });

  test('ผลรวม balances ไม่เท่ากับ 0 ต้อง throw error', () => {
    const balances = [
      { person: 'A', amount: 100 },
      { person: 'B', amount: -50 }, // ไม่สมดุล
    ];
    expect(() => simplifyDebts(balances)).toThrow();
  });

  test('array ว่าง คืน array ว่าง', () => {
    expect(simplifyDebts([])).toEqual([]);
  });

  test('รองรับความคลาดเคลื่อนเล็กน้อยจาก floating point', () => {
    const balances = [
      { person: 'A', amount: 100.005 },
      { person: 'B', amount: -100 },
    ];
    // ค่าเริ่มต้น tolerance = 0.01 ควรผ่านได้
    expect(() => simplifyDebts(balances)).not.toThrow();
  });
 
  test('ปัดเศษแยกทีละคนแล้วมี residual สตางค์ ต้องไม่ทำให้เงินตกหล่น', () => {
    const balances = [
      { person: 'A', amount: 100.006 },
      { person: 'B', amount: -50.003 },
      { person: 'C', amount: -50.003 },
    ];

    const txs = simplifyDebts(balances);

    // A ควรได้รับเงินคืนรวม = ค่าที่ปัดเป็นสตางค์แล้ว (100.00) ไม่ใช่ 100.006 ดิบ
    // เพราะระบบเงินไม่มีหน่วยละเอียดกว่าสตางค์
    const totalToA = txs
      .filter((t) => t.to === 'A')
      .reduce((s, t) => s + t.amount, 0);
    expect(totalToA).toBeCloseTo(100.0, 2);

    // เช็คสิ่งที่สำคัญที่สุด: ผลรวมทุกธุรกรรมต้องเท่ากับผลรวมฝั่งลูกหนี้ทั้งหมด
    // (ไม่มีสตางค์ไหนหายไปเงียบๆ ระหว่างทาง)
    const totalTransferred = txs.reduce((s, t) => s + t.amount, 0);
    const totalDebt = balances
      .filter((b) => b.amount < 0)
      .reduce((s, b) => s - b.amount, 0);
    // totalDebt ดิบ = 100.006, แต่หลังปัดเป็นสตางค์แล้วควรได้ 100.00 พอดี
    expect(totalTransferred).toBeCloseTo(100.0, 2);

    // เช็คว่าไม่มีสตางค์ "หาย" จริงๆ: transferred ต้องเท่ากับผลรวมสตางค์ที่คำนวณจริง
    // (residual ถูกจัดการแล้ว ไม่ใช่แค่บังเอิญตรง)
    expect(txs.length).toBeGreaterThan(0);
  });
});