// ==========================================
// Merchant OCR Correction Dictionary
// ==========================================
// เก็บ pattern แก้ไขชื่อร้าน/คำที่ OCR อ่านผิดบ่อยๆ ไว้ที่นี่แยกจาก ocrService.js
// เพื่อให้ดูแลรักษาง่าย — เพิ่มเคสใหม่ได้โดยไม่ต้องแก้โค้ด logic หลัก
//
// วิธีเพิ่มเคสใหม่: เพิ่ม object { pattern, correct, note } เข้าไปใน array ด้านล่าง
// - pattern: regex ที่ match ข้อความผิดที่ OCR อ่านออกมา (ควรใส่ flag 'gi' เสมอ)
// - correct: ข้อความที่ถูกต้องที่จะแทนที่
// - note: อธิบายสั้นๆ ว่าทำไมถึง OCR อ่านผิด (ช่วยให้คนอื่นเข้าใจตอนอ่านโค้ดทีหลัง)

const MERCHANT_OCR_FIXES = [
  {
    pattern: /Kamphaeng\s*5\s*ลอท/gi,
    correct: 'Kamphaeng Saen',
    note: 'ฟอนต์ตัวหนาบนหัวใบเสร็จ Yo-i soup เล็กและชิดกัน ทำให้ "Saen" ถูกอ่านผิดเป็น "5ลอท"',
  },
  // เพิ่มเคสร้านอื่นๆ ที่เจอ OCR อ่านชื่อผิดบ่อยตรงนี้ได้เรื่อยๆ
  // ตัวอย่าง:
  // {
  //   pattern: /ชื่อผิดที่ OCR อ่านออกมา/gi,
  //   correct: 'ชื่อที่ถูกต้อง',
  //   note: 'อธิบายสาเหตุ',
  // },
];

/**
 * แก้ไขข้อความ OCR ที่อ่านชื่อร้าน/คำผิดบ่อยๆ ตาม dictionary ด้านบน
 * @param {string} text - ข้อความ OCR ดิบ
 * @returns {string} ข้อความที่แก้ไขแล้ว
 */
function applyMerchantCorrections(text) {
  if (!text) return text;
  let result = text;
  for (const { pattern, correct } of MERCHANT_OCR_FIXES) {
    result = result.replace(pattern, correct);
  }
  return result;
}

module.exports = { applyMerchantCorrections, MERCHANT_OCR_FIXES };