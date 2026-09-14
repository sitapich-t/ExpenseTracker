/**
 * allocationUtils.test.js
 * รัน: npx jest tests/allocationUtils.test.js
 */
const { distributeAmount, distributeSCVAT } = require('../utils/allocationUtils');

describe('distributeAmount (Largest Remainder Method)', () => {
  test('กระจายลงตัวพอดี', () => {
    const result = distributeAmount(1000, [1, 1, 1, 1]); // 250 x 4
    expect(result).toEqual([250, 250, 250, 250]);
    expect(result.reduce((s, v) => s + v, 0)).toBe(1000);
  });

  test('กระจายไม่ลงตัว ต้องได้ผลรวมตรงเป๊ะ', () => {
    const result = distributeAmount(1000, [1, 1, 1]); // 333.33 x 3
    expect(result.reduce((s, v) => s + v, 0)).toBe(1000);
    // ผลต่างระหว่างค่ามากสุด-น้อยสุด ต้องไม่เกิน 1 สตางค์
    expect(Math.max(...result) - Math.min(...result)).toBeLessThanOrEqual(1);
  });

  test('น้ำหนักไม่เท่ากัน ต้องกระจายตามสัดส่วน', () => {
    const result = distributeAmount(300, [1, 2, 3]); // 50, 100, 150
    expect(result).toEqual([50, 100, 150]);
  });

  test('น้ำหนักเป็น 0 ทั้งหมด ต้องกระจายเท่า ๆ กันแทนที่จะพัง', () => {
    const result = distributeAmount(900, [0, 0, 0]);
    expect(result).toEqual([300, 300, 300]);
  });

  test('array ว่าง คืน array ว่าง', () => {
    expect(distributeAmount(1000, [])).toEqual([]);
  });
});

describe('distributeSCVAT', () => {
  test('กรณีพื้นฐาน: SC 10%, VAT 7%, คิด VAT จาก (ราคา+SC)', () => {
    const items = [
      { id: 1, price: 100 },
      { id: 2, price: 200 },
    ];
    const result = distributeSCVAT(items, 0.1, 0.07);

    // ผลรวมราคาต้องตรง
    const sumPrice = result.items.reduce((s, it) => s + it.price, 0);
    expect(sumPrice).toBeCloseTo(300, 2);

    // grandTotal ต้องเท่ากับ summary
    const sumTotal = result.items.reduce((s, it) => s + it.total, 0);
    expect(sumTotal).toBeCloseTo(result.summary.grandTotal, 2);

    // SC รวมต้องเท่ากับ 300 * 10% = 30
    expect(result.summary.totalSC).toBeCloseTo(30, 2);

    // VAT รวมต้องคิดจาก (300+30) * 7% = 23.10
    expect(result.summary.totalVAT).toBeCloseTo(23.1, 2);
  });

  test('เศษสตางค์กระจายไม่ลงตัว ผลรวมต้องตรงเป๊ะเสมอ', () => {
    const items = [
      { id: 1, price: 33.33 },
      { id: 2, price: 33.33 },
      { id: 3, price: 33.34 },
    ];
    const result = distributeSCVAT(items, 0.1, 0.07);
    const sumTotal = result.items.reduce((s, it) => s + it.total, 0);
    expect(sumTotal).toBeCloseTo(result.summary.grandTotal, 2);
  });

  test('vatBase = itemOnly ต้องไม่เอา SC มารวมก่อนคิด VAT', () => {
    const items = [{ id: 1, price: 100 }];
    const result = distributeSCVAT(items, 0.1, 0.07, { vatBase: 'itemOnly' });
    // VAT = 100 * 7% = 7 (ไม่รวม SC)
    expect(result.summary.totalVAT).toBeCloseTo(7, 2);
  });

  test('item ราคา 0 ไม่ควรทำให้พัง', () => {
    const items = [
      { id: 1, price: 0 },
      { id: 2, price: 100 },
    ];
    const result = distributeSCVAT(items, 0.1, 0.07);
    expect(result.items[0].sc).toBe(0);
    expect(result.items[0].vat).toBe(0);
  });

  test('items ว่างต้อง throw error', () => {
    expect(() => distributeSCVAT([], 0.1, 0.07)).toThrow();
  });
});