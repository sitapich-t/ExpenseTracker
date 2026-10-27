// backend/services/ocrMerge.js
// รวมรายการสินค้าจากหลายรอบ OCR (หลาย psm / หลายภาพ) โดยไม่นับซ้ำ
// และไม่ให้ผลรวมรายการเกินยอดรวมที่อ่านได้

const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const normalizeName = (name) =>
  String(name || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const itemKey = (item) => `${normalizeName(item.name)}|${round2(item.price).toFixed(2)}`;

const isValidItem = (item) =>
  item &&
  normalizeName(item.name) &&
  Number.isFinite(Number(item.price)) &&
  Number(item.price) > 0;

function buildGroups(items) {
  const groups = new Map();
  for (const item of items || []) {
    if (!isValidItem(item)) continue;
    const key = itemKey(item);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return groups;
}

/**
 * results: ผล parse เรียงจากน่าเชื่อถือที่สุดไปน้อยสุด (ผลแรกคือฐาน)
 * คืนรายการสินค้าที่รวมแล้ว: เก็บจำนวนสูงสุดที่พบของแต่ละรายการ
 * ถ้ารู้ยอดรวม จะเพิ่มรายการที่พบเฉพาะรอบอื่นได้เฉพาะเมื่อยอดยังไม่เกิน
 */
function mergeItems(results) {
  const list = (results || []).filter((r) => r && Array.isArray(r.items));
  if (list.length === 0) return [];

  const best = list[0];
  const total = Number(best.total) > 0 ? round2(best.total) : 0;

  const groups = list.map((r) => buildGroups(r.items));
  const maxCount = new Map();
  for (const groupsOfRun of groups) {
    for (const [key, items] of groupsOfRun) {
      maxCount.set(key, Math.max(maxCount.get(key) || 0, items.length));
    }
  }

  const merged = [];
  const added = new Map();
  let sum = 0;

  // 1) เอาผลฐานมาก่อนเสมอ (ไม่ตัดทอน แม้ยอดจะไม่ตรง)
  for (const item of best.items || []) {
    if (!isValidItem(item)) continue;
    const key = itemKey(item);
    const price = round2(item.price);
    merged.push({ ...item, price });
    added.set(key, (added.get(key) || 0) + 1);
    sum = round2(sum + price);
  }

  // 2) เติมรายการที่ผลฐานมองไม่เห็น จากรอบ/ภาพอื่น
  for (let i = 1; i < groups.length; i++) {
    for (const [key, items] of groups[i]) {
      const target = maxCount.get(key) || 0;
      let have = added.get(key) || 0;
      while (have < target && have < items.length) {
        const item = items[have];
        const price = round2(item.price);
        if (total > 0 && sum + price > total + 0.01) break;
        merged.push({ ...item, price });
        have += 1;
        added.set(key, have);
        sum = round2(sum + price);
      }
    }
  }

  return merged;
}

module.exports = { mergeItems, itemKey };
