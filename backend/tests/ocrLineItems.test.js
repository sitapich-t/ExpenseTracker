const ocr = require('../services/ocrService');
const { extractLineItems } = ocr;

const lines = (...rows) => rows.join('\n');

describe('extractLineItems', () => {
  test('collects rows from mixed formats instead of stopping at the first match', () => {
    const text = lines(
      'ร้านทดสอบ',
      'ข้าวผัด 60.00',
      '2 น้ำเปล่า 30.00',
      'ชุดใหญ่  1  120.00  120.00',
      'โกโก้',
      '2 x 45.00',
      'รวมทั้งสิ้น 300.00'
    );

    expect(extractLineItems(text)).toEqual([
      { name: 'ข้าวผัด', quantity: 1, unitPrice: 60, price: 60 },
      { name: 'น้ำเปล่า', quantity: 2, unitPrice: 15, price: 30 },
      { name: 'ชุดใหญ่', quantity: 1, unitPrice: 120, price: 120 },
      { name: 'โกโก้', quantity: 2, unitPrice: 45, price: 90 },
    ]);
  });

  test('keeps simple rows even when a table row already matched', () => {
    const text = lines(
      'Food A 10.00',
      'Food B 1 20.00 20.00',
      'Food C 30.00',
      'Total 60.00'
    );

    expect(extractLineItems(text).map((it) => it.name)).toEqual(['Food A', 'Food B', 'Food C']);
  });

  test('orders items by their line number in the receipt', () => {
    const text = lines(
      'โกโก้',
      '2 x 45.00',
      'ข้าวผัด 60.00'
    );

    expect(extractLineItems(text).map((it) => it.name)).toEqual(['โกโก้', 'ข้าวผัด']);
  });

  test('parses quantity written after the item name', () => {
    const text = lines('น้ำเปล่า 2 ขวด 30.00', 'Total 30.00');

    expect(extractLineItems(text)).toEqual([
      { name: 'น้ำเปล่า', quantity: 2, unitPrice: 15, price: 30 },
    ]);
  });

  test('skips headers, metadata and totals', () => {
    const text = lines(
      'ใบเสร็จรับเงิน',
      'โทร 02-123-4567',
      'วันที่ 12/09/2026',
      'VAT 7% 7.00',
      'ข้าวผัด 60.00',
      'รวมทั้งสิ้น 67.00'
    );

    expect(extractLineItems(text).map((it) => it.name)).toEqual(['ข้าวผัด']);
  });

  test('supports a VAT marker after the price', () => {
    const text = lines('ข้าวผัด 60.00 V', 'Total 60.00');

    expect(extractLineItems(text)[0]).toMatchObject({ name: 'ข้าวผัด', price: 60 });
  });

  test('returns an empty list for empty input', () => {
    expect(extractLineItems('')).toEqual([]);
    expect(extractLineItems(null)).toEqual([]);
  });

  test('parseText fills items for a receipt', () => {
    const text = lines(
      'ใบเสร็จรับเงิน',
      'ร้านทดสอบ',
      'ข้าวผัด 60.00',
      'น้ำเปล่า 20.00',
      'รวมทั้งสิ้น 80.00'
    );

    const result = ocr.parseText(text);
    expect(result.documentType).toBe('receipt');
    expect(result.items.map((it) => it.name)).toEqual(['ข้าวผัด', 'น้ำเปล่า']);
  });
});
