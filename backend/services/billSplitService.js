/**
 * billSplitService.js
 * --------------------
 * Business logic layer ที่รวม 2 core algorithm เข้าด้วยกัน:
 *   1. allocationUtils   -> กระจาย SC/VAT ไปยังแต่ละ item
 *   2. debtSimplifier    -> ลดจำนวนธุรกรรมการโอนเงินระหว่างสมาชิกกลุ่ม
 *
 * Flow การทำงาน (ตัวอย่าง use case: หารบิลร้านอาหารในกลุ่ม)
 *   items (แต่ละคนสั่งอะไร ใครจ่าย) --> กระจาย SC/VAT ต่อ item
 *        --> หารราคาสุทธิของแต่ละ item ไปยังคนที่ "กินด้วยกัน" (sharedBy)
 *        --> รวมเป็น net balance ต่อคน (จ่ายไปเท่าไหร่ - ควรจ่ายเท่าไหร่)
 *        --> ส่งเข้า debtSimplifier เพื่อลดจำนวนธุรกรรมการโอนคืน
 */

const { toSatang, toBaht, distributeAmount, distributeSCVAT } = require('../utils/allocationUtils');
const { simplifyDebts } = require('../utils/debtSimplifier');

const VAT_BASES = ['itemPlusSC', 'itemOnly'];

/**
 * ตรวจ input ของ splitBillForGroup ก่อนคำนวณ (ทุกคนที่เรียก service ได้รับการป้องกัน)
 * ข้อสมมติ: items เป็น array ที่ไม่ว่างแล้ว (ตรวจก่อนเรียกฟังก์ชันนี้)
 * การตัดสินใจ: ราคาติดลบ/ราคาเป็นข้อความ/ชื่อซ้ำใน sharedBy ถือเป็นข้อผิดพลาด
 */
function assertValidSplitInput(items, scRate, vatRate, groupMembers, vatBase) {
  const isRate = (r) => typeof r === 'number' && Number.isFinite(r) && r >= 0 && r <= 1;
  if (!isRate(scRate) || !isRate(vatRate)) {
    throw new Error('scRate และ vatRate ต้องเป็นตัวเลขระหว่าง 0 ถึง 1');
  }
  if (!VAT_BASES.includes(vatBase)) {
    throw new Error(`vatBase ต้องเป็น ${VAT_BASES.join(' หรือ ')}`);
  }
  if (!Array.isArray(groupMembers)) {
    throw new Error('groupMembers ต้องเป็น array');
  }
  const seen = new Set();
  items.forEach((it, i) => {
    if (!it || typeof it !== 'object') throw new Error(`items[${i}] ไม่ถูกต้อง`);
    if (seen.has(it.id)) throw new Error(`item id=${it.id} ซ้ำ`);
    seen.add(it.id);
    if (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price < 0) {
      throw new Error(`item id=${it.id} ราคาต้องเป็นตัวเลขที่ไม่ติดลบ`);
    }
    if (Array.isArray(it.sharedBy) && new Set(it.sharedBy).size !== it.sharedBy.length) {
      throw new Error(`item id=${it.id} มีชื่อซ้ำใน sharedBy`);
    }
  });
}

/**
 * หารบิลของกลุ่ม: กระจาย SC/VAT ต่อ item แล้วคำนวณ net balance ของแต่ละคน
 *
 * @param {Array} items - รายการอาหาร/สินค้าที่สั่ง
 *        แต่ละ item ต้องมี:
 *          - id: string|number
 *          - price: number (ราคาก่อน SC/VAT หน่วยบาท)
 *          - paidBy: string  (personId ของคนที่จ่ายเงินค่า item นี้ล่วงหน้า)
 *          - sharedBy: string[] (personId ของคนที่ร่วมกินรายการนี้)
 *                       ถ้าไม่ระบุ จะใช้ groupMembers ทั้งหมดแทน (หารเท่ากันทุกคน)
 * @param {number} scRate - อัตรา Service Charge เช่น 0.10
 * @param {number} vatRate - อัตรา VAT เช่น 0.07
 * @param {Object} options
 * @param {string[]} [options.groupMembers] - รายชื่อสมาชิกทั้งหมดในกลุ่ม
 *        ใช้เป็นค่า default ของ sharedBy และเพื่อให้คนที่ balance = 0 ยังโผล่ในผลลัพธ์
 * @param {'itemPlusSC'|'itemOnly'} [options.vatBase='itemPlusSC']
 *
 * @returns {{
 *   items: Array,               // รายละเอียดต่อ item (price, sc, vat, total)
 *   summary: Object,            // ยอดรวมทั้งบิล
 *   balances: Array<{person: string, amount: number}>, // net balance ต่อคน (บาท)
 * }}
 */
function splitBillForGroup(items, scRate = 0, vatRate = 0, options = {}) {
  const { groupMembers = [], vatBase = 'itemPlusSC' } = options;

  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('items ต้องเป็น array ที่มีอย่างน้อย 1 รายการ');
  }

  assertValidSplitInput(items, scRate, vatRate, groupMembers, vatBase);

  // 1) กระจาย SC/VAT ต่อ item ด้วย core algorithm เดิม
  const basePricing = items.map((it) => ({ id: it.id, price: it.price }));
  const { items: pricedItems, summary } = distributeSCVAT(basePricing, scRate, vatRate, {
    vatBase,
  });

  // 2) เตรียม map เก็บยอด "จ่ายไปแล้ว" (paid) และ "ควรจ่าย" (owed) ต่อคน หน่วยสตางค์
  const paidSatang = {};
  const owedSatang = {};
  const initPerson = (personId) => {
    if (!(personId in paidSatang)) paidSatang[personId] = 0;
    if (!(personId in owedSatang)) owedSatang[personId] = 0;
  };
  groupMembers.forEach(initPerson);

  const detailedItems = items.map((orig, idx) => {
    const priced = pricedItems[idx]; // { id, price, sc, vat, total }
    const sharedBy =
      Array.isArray(orig.sharedBy) && orig.sharedBy.length > 0
        ? orig.sharedBy
        : groupMembers;

    if (!orig.paidBy) {
      throw new Error(`item id=${orig.id} ต้องระบุ paidBy (คนที่จ่ายเงินล่วงหน้า)`);
    }
    if (!sharedBy || sharedBy.length === 0) {
      throw new Error(
        `item id=${orig.id} ไม่มี sharedBy และไม่มี groupMembers ให้ fallback — ระบุอย่างใดอย่างหนึ่ง`
      );
    }

    initPerson(orig.paidBy);
    sharedBy.forEach(initPerson);

    // 3) หารราคาสุทธิ (price+sc+vat) ของ item นี้ ไปยังคนที่ sharedBy แบบเป็นธรรม (ไม่มีเศษตกหล่น)
    const itemTotalSatang = toSatang(priced.total);
    const owedSplit = distributeAmount(
      itemTotalSatang,
      sharedBy.map(() => 1) // หารเท่ากันทุกคนที่ร่วมกินรายการนี้
    );
    sharedBy.forEach((personId, i) => {
      owedSatang[personId] += owedSplit[i];
    });

    // 4) คนที่จ่ายเงินล่วงหน้า ได้เครดิตเท่ากับยอดที่จ่ายไปทั้งหมดของ item นี้
    paidSatang[orig.paidBy] += itemTotalSatang;

    return {
      id: orig.id,
      price: priced.price,
      sc: priced.sc,
      vat: priced.vat,
      total: priced.total,
      paidBy: orig.paidBy,
      sharedBy,
    };
  });

  // 5) รวมเป็น net balance ต่อคน: balance = paid - owed (บวก = ควรได้คืน, ลบ = ต้องจ่ายเพิ่ม)
  const allPersons = new Set([...Object.keys(paidSatang), ...Object.keys(owedSatang)]);
  const balances = Array.from(allPersons).map((person) => ({
    person,
    amount: toBaht((paidSatang[person] || 0) - (owedSatang[person] || 0)),
  }));

  return {
    items: detailedItems,
    summary,
    balances,
  };
}

/**
 * ลดจำนวนธุรกรรมการโอนเงินจาก net balance ของกลุ่ม
 * (เป็น thin wrapper รอบ debtSimplifier เพื่อให้เรียกจาก service layer เดียวกัน)
 *
 * @param {Array<{person: string, amount: number}>} balances
 * @returns {Array<{from: string, to: string, amount: number}>}
 */
function settleGroupBalances(balances) {
  if (!Array.isArray(balances)) {
    throw new Error('balances ต้องเป็น array');
  }
  let sumSatang = 0;
  for (const b of balances) {
    if (
      !b ||
      typeof b.person !== 'string' ||
      b.person === '' ||
      typeof b.amount !== 'number' ||
      !Number.isFinite(b.amount)
    ) {
      throw new Error('balances แต่ละรายการต้องมี person (ข้อความ) และ amount (ตัวเลข)');
    }
    sumSatang += toSatang(b.amount);
  }
  if (sumSatang !== 0) {
    throw new Error(`ผลรวม balances ต้องเป็นศูนย์ (คลาด ${sumSatang} สตางค์)`);
  }
  return simplifyDebts(balances);
}

/**
 * ฟังก์ชันรวม: หารบิล + ลดจำนวนธุรกรรม ในขั้นตอนเดียว
 * เหมาะสำหรับเรียกจาก controller ตรง ๆ (เช่น POST /groups/:id/split-bill)
 *
 * @param {Array} items - ดู splitBillForGroup
 * @param {number} scRate
 * @param {number} vatRate
 * @param {Object} options - ดู splitBillForGroup
 * @returns {{items: Array, summary: Object, balances: Array, transactions: Array}}
 */
function splitBillAndSettle(items, scRate = 0, vatRate = 0, options = {}) {
  const { items: detailedItems, summary, balances } = splitBillForGroup(
    items,
    scRate,
    vatRate,
    options
  );
  const transactions = settleGroupBalances(balances);

  return {
    items: detailedItems,
    summary,
    balances,
    transactions,
  };
}

module.exports = {
  splitBillForGroup,
  settleGroupBalances,
  splitBillAndSettle,
};