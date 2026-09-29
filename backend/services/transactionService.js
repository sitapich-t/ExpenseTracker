// ==========================================
// Transaction Service — shared formatters/helpers
// used by both Personal and Group controllers.
// ==========================================

const { classifyCategory } = require('./categoryService');

// แปลงจำนวนเงินให้เป็นตัวเลข (กัน NaN / negative)
exports.parseAmount = (value) => {
  const num = parseFloat(value);
  return isNaN(num) ? 0 : num;
};

// แปลง category_id เป็นตัวเลข หรือ null (สำหรับงบรวม/รายการที่ไม่มีหมวดหมู่)
exports.parseCategoryId = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const num = parseInt(value, 10);
  return isNaN(num) ? null : num;
};

// กำหนด transaction_date จาก payload หรือใช้เวลาปัจจุบัน
exports.resolveDate = (value) => value || new Date().toISOString();

// ตัดช่องว่าง title (และกัน undefined)
exports.normalizeTitle = (value) => String(value || '').trim();

// เติม category_id อัตโนมัติถ้าผู้ใช้ยังไม่เลือกเอง — นี่คือ "Auto-fill Logic"
exports.resolveCategoryId = (payload) => {
  const explicit = exports.parseCategoryId(payload.category_id);
  if (explicit !== null) return explicit; // ผู้ใช้เลือกเองแล้ว ไม่ต้องเดาทับ

  const { categoryId, confidence } = classifyCategory(payload.merchant, payload.parsedText);
  return confidence >= 0.5 ? categoryId : null; // มั่นใจน้อยกว่านี้ปล่อยว่างให้เลือกเอง
};