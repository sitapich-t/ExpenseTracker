/**
 * allocationUtils.js
 * -------------------
 * Core algorithm สำหรับกระจาย Service Charge (SC) และ VAT ไปยังแต่ละ item
 * ใช้ Largest Remainder Method เพื่อให้ผลรวมหลังปัดเศษ "ตรงเป๊ะ" กับยอดรวมจริง
 *
 * หลักการ: คำนวณทุกอย่างเป็นหน่วยสตางค์ (integer) เพื่อเลี่ยงปัญหา floating point
 * แล้วค่อยแปลงกลับเป็นบาทตอนส่งผลลัพธ์
 */

/** แปลงบาท -> สตางค์ (integer) */
function toSatang(baht) {
  return Math.round(baht * 100);
}

/** แปลงสตางค์ -> บาท */
function toBaht(satang) {
  return satang / 100;
}

/**
 * กระจายจำนวนเงิน (หน่วยสตางค์, integer) ไปตามสัดส่วนน้ำหนัก (weights)
 * โดยรับประกันว่าผลรวมของค่าที่กระจายแล้ว เท่ากับ totalSatang เป๊ะ
 *
 * @param {number} totalSatang - ยอดรวมที่ต้องกระจาย (หน่วยสตางค์, integer)
 * @param {number[]} weights - น้ำหนักของแต่ละรายการ (เช่น ราคาแต่ละ item)
 * @returns {number[]} จำนวนสตางค์ที่แต่ละรายการได้รับ (integer array)
 */
function distributeAmount(totalSatang, weights) {
  const n = weights.length;
  if (n === 0) return [];

  const totalWeight = weights.reduce((s, w) => s + w, 0);

  // ถ้าน้ำหนักรวมเป็น 0 (เช่นทุก item ราคา 0) ให้กระจายเท่า ๆ กัน
  if (totalWeight === 0) {
    return distributeAmount(totalSatang, weights.map(() => 1));
  }

  // คำนวณสัดส่วนแบบ float ก่อน แล้วแยกเป็นส่วนเต็ม (floor) + เศษ (remainder)
  const raw = weights.map((w) => (totalSatang * w) / totalWeight);
  const floored = raw.map((r) => Math.floor(r));
  const remainders = raw.map((r, i) => ({ index: i, remainder: r - floored[i] }));

  let allocated = floored.reduce((s, v) => s + v, 0);
  let diff = totalSatang - allocated; // ส่วนต่างที่ยังต้องแจกเพิ่ม (เป็นจำนวนเต็มบวก)

  // เรียง remainder จากมากไปน้อย แล้วแจกทีละ 1 หน่วยให้ตัวที่ remainder เยอะสุดก่อน
  remainders.sort((a, b) => b.remainder - a.remainder);

  const result = [...floored];
  for (let i = 0; i < diff; i++) {
    const idx = remainders[i % n].index;
    result[idx] += 1;
  }

  return result;
}

/**
 * กระจาย SC และ VAT ไปยังแต่ละ item ตามสัดส่วนราคา
 *
 * @param {Array<{id: string|number, price: number}>} items - รายการสินค้า (ราคาหน่วยบาท)
 * @param {number} scRate - อัตรา Service Charge เช่น 0.10 = 10%
 * @param {number} vatRate - อัตรา VAT เช่น 0.07 = 7%
 * @param {Object} [options]
 * @param {'itemPlusSC'|'itemOnly'} [options.vatBase='itemPlusSC'] - ฐานคำนวณ VAT
 *        'itemPlusSC' = คิด VAT จาก (ราคา + SC) แบบมาตรฐานไทย
 *        'itemOnly'   = คิด VAT จากราคาสินค้าอย่างเดียว (ไม่รวม SC)
 * @returns {{items: Array, summary: Object}}
 */
function distributeSCVAT(items, scRate = 0, vatRate = 0, options = {}) {
  const { vatBase = 'itemPlusSC' } = options;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items ต้องเป็น array ที่มีอย่างน้อย 1 รายการ');
  }

  const priceSatang = items.map((it) => toSatang(it.price));
  const totalPriceSatang = priceSatang.reduce((s, v) => s + v, 0);

  // 1) คำนวณ SC รวม แล้วกระจายตามสัดส่วนราคา
  const totalSCSatang = Math.round(totalPriceSatang * scRate);
  const scPerItem = distributeAmount(totalSCSatang, priceSatang);

  // 2) กำหนดฐานคำนวณ VAT ต่อ item ตาม option
  const vatBaseSatang = priceSatang.map((price, i) =>
    vatBase === 'itemPlusSC' ? price + scPerItem[i] : price
  );
  const totalVATBaseSatang = vatBaseSatang.reduce((s, v) => s + v, 0);

  // 3) คำนวณ VAT รวม แล้วกระจายตามฐานที่เลือก
  const totalVATSatang = Math.round(totalVATBaseSatang * vatRate);
  const vatPerItem = distributeAmount(totalVATSatang, vatBaseSatang);

  // 4) ประกอบผลลัพธ์ต่อ item
  const resultItems = items.map((it, i) => ({
    id: it.id,
    price: toBaht(priceSatang[i]),
    sc: toBaht(scPerItem[i]),
    vat: toBaht(vatPerItem[i]),
    total: toBaht(priceSatang[i] + scPerItem[i] + vatPerItem[i]),
  }));

  const grandTotalSatang =
    totalPriceSatang + totalSCSatang + totalVATSatang;

  return {
    items: resultItems,
    summary: {
      totalPrice: toBaht(totalPriceSatang),
      totalSC: toBaht(totalSCSatang),
      totalVAT: toBaht(totalVATSatang),
      grandTotal: toBaht(grandTotalSatang),
    },
  };
}

module.exports = {
  toSatang,
  toBaht,
  distributeAmount,
  distributeSCVAT,
};