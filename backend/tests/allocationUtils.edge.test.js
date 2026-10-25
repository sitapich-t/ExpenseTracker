// เทสต์กรณีขอบของ allocationUtils (เพิ่มจากเทสต์เดิม ไม่ได้แทนที่)
// ถ้า path ไม่ตรง ให้แก้บรรทัด require ให้เหมือนใน allocationUtils.test.js เดิม
const { distributeAmount, distributeSCVAT, toSatang, toBaht } = require('../utils/allocationUtils');

const sum = (xs) => xs.reduce((s, v) => s + v, 0);
const sat = (baht) => Math.round(baht * 100);

// ตัวสุ่มแบบกำหนด seed ให้ผลซ้ำได้ทุกครั้งที่รัน
function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('distributeAmount: กรณีขอบ', () => {
  test('ไม่มีน้ำหนัก/ไม่ใช่ array คืน []', () => {
    expect(distributeAmount(100, [])).toEqual([]);
    expect(distributeAmount(100, null)).toEqual([]);
  });

  test('หารไม่ลงตัว: เศษเท่ากันให้ index น้อยได้ก่อน', () => {
    expect(distributeAmount(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(distributeAmount(1, [1, 1, 1])).toEqual([1, 0, 0]);
    expect(distributeAmount(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });

  test('เศษมากสุดได้ก่อน (largest remainder)', () => {
    expect(distributeAmount(10, [1, 2])).toEqual([3, 7]);
  });

  test('ยอดเป็น 0 ได้ 0 ทุกคน', () => {
    expect(distributeAmount(0, [1, 2, 3])).toEqual([0, 0, 0]);
  });

  test('น้ำหนักเป็น 0 ทั้งหมด: แบ่งเท่ากัน ไม่หารด้วยศูนย์', () => {
    expect(distributeAmount(10, [0, 0, 0])).toEqual([4, 3, 3]);
  });

  test('รายการน้ำหนัก 0 ท่ามกลางรายการอื่น ไม่ได้ส่วนแบ่ง', () => {
    expect(distributeAmount(100, [0, 1, 1])).toEqual([0, 50, 50]);
    expect(distributeAmount(101, [0, 1, 1])).toEqual([0, 51, 50]);
  });

  test('รายการเดียวได้ทั้งหมด / สัดส่วนลงตัวพอดี', () => {
    expect(distributeAmount(12345, [7])).toEqual([12345]);
    expect(distributeAmount(600, [1, 2, 3])).toEqual([100, 200, 300]);
  });

  test('สุ่ม 1,000 ชุด: ผลรวมตรงยอดเป๊ะ และทุกส่วนเป็น floor หรือ ceil ของส่วนแบ่งจริง', () => {
    const rng = makeRng(42);
    for (let t = 0; t < 1000; t++) {
      const n = 1 + Math.floor(rng() * 10);
      const total = Math.floor(rng() * 1_000_000);
      const weights = Array.from({ length: n }, () =>
        rng() < 0.2 ? 0 : Math.floor(rng() * 100000)
      );
      weights[0] += 1; // กันกรณีน้ำหนักเป็น 0 ทั้งหมด
      const out = distributeAmount(total, weights);
      expect(sum(out)).toBe(total);
      const sw = sum(weights);
      out.forEach((v, i) => {
        const raw = (total * weights[i]) / sw;
        expect(v).toBeGreaterThanOrEqual(Math.floor(raw));
        expect(v).toBeLessThanOrEqual(Math.ceil(raw));
      });
    }
  });

  test('ยอดใหญ่ (หลักสิบล้านบาท) ผลรวมยังตรง', () => {
    const out = distributeAmount(1_000_000_000, [3, 7, 11, 13, 17, 19, 23]);
    expect(sum(out)).toBe(1_000_000_000);
  });
});

describe('distributeSCVAT: กรณีขอบ', () => {
  test('items ว่าง/ไม่ใช่ array ต้อง throw', () => {
    expect(() => distributeSCVAT([], 0.1, 0.07)).toThrow();
    expect(() => distributeSCVAT(null, 0.1, 0.07)).toThrow();
  });

  test('ตัวอย่างลงตัว: SC 10% + VAT 7% (VAT คิดจากราคา+SC)', () => {
    const { items, summary } = distributeSCVAT(
      [{ price: 100 }, { price: 200 }, { price: 300 }], 0.1, 0.07
    );
    expect(items.map((i) => i.total)).toEqual([117.7, 235.4, 353.1]);
    expect(summary).toEqual({ totalPrice: 600, totalSC: 60, totalVAT: 46.2, grandTotal: 706.2 });
  });

  test('vatBase = itemOnly: VAT คิดจากราคาสินค้าอย่างเดียว', () => {
    const { items, summary } = distributeSCVAT(
      [{ price: 100 }, { price: 200 }, { price: 300 }], 0.1, 0.07, { vatBase: 'itemOnly' }
    );
    expect(items.map((i) => i.vat)).toEqual([7, 14, 21]);
    expect(summary.totalVAT).toBe(42);
    expect(summary.grandTotal).toBe(702);
  });

  test('หารไม่ลงตัว: 33.33 x 3 ที่ SC 10% เศษ 1 สตางค์ไปที่รายการแรก', () => {
    const { items, summary } = distributeSCVAT(
      [{ price: 33.33 }, { price: 33.33 }, { price: 33.33 }], 0.1, 0
    );
    expect(items.map((i) => i.sc)).toEqual([3.34, 3.33, 3.33]);
    expect(summary.totalSC).toBe(10);
  });

  test('อัตรา 0 ทั้งคู่: ยอดรวมเท่าราคา', () => {
    const { items, summary } = distributeSCVAT([{ price: 10.5 }, { price: 20.25 }], 0, 0);
    expect(items.map((i) => i.total)).toEqual([10.5, 20.25]);
    expect(summary.grandTotal).toBe(30.75);
  });

  test('ราคาเป็น 0 ทุกรายการ: ไม่เป็น NaN', () => {
    const { items, summary } = distributeSCVAT([{ price: 0 }, { price: 0 }], 0.1, 0.07);
    expect(items.every((i) => i.total === 0)).toBe(true);
    expect(summary.grandTotal).toBe(0);
  });

  test('floating point: 0.1 + 0.2 ถูกปัดเป็น 0.30', () => {
    const { items } = distributeSCVAT([{ price: 0.1 + 0.2 }], 0, 0);
    expect(items[0].total).toBe(0.3);
    expect(toSatang(0.1 + 0.2)).toBe(30);
    expect(toBaht(1999)).toBe(19.99);
  });

  test('คงฟิลด์อื่นของรายการไว้ (เช่น id, name)', () => {
    const { items } = distributeSCVAT([{ id: 'a', name: 'ข้าว', price: 50 }], 0.1, 0.07);
    expect(items[0]).toMatchObject({ id: 'a', name: 'ข้าว' });
  });

  test('มีรายการส่วนลด (ราคาติดลบ): ผลรวมยังตรงกับยอดสรุป', () => {
    const { items, summary } = distributeSCVAT(
      [{ price: 100 }, { price: -33.33 }, { price: 45.5 }], 0.1, 0.07
    );
    expect(sum(items.map((i) => sat(i.sc)))).toBe(sat(summary.totalSC));
    expect(sum(items.map((i) => sat(i.vat)))).toBe(sat(summary.totalVAT));
    expect(sum(items.map((i) => sat(i.total)))).toBe(sat(summary.grandTotal));
  });

  test('สุ่ม 500 ตะกร้า: ผลรวม sc/vat/total ของรายการตรงกับยอดสรุปเป๊ะ (นับเป็นสตางค์)', () => {
    const rng = makeRng(7);
    for (let t = 0; t < 500; t++) {
      const n = 1 + Math.floor(rng() * 8);
      const items = Array.from({ length: n }, (_, k) => ({
        id: k,
        price: Math.round(rng() * 99999 + 1) / 100,
      }));
      const scRate = [0, 0.1, 0.15][Math.floor(rng() * 3)];
      const vatRate = [0, 0.07][Math.floor(rng() * 2)];
      const vatBase = rng() < 0.5 ? 'itemPlusSC' : 'itemOnly';
      const { items: out, summary } = distributeSCVAT(items, scRate, vatRate, { vatBase });

      expect(sum(out.map((i) => sat(i.sc)))).toBe(sat(summary.totalSC));
      expect(sum(out.map((i) => sat(i.vat)))).toBe(sat(summary.totalVAT));
      expect(sum(out.map((i) => sat(i.total)))).toBe(sat(summary.grandTotal));
      expect(sat(summary.grandTotal)).toBe(
        sat(summary.totalPrice) + sat(summary.totalSC) + sat(summary.totalVAT)
      );
    }
  });
});