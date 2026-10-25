// เทสต์กรณีขอบของ debtSimplifier (เพิ่มจากเทสต์เดิม ไม่ได้แทนที่)
// ถ้า path ไม่ตรง ให้แก้บรรทัด require ให้เหมือนใน debtSimplifier.test.js เดิม
const { simplifyDebts } = require('../utils/debtSimplifier');

const sat = (baht) => Math.round(baht * 100);

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ใช้ธุรกรรมกับยอดคงเหลือแล้วคืน net ของแต่ละคน (หน่วยสตางค์) หลังชำระ ควรเป็น 0 ทุกคน
function settle(balances, txs) {
  const net = new Map(balances.map((b) => [b.person, sat(b.amount)]));
  for (const t of txs) {
    net.set(t.from, net.get(t.from) + sat(t.amount)); // ลูกหนี้โอน: ติดลบน้อยลง
    net.set(t.to, net.get(t.to) - sat(t.amount)); // เจ้าหนี้รับ: ยอดค้างลดลง
  }
  return net;
}

describe('simplifyDebts: อินพุตผิดปกติ', () => {
  test('array ว่าง คืน []', () => {
    expect(simplifyDebts([])).toEqual([]);
  });

  test('ไม่ใช่ array ต้อง throw TypeError', () => {
    expect(() => simplifyDebts(null)).toThrow(TypeError);
    expect(() => simplifyDebts('x')).toThrow(TypeError);
    expect(() => simplifyDebts({})).toThrow(TypeError);
  });

  test('amount เป็น NaN หรือสตริง ต้อง throw TypeError', () => {
    expect(() => simplifyDebts([{ person: 'A', amount: NaN }])).toThrow(TypeError);
    expect(() => simplifyDebts([{ person: 'A', amount: '100' }])).toThrow(TypeError);
  });

  test('ผลรวมไม่เป็นศูนย์ ต้อง throw', () => {
    expect(() =>
      simplifyDebts([{ person: 'A', amount: 100 }, { person: 'B', amount: -90 }])
    ).toThrow(/ผลรวม balances ต้องเท่ากับ 0/);
  });

  test('ทุกคน balance เป็น 0 คืน []', () => {
    expect(simplifyDebts([{ person: 'A', amount: 0 }, { person: 'B', amount: 0 }])).toEqual([]);
  });

  test('ไม่แก้ค่าของ array อินพุต', () => {
    const input = [{ person: 'A', amount: 50 }, { person: 'B', amount: -50 }];
    const copy = JSON.parse(JSON.stringify(input));
    simplifyDebts(input);
    expect(input).toEqual(copy);
  });
});

describe('simplifyDebts: ผลลัพธ์พื้นฐาน', () => {
  test('สองคน', () => {
    expect(simplifyDebts([{ person: 'A', amount: 100 }, { person: 'B', amount: -100 }])).toEqual([
      { from: 'B', to: 'A', amount: 100 },
    ]);
  });

  test('หนี้ต่อกันเป็นทอด (A→B→C) รวมเหลือโอนครั้งเดียว', () => {
    const out = simplifyDebts([
      { person: 'A', amount: -100 },
      { person: 'B', amount: 0 },
      { person: 'C', amount: 100 },
    ]);
    expect(out).toEqual([{ from: 'A', to: 'C', amount: 100 }]);
  });

  test('สี่คน: จับคู่ลูกหนี้มากสุดกับเจ้าหนี้มากสุดก่อน', () => {
    const out = simplifyDebts([
      { person: 'A', amount: 50 },
      { person: 'B', amount: 30 },
      { person: 'C', amount: -20 },
      { person: 'D', amount: -60 },
    ]);
    expect(out).toEqual([
      { from: 'D', to: 'A', amount: 50 },
      { from: 'D', to: 'B', amount: 10 },
      { from: 'C', to: 'B', amount: 20 },
    ]);
  });

  test('floating point: 0.1 + 0.2 - 0.3 ยังคืนยอดถูก', () => {
    const out = simplifyDebts([
      { person: 'A', amount: 0.1 },
      { person: 'B', amount: 0.2 },
      { person: 'C', amount: -0.3 },
    ]);
    expect(out).toEqual([
      { from: 'C', to: 'B', amount: 0.2 },
      { from: 'C', to: 'A', amount: 0.1 },
    ]);
  });
});

describe('simplifyDebts: ยอดระดับ 1 สตางค์ (ต้องไม่หายเงียบๆ)', () => {
  test('หนี้ 0.01 บาท ต้องมีธุรกรรม', () => {
    const out = simplifyDebts([{ person: 'A', amount: 0.01 }, { person: 'B', amount: -0.01 }]);
    expect(out).toEqual([{ from: 'B', to: 'A', amount: 0.01 }]);
  });

  test('เศษคงเหลือ 1 สตางค์ระหว่างจับคู่ ต้องถูกโอนต่อ', () => {
    const balances = [
      { person: 'A', amount: 3.0 },
      { person: 'B', amount: 2.01 },
      { person: 'C', amount: -2.0 },
      { person: 'D', amount: -3.01 },
    ];
    const out = simplifyDebts(balances);
    for (const v of settle(balances, out).values()) expect(Math.abs(v)).toBe(0);
  });
});

describe('simplifyDebts: สุ่มตรวจคุณสมบัติ', () => {
  function randomGroup(rng, maxSatang) {
    const n = 2 + Math.floor(rng() * 7);
    const sats = Array.from({ length: n - 1 }, () => Math.round((rng() * 2 - 1) * maxSatang));
    sats.push(-sats.reduce((s, v) => s + v, 0));
    return sats.map((s, i) => ({ person: `P${i}`, amount: s / 100 }));
  }

  function check(balances, out) {
    expect(out.length).toBeLessThanOrEqual(Math.max(balances.length - 1, 0));
    for (const t of out) {
      expect(t.amount).toBeGreaterThan(0);
      expect(t.from).not.toBe(t.to);
    }
    for (const v of settle(balances, out).values()) expect(Math.abs(v)).toBe(0);
  }

  test('ยอดเล็ก (เศษสตางค์ชนกันบ่อย) 2,000 กลุ่ม: ทุกคนเคลียร์เป็น 0 และโอนไม่เกิน n-1 ครั้ง', () => {
    const rng = makeRng(2024);
    for (let t = 0; t < 2000; t++) {
      const g = randomGroup(rng, 300);
      check(g, simplifyDebts(g));
    }
  });

  test('ยอดทั่วไป (สูงสุด 10,000 บาท) 500 กลุ่ม', () => {
    const rng = makeRng(99);
    for (let t = 0; t < 500; t++) {
      const g = randomGroup(rng, 1_000_000);
      check(g, simplifyDebts(g));
    }
  });
});