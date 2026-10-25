/**
 * allocationUtils.js
 * กระจายจำนวนเงิน (SC / VAT) ให้สมาชิกหรือรายการสินค้าตามสัดส่วนน้ำหนัก
 * โดยรับประกันว่าผลรวมหลังกระจายตรงกับยอดตั้งต้นเป๊ะ (ไม่มีเศษสตางค์หาย/เกิน)
 *
 * ใช้ Largest Remainder Method (Hare-Niemeyer):
 * 1) หาส่วนแบ่งตามสัดส่วนแบบทศนิยม แล้วปัดลง (floor) ทุกตัวก่อน
 * 2) ผลรวมที่ขาดไปจากยอดตั้งต้น (เศษ) จะถูกแจกให้ทีละ 1 หน่วย
 *    ไปยังรายการที่มีเศษทศนิยมมากที่สุดก่อน จนกว่าจะครบ
 */

/**
 * กระจายจำนวนเต็ม (หน่วยเล็กสุด เช่น สตางค์) ตามสัดส่วนน้ำหนัก
 * @param {number} totalAmount จำนวนเงินรวมที่ต้องกระจาย (ควรเป็นจำนวนเต็ม)
 * @param {number[]} weights น้ำหนักของแต่ละรายการ (>= 0)
 * @returns {number[]} จำนวนเงินของแต่ละรายการ ผลรวม = totalAmount เป๊ะ
 */
function distributeAmount(totalAmount, weights) {
  if (!Array.isArray(weights) || weights.length === 0) return [];

  const n = weights.length;
  let sumWeights = weights.reduce((s, w) => s + w, 0);

  // น้ำหนักทุกตัวเป็น 0 -> กระจายเท่า ๆ กันแทนที่จะหารด้วย 0
  const effectiveWeights = sumWeights === 0 ? weights.map(() => 1) : weights;
  sumWeights = sumWeights === 0 ? n : sumWeights;

  const rawShares = effectiveWeights.map((w) => (totalAmount * w) / sumWeights);
  const floors = rawShares.map((s) => Math.floor(s));
  let remainder = totalAmount - floors.reduce((s, v) => s + v, 0);

  // เรียงตามเศษทศนิยมมากไปน้อย (เท่ากันให้ index น้อยกว่าได้ก่อน) เพื่อแจกส่วนเกิน
  const order = rawShares
    .map((s, idx) => ({ idx, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.idx - b.idx);

  const result = [...floors];
  for (let k = 0; k < order.length && remainder > 0; k++) {
    result[order[k].idx] += 1;
    remainder -= 1;
  }

  return result;
}

const SATANG_PER_BAHT = 100;
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const toSatang = (baht) => Math.round(baht * SATANG_PER_BAHT);
const toBaht = (satang) => round2(satang / SATANG_PER_BAHT);

/**
 * กระจาย Service Charge (SC) และ VAT ให้แต่ละรายการ/สมาชิก ตามสัดส่วนราคา
 * คำนวณเป็นหน่วยสตางค์ภายใน (ผ่าน distributeAmount) เพื่อไม่ให้ผลรวมคลาดเคลื่อนจาก floating point
 *
 * @param {Array<{id: any, price: number}>} items รายการ (ราคาหน่วยบาท)
 * @param {number} scRate อัตรา Service Charge เช่น 0.1 = 10%
 * @param {number} vatRate อัตรา VAT เช่น 0.07 = 7%
 * @param {{vatBase?: 'itemPlusSC' | 'itemOnly'}} [options]
 *   vatBase 'itemPlusSC' (ค่าเริ่มต้น) = คิด VAT จาก (ราคา + SC)
 *   vatBase 'itemOnly' = คิด VAT จากราคาสินค้าอย่างเดียว ไม่รวม SC
 * @returns {{items: Array, summary: {totalPrice:number, totalSC:number, totalVAT:number, grandTotal:number}}}
 */
function distributeSCVAT(items, scRate, vatRate, options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items ต้องมีอย่างน้อย 1 รายการ');
  }
  const vatBase = options.vatBase || 'itemPlusSC';

  const priceSatangs = items.map((it) => toSatang(it.price));
  const totalPriceSatang = priceSatangs.reduce((s, v) => s + v, 0);

  // 1) กระจาย SC ตามสัดส่วนราคาของแต่ละรายการ
  const totalSCSatang = Math.round(totalPriceSatang * scRate);
  const scAllocations = distributeAmount(totalSCSatang, priceSatangs);

  // 2) หาฐานคำนวณ VAT ต่อรายการ ตาม vatBase ที่เลือก แล้วกระจาย VAT ตามฐานนั้น
  const vatBases = priceSatangs.map((p, idx) =>
    vatBase === 'itemOnly' ? p : p + scAllocations[idx]
  );
  const totalVATBaseSatang = vatBases.reduce((s, v) => s + v, 0);
  const totalVATSatang = Math.round(totalVATBaseSatang * vatRate);
  const vatAllocations = distributeAmount(totalVATSatang, vatBases);

  const resultItems = items.map((it, idx) => {
    const scSatang = scAllocations[idx];
    const vatSatang = vatAllocations[idx];
    const totalSatang = priceSatangs[idx] + scSatang + vatSatang;
    return {
      ...it,
      price: round2(it.price),
      sc: toBaht(scSatang),
      vat: toBaht(vatSatang),
      total: toBaht(totalSatang),
    };
  });

  const summary = {
    totalPrice: toBaht(totalPriceSatang),
    totalSC: toBaht(totalSCSatang),
    totalVAT: toBaht(totalVATSatang),
    grandTotal: toBaht(totalPriceSatang + totalSCSatang + totalVATSatang),
  };

  return { items: resultItems, summary };
}

module.exports = { distributeAmount, distributeSCVAT, toSatang, toBaht };