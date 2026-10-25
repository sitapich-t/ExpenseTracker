/**
 * billSplitController.test.js
 * วางที่ backend/tests/  รัน: npx jest tests/billSplitController.test.js
 *
 * ทดสอบ handler ด้วย req/res จำลอง ใช้ billSplitService + allocationUtils + debtSimplifier จริง
 * กลุ่ม "validate input" คาดว่าล้มบางข้อกับโค้ดปัจจุบัน (ยังไม่มี validation) = ช่องโหว่ที่เจอ
 */
const {
  splitBill,
  previewBillSplit,
  simplifyDebtsHandler,
} = require('../controllers/billSplitController');
const { toSatang } = require('../utils/allocationUtils');

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

async function call(handler, body) {
  const res = mockRes();
  await handler({ body }, res);
  return {
    status: res.status.mock.calls[0][0],
    body: res.json.mock.calls[0][0],
  };
}

const amountOf = (balances, p) => balances.find((b) => b.person === p).amount;
const sumSatang = (balances) =>
  balances.reduce((s, b) => s + toSatang(b.amount), 0);

describe('splitBill / previewBillSplit: กรณีปกติ', () => {
  test('300 บาท SC10% VAT7% alice จ่ายแทน หาร 3 คน', async () => {
    const r = await call(splitBill, {
      items: [
        { id: 'a', price: 300, paidBy: 'alice', sharedBy: ['alice', 'bob', 'charlie'] },
      ],
      scRate: 0.1,
      vatRate: 0.07,
    });
    expect(r.status).toBe(200);
    expect(r.body.summary.grandTotal).toBe(353.1);
    expect(amountOf(r.body.balances, 'alice')).toBe(235.4);
    expect(amountOf(r.body.balances, 'bob')).toBe(-117.7);
    expect(amountOf(r.body.balances, 'charlie')).toBe(-117.7);
    expect(r.body.transactions).toHaveLength(2);
    for (const tx of r.body.transactions) {
      expect(tx.to).toBe('alice');
      expect(tx.amount).toBe(117.7);
    }
  });

  test('มีเศษสตางค์: 290 (alice/bob) + 150 (alice)', async () => {
    const r = await call(splitBill, {
      items: [
        { id: 'a', price: 290, paidBy: 'alice', sharedBy: ['alice', 'bob'] },
        { id: 'b', price: 150, paidBy: 'alice', sharedBy: ['alice'] },
      ],
      scRate: 0.1,
      vatRate: 0.07,
    });
    expect(r.status).toBe(200);
    expect(r.body.summary.grandTotal).toBe(517.88);
    expect(amountOf(r.body.balances, 'alice')).toBe(170.66);
    expect(amountOf(r.body.balances, 'bob')).toBe(-170.66);
  });

  test('preview ไม่มี transactions', async () => {
    const r = await call(previewBillSplit, {
      items: [{ id: 'a', price: 100, paidBy: 'alice', sharedBy: ['alice', 'bob'] }],
    });
    expect(r.status).toBe(200);
    expect(r.body.transactions).toBeUndefined();
    expect(amountOf(r.body.balances, 'alice')).toBe(50);
  });

  test('ไม่ระบุ sharedBy ใช้ groupMembers ทั้งหมด', async () => {
    const r = await call(splitBill, {
      items: [{ id: 'a', price: 100, paidBy: 'alice' }],
      groupMembers: ['alice', 'bob'],
    });
    expect(r.status).toBe(200);
    expect(amountOf(r.body.balances, 'alice')).toBe(50);
    expect(amountOf(r.body.balances, 'bob')).toBe(-50);
  });

  test('สุ่ม 300 รอบ: ผลรวม balance = 0 และโอนตาม transactions แล้วทุกคน = 0', async () => {
    let seed = 20261026;
    const rnd = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
    const people = ['p1', 'p2', 'p3', 'p4', 'p5'];
    const rates = [[0, 0], [0.1, 0.07], [0, 0.07], [0.1, 0]];

    for (let t = 0; t < 300; t++) {
      const [scRate, vatRate] = rates[Math.floor(rnd() * rates.length)];
      const n = 1 + Math.floor(rnd() * 5);
      const items = [];
      for (let i = 0; i < n; i++) {
        const sharedBy = people.filter(() => rnd() < 0.5);
        if (sharedBy.length === 0) sharedBy.push(people[Math.floor(rnd() * people.length)]);
        items.push({
          id: `i${i}`,
          price: (1 + Math.floor(rnd() * 199999)) / 100, // 0.01 - 1999.99
          paidBy: people[Math.floor(rnd() * people.length)],
          sharedBy,
        });
      }

      const r = await call(splitBill, { items, scRate, vatRate });
      expect(r.status).toBe(200);
      expect(sumSatang(r.body.balances)).toBe(0);

      const itemsSum = r.body.items.reduce((s, i) => s + toSatang(i.total), 0);
      expect(toSatang(r.body.summary.grandTotal)).toBe(itemsSum);

      const net = Object.fromEntries(
        r.body.balances.map((b) => [b.person, toSatang(b.amount)])
      );
      for (const tx of r.body.transactions) {
        net[tx.from] += toSatang(tx.amount);
        net[tx.to] -= toSatang(tx.amount);
      }
      for (const v of Object.values(net)) expect(v).toBe(0);
    }
  });
});

describe('validate input (คาดว่าล้มบางข้อ = ช่องโหว่)', () => {
  const base = () => ({
    items: [{ id: 'a', price: 100, paidBy: 'alice', sharedBy: ['alice', 'bob'] }],
    scRate: 0.1,
    vatRate: 0.07,
  });
  const withItem = (patch) => {
    const b = base();
    b.items[0] = { ...b.items[0], ...patch };
    return b;
  };

  test.each([
    ['price เป็นข้อความ', withItem({ price: '100' })],
    ['price เป็น null', withItem({ price: null })],
    ['price ติดลบ', withItem({ price: -5 })],
    ['price เป็น NaN', withItem({ price: NaN })],
    ['price เป็น Infinity', withItem({ price: Infinity })],
    ['sharedBy ซ้ำชื่อ', withItem({ sharedBy: ['alice', 'alice'] })],
    ['paidBy เป็นสตริงว่าง', withItem({ paidBy: '' })],
    ['scRate ติดลบ', { ...base(), scRate: -0.1 }],
    ['scRate มากกว่า 1', { ...base(), scRate: 1.5 }],
    ['vatRate เป็นสตริง', { ...base(), vatRate: '0.07' }],
    ['vatBase ไม่รู้จัก', { ...base(), vatBase: 'bogus' }],
    ['groupMembers ไม่ใช่ array', { ...base(), groupMembers: 'alice' }],
    [
      'id ของ item ซ้ำ',
      {
        ...base(),
        items: [
          { id: 'a', price: 10, paidBy: 'alice', sharedBy: ['alice'] },
          { id: 'a', price: 20, paidBy: 'alice', sharedBy: ['alice'] },
        ],
      },
    ],
  ])('%s → 400 (ทั้ง splitBill และ preview)', async (_n, body) => {
    for (const handler of [splitBill, previewBillSplit]) {
      const r = await call(handler, body);
      expect(r.status).toBe(400);
    }
  });

  test('items ว่าง → 400', async () => {
    expect((await call(splitBill, { items: [] })).status).toBe(400);
  });

  test('ไม่มี sharedBy และไม่มี groupMembers → 400', async () => {
    const r = await call(splitBill, {
      items: [{ id: 'a', price: 100, paidBy: 'alice' }],
    });
    expect(r.status).toBe(400);
  });
});

describe('simplifyDebtsHandler', () => {
  test('balances ผลรวมศูนย์ → 200 และยอดโอนรวมเท่ายอดที่ต้องได้คืน', async () => {
    const r = await call(simplifyDebtsHandler, {
      balances: [
        { person: 'alice', amount: 100 },
        { person: 'bob', amount: -60 },
        { person: 'charlie', amount: -40 },
      ],
    });
    expect(r.status).toBe(200);
    const total = r.body.transactions.reduce((s, t) => s + toSatang(t.amount), 0);
    expect(total).toBe(10000);
    for (const t of r.body.transactions) expect(t.to).toBe('alice');
  });

  test('ผลรวมไม่เป็นศูนย์ (คลาด 1 สตางค์) → 400', async () => {
    const r = await call(simplifyDebtsHandler, {
      balances: [
        { person: 'alice', amount: 0.01 },
        { person: 'bob', amount: 0 },
      ],
    });
    expect(r.status).toBe(400);
  });

  test('balances ว่าง → 400', async () => {
    expect((await call(simplifyDebtsHandler, { balances: [] })).status).toBe(400);
  });

  test('amount ไม่ใช่ตัวเลข → 400', async () => {
    const r = await call(simplifyDebtsHandler, {
      balances: [
        { person: 'alice', amount: 'x' },
        { person: 'bob', amount: -5 },
      ],
    });
    expect(r.status).toBe(400);
  });
});