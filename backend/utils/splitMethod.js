/**
 * splitMethod.js
 * -------------
 * ตัวแก้ปัญหา (resolver) ตัวเดียวสำหรับ "วิธีหารบิล" ทั้ง 3 เคส
 * ใช้ร่วมกันทั้งฝั่ง group transaction (split_data) และ /api/v1/bill-split
 * เพื่อไม่ให้ตรรกะการหารกระจายสองทาง
 *
 * 3 เคส (method) — ค่า method ใน split_data:
 *   1. 'equal'   หารเท่ากัน            -> { method:'equal',  memberIds:[id,...] }
 *   2. 'percent' หารตามสัดส่วนเปอร์เซ็นต์ -> { method:'percent', shares:{ id: 30, ... } }
 *   3. sub-group (custom) แบ่งเป็น 2 variant:
 *      3a. 'item'   หารตามรายการสินค้า  -> { method:'item',  items:[{ id, price, sharedBy:[id,...] }] }
 *      3b. 'amount' หารตามจำนวนเงินตายตัว -> { method:'amount', amounts:{ id: 120, ... } }
 *
 * หลักการ (สำคัญ):
 *   - คำนวณทั้งหมดเป็น "สตางค์" (integer) เพื่อกันเศษ float
 *   - ผลรวมที่แบ่งได้ต้อง = ยอดเต็มพอดีเสมอ ไม่มีสตางค์ตกหล่น
 *   - ถ้า shares/amounts/items ไม่ครบยอด -> throw error ชัดเจน
 *     (ไม่ normalize เงียบ ๆ เพราะจะทำให้ตัวเลขที่ผู้ใช้กรอกไม่ตรงกับที่คิด)
 */

const { toSatang, toBaht, distributeAmount } = require('./allocationUtils');

/** รายการ method ที่รองรับ */
const SPLIT_METHODS = ['equal', 'percent', 'item', 'amount'];

/** ความคลาดเคลื่อนที่ยอมรับได้ตอนเทียบผลรวม (สตางค์) — กันเศษจาก float เช่น 33.33 x 3 */
const SATANG_TOLERANCE = 1;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function asSatang(value, field) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`${field} ไม่ใช่ตัวเลขที่ถูกต้อง`);
  }
  return toSatang(n);
}

/** ทำ id ให้เป็น string และตัดซ้ำ */
function normalizeIds(ids) {
  if (ids === undefined || ids === null) return null;
  if (!Array.isArray(ids)) {
    throw new Error('memberIds ต้องเป็น array');
  }
  return Array.from(new Set(ids.map((id) => String(id).trim()).filter(Boolean)));
}

/** สมาชิกที่อนุญาตให้แชร์บิลนี้: ถ้าไม่ระบุ -> ใช้ทั้งกลุ่ม */
function resolveParticipants(split, fallbackIds) {
  const ids = normalizeIds(split.memberIds);
  return ids && ids.length > 0 ? ids : normalizeIds(fallbackIds);
}

/**
 * กระจายยอดเงินตามน้ำหนัก แล้วคืน 3 องค์ประกอบที่รวมกันตรงกับยอดเต็มเสมอ
 * - price/sc/vat ถูกกระจายแยกกันด้วยน้ำหนักเดียวกัน (ผลรวมแต่ละตัวตรงเป๊ะ)
 * - total เป็น "ส่วนที่เหลือ" คำนวณจาก total ที่กระจายแล้ว เพื่อบังคับเอกลักษณ์
 *   price + sc + vat === total ทุกคน (สำคัญมากสำหรับ balanceCalculator)
 *
 * @param {Record<string, number>} weights - น้ำหนักต่อสมาชิก (key = memberId)
 * @returns {Record<string, {price:number, sc:number, vat:number, total:number}>} หน่วยบาท
 */
function splitIntoComponents(weights, priceSatang, scSatang, vatSatang) {
  const ids = Object.keys(weights);
  if (ids.length === 0) {
    throw new Error('ไม่มีสมาชิกให้แบ่งยอด');
  }

  // distributeAmount รับ/คืนเป็น array จึงต้องแปลง object -> array ก่อน
  const weightList = ids.map((id) => weights[id]);
  const totalSatang = priceSatang + scSatang + vatSatang;

  const totalShares = distributeAmount(totalSatang, weightList);
  const priceShares = distributeAmount(priceSatang, weightList);
  const scShares = distributeAmount(scSatang, weightList);

  const out = {};
  ids.forEach((id, i) => {
    // ให้ราคา + SC + VAT = total เสมอ (กัน VAT ติดลบจากการปัดเศษแยกส่วน)
    out[id] = {
      price: toBaht(priceShares[i]),
      sc: toBaht(scShares[i]),
      vat: toBaht(totalShares[i] - priceShares[i] - scShares[i]),
      total: toBaht(totalShares[i]),
    };
  });

  return out;
}

// ---------------------------------------------------------------------------
// 1) equal — หารเท่ากัน
// ---------------------------------------------------------------------------

function resolveEqual(split, ctx) {
  const participants = resolveParticipants(split, ctx.memberIds);
  if (!participants || participants.length === 0) {
    throw new Error('equal: ไม่พบสมาชิกที่ร่วมบิล');
  }

  const weights = {};
  for (const id of participants) weights[id] = 1;

  return {
    method: 'equal',
    participants,
    members: splitIntoComponents(
      weights,
      ctx.priceSatang,
      ctx.scSatang,
      ctx.vatSatang
    ),
  };
}

// ---------------------------------------------------------------------------
// 2) percent — หารตามเปอร์เซ็นต์ (ต้องรวม 100)
// ---------------------------------------------------------------------------

function resolvePercent(split, ctx) {
  const shares = split.shares;
  if (!shares || typeof shares !== 'object' || Array.isArray(shares)) {
    throw new Error('percent: ต้องระบุ shares เป็น object เช่น { "user-id": 50, "user-id2": 50 }');
  }

  const participants = Object.keys(shares).map(String);
  if (participants.length === 0) {
    throw new Error('percent: ไม่พบสมาชิกที่ระบุสัดส่วน');
  }

  // แปลง % เป็น "น้ำหนัก" เป็นจำนวนเต็ม (bp = เปอร์เซ็นต์ x 100) กันเศษ float
  const weights = {};
  let weightSum = 0;
  for (const id of participants) {
    const pct = Number(shares[id]);
    if (!Number.isFinite(pct) || pct < 0) {
      throw new Error(`percent: สัดส่วนของ ${id} ไม่ถูกต้อง (ต้องเป็นตัวเลข 0 ขึ้นไป)`);
    }
    const bp = Math.round(pct * 100);
    weights[id] = bp;
    weightSum += bp;
  }

  // 100% = 10000 bp
  if (Math.abs(weightSum - 10000) > SATANG_TOLERANCE) {
    throw new Error(
      `percent: ผลรวมเปอร์เซ็นต์ต้องเท่ากับ 100 (พบ ${weightSum / 100})`
    );
  }

  return {
    method: 'percent',
    participants,
    members: splitIntoComponents(
      weights,
      ctx.priceSatang,
      ctx.scSatang,
      ctx.vatSatang
    ),
  };
}

// ---------------------------------------------------------------------------
// 3a) item — sub-group แบบ item-based (ใครกินอะไร)
// ---------------------------------------------------------------------------

function resolveItem(split, ctx) {
  const items = split.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('item: ต้องระบุ items เป็น array ที่ไม่ว่าง');
  }

  const participants = new Set();
  const normalized = [];
  let itemsSum = 0;

  for (const [idx, raw] of items.entries()) {
    if (!raw || typeof raw !== 'object') {
      throw new Error(`item: รายการที่ ${idx} ไม่ถูกต้อง`);
    }
    const id = raw.id === undefined || raw.id === null ? `item_${idx}` : String(raw.id);
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < 0) {
      throw new Error(`item: ราคาของ "${id}" ไม่ถูกต้อง`);
    }
    const sharedBy = normalizeIds(raw.sharedBy);
    if (!sharedBy || sharedBy.length === 0) {
      throw new Error(`item: "${id}" ต้องระบุ sharedBy อย่างน้อย 1 คน`);
    }
    for (const m of sharedBy) participants.add(m);

    normalized.push({ id, price, sharedBy });
    itemsSum += toSatang(price);
  }

  // ราคารวมของ item ต้องตรงกับยอดก่อน SC/VAT มิฉะนั้นมีคนจ่าย/ได้เงินเกินโดยไม่ได้บอก
  if (Math.abs(itemsSum - ctx.priceSatang) > SATANG_TOLERANCE) {
    throw new Error(
      `item: ผลรวมราคาสินค้า (${toBaht(itemsSum)}) ต้องตรงกับยอดก่อนภาษี (${toBaht(ctx.priceSatang)})`
    );
  }

  return {
    method: 'item',
    participants: Array.from(participants),
    items: normalized,
    members: splitIntoComponents(
      // น้ำหนักคือราคาของ item ที่แต่ละคน "โดนแชร์"
      itemWeights(normalized),
      ctx.priceSatang,
      ctx.scSatang,
      ctx.vatSatang
    ),
  };
}

/** สร้างน้ำหนักต่อคน = ราคาสินค้าที่คนนั้นร่วมกิน (ใช้กับ SC/VAT ที่ต้องแปรตามสัดส่วนสินค้า) */
function itemWeights(items) {
  const weights = {};
  for (const item of items) {
    const priceSatang = toSatang(item.price);
    const each = priceSatang / item.sharedBy.length;
    for (const id of item.sharedBy) {
      weights[id] = (weights[id] || 0) + each;
    }
  }
  // ทำให้เป็นจำนวนเต็ม โดยคงผลรวมเท่าเดิม
  let sum = 0;
  for (const k of Object.keys(weights)) {
    weights[k] = Math.round(weights[k]);
    sum += weights[k];
  }
  // ปรับส่วนต่างเศษให้คนที่น้ำหนักเยอะสุด
  if (sum > 0) {
    const diff = items.reduce((s, it) => s + toSatang(it.price), 0) - sum;
    if (diff !== 0) {
      const target = Object.keys(weights).reduce((max, k) =>
        weights[k] > weights[max] ? k : max
      );
      weights[target] += diff;
    }
  }
  return weights;
}

// ---------------------------------------------------------------------------
// 3b) amount — sub-group แบบ amount-based (ตัดยอดตายตัวต่อคน)
// ---------------------------------------------------------------------------

function resolveAmount(split, ctx) {
  const amounts = split.amounts;
  if (!amounts || typeof amounts !== 'object' || Array.isArray(amounts)) {
    throw new Error('amount: ต้องระบุ amounts เป็น object เช่น { "user-id": 120, "user-id2": 80 }');
  }

  const participants = Object.keys(amounts).map(String);
  if (participants.length === 0) {
    throw new Error('amount: ไม่พบสมาชิกที่ระบุยอด');
  }

  const weights = {};
  let sum = 0;
  for (const id of participants) {
    const satang = asSatang(amounts[id], `amount: ยอดของ ${id}`);
    if (satang < 0) {
      throw new Error(`amount: ยอดของ ${id} ต้องไม่ติดลบ`);
    }
    weights[id] = satang;
    sum += satang;
  }

  // ยอดตายตัวต้องครบเท่ากับยอดรวมทั้งบิล (รวม SC/VAT แล้ว)
  const totalSatang = ctx.priceSatang + ctx.scSatang + ctx.vatSatang;
  if (Math.abs(sum - totalSatang) > SATANG_TOLERANCE) {
    throw new Error(
      `amount: ผลรวมยอดที่กรอก (${toBaht(sum)}) ต้องเท่ากับยอดรวมทั้งบิล (${toBaht(totalSatang)})`
    );
  }

  // ใช้ยอดที่กรอกเป็นน้ำหนักตรง ๆ -> total ที่ได้กลับมาเท่ากับยอดที่กรอกทุกคน
  return {
    method: 'amount',
    participants,
    members: splitIntoComponents(
      weights,
      ctx.priceSatang,
      ctx.scSatang,
      ctx.vatSatang
    ),
  };
}

// ---------------------------------------------------------------------------
// ตัวแก้ปัญหาหลัก
// ---------------------------------------------------------------------------

const RESOLVERS = {
  equal: resolveEqual,
  percent: resolvePercent,
  item: resolveItem,
  amount: resolveAmount,
};

/**
 * @param {Object} split  config วิธีหาร (ดูหัวไฟล์)
 * @param {Object} ctx
 * @param {number} ctx.subtotal ยอดก่อน SC/VAT (บาท)
 * @param {number} [ctx.scAmount=0] ยอด SC (บาท)
 * @param {number} [ctx.vatAmount=0] ยอด VAT (บาท)
 * @param {string[]} [ctx.memberIds] สมาชิกทั้งกลุ่ม (ใช้เป็นค่า default ของ 'equal')
 * @returns {{method:string, participants:string[], members:Object}}
 */
function resolveSplit(split, ctx = {}) {
  const method = String(split?.method || 'equal').toLowerCase();

  if (!SPLIT_METHODS.includes(method)) {
    throw new Error(
      `method "${method}" ไม่รองรับ (รองรับ: ${SPLIT_METHODS.join(', ')})`
    );
  }

  const priceSatang = toSatang(Number(ctx.subtotal) || 0);
  const scSatang = toSatang(Number(ctx.scAmount) || 0);
  const vatSatang = toSatang(Number(ctx.vatAmount) || 0);

  if (priceSatang < 0 || scSatang < 0 || vatSatang < 0) {
    throw new Error('ยอดก่อนภาษี/SC/VAT ต้องไม่ติดลบ');
  }

  return RESOLVERS[method](split, {
    memberIds: ctx.memberIds,
    priceSatang,
    scSatang,
    vatSatang,
  });
}

/**
 * ตรวจความถูกต้องของ split config โดยคำนวณจริงหนึ่งรอบ
 * ใช้ตอนบันทึกบิล เพื่อ fail fast (400) แทนที่จะไปพังตอนคิดยอดตอน settle
 *
 * @returns {{ok:true, result:Object} | {ok:false, error:string}}
 */
function validateSplit(split, ctx = {}) {
  try {
    return { ok: true, result: resolveSplit(split, ctx) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = {
  SPLIT_METHODS,
  resolveSplit,
  validateSplit,
};
