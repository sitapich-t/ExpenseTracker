const { mergeItems } = require('../services/ocrMerge');

const item = (name, price, quantity = 1) => ({ name, price, quantity });

describe('mergeItems', () => {
  test('fills items found only by another OCR pass', () => {
    const best = { total: 100, items: [item('ข้าวผัด', 60)] };
    const other = { total: 100, items: [item('ข้าวผัด', 60), item('น้ำเปล่า', 20)] };

    expect(mergeItems([best, other])).toEqual([
      item('ข้าวผัด', 60),
      item('น้ำเปล่า', 20),
    ]);
  });

  test('keeps the max count instead of duplicating repeated lines', () => {
    const best = { total: 30, items: [item('น้ำเปล่า', 15), item('น้ำเปล่า', 15)] };
    const other = { total: 30, items: [item('น้ำเปล่า', 15), item('น้ำเปล่า', 15)] };

    expect(mergeItems([best, other])).toHaveLength(2);
  });

  test('adds an extra occurrence when another pass saw more of the same line', () => {
    const best = { total: 45, items: [item('น้ำเปล่า', 15)] };
    const other = { total: 45, items: [item('น้ำเปล่า', 15), item('น้ำเปล่า', 15), item('น้ำเปล่า', 15)] };

    expect(mergeItems([best, other])).toHaveLength(3);
  });

  test('does not let merged items exceed the parsed total', () => {
    const best = { total: 100, items: [item('ข้าวผัด', 60), item('น้ำเปล่า', 20)] };
    const other = { total: 100, items: [item('ข้าวผัด', 60), item('น้ำเปล่า', 20), item('ของหวาน', 50)] };

    const merged = mergeItems([best, other]);
    expect(merged).toHaveLength(2);
    expect(merged.reduce((s, it) => s + it.price, 0)).toBe(80);
  });

  test('unions everything when the total is unknown', () => {
    const best = { total: 0, items: [item('A', 10)] };
    const other = { total: 0, items: [item('B', 20)] };

    expect(mergeItems([best, other])).toHaveLength(2);
  });

  test('ignores invalid items and tolerates missing lists', () => {
    const best = { total: 0, items: [{ name: '', price: 10 }, { name: 'A', price: 0 }, null] };
    const other = { total: 0 };

    expect(mergeItems([best, other])).toEqual([]);
    expect(mergeItems([])).toEqual([]);
    expect(mergeItems(null)).toEqual([]);
  });
});
