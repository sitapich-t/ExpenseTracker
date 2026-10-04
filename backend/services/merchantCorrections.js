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
    pattern: /Kamphaeng\s*5\s*[ลส]อท/gi,
    correct: 'Kamphaeng Saen',
    note: 'ฟอนต์ตัวหนาบนหัวใบเสร็จ Yo-i soup เล็กและชิดกัน ทำให้ "Saen" ถูกอ่านผิดเป็น "5ลอท" หรือ "5สอท"',
  },

  {
    pattern: /มาลิยแมน/gi,
    correct: 'มาลัยแมน',
    note: 'สระ ั ในตัวอักษรไทยตัวเล็กบนหน้าจอแอป 7-Eleven ถูกอ่านผิดเป็น "ิย"',
  },
  {
    pattern: /(?:ข[หน]?)*นม\s*รีบ\s*ก[ุั้]{0,3}ง/gi,
    correct: 'ขนมจีบกุ้ง',
    note: 'OCR อ่าน "ขนมจีบกุ้ง" เป็น "ขหขหนมรีบกั้ง" บนหน้าจอแอป 7-Eleven',
  },
  {
    pattern: /ช็อกโกแลตครีม\s*[ษช]ีสลา/gi,
    correct: 'ช็อกโกแลตครีมชีสลา',
    note: 'OCR อ่าน ช เป็น ษ บนหน้าจอแอป 7-Eleven',
  },
  {
    pattern: /รายการสัง?ซื้อที่ร้านและ\s*7Delivery/gi,
    correct: 'รายการสั่งซื้อที่ร้านและ 7Delivery',
    note: 'หัวข้อหน้าจอแอป 7-Eleven OCR อ่านไม้เอกหาย เป็น "สัง" (ไม่กระทบชื่อร้านหลังแก้ ExtractReceiptMerchant แล้ว)',
  },

  {
    pattern: /บริ[ยษ]ัท\s*Fwd\s*แอสเส[หท]/gi,
    correct: 'บริษัท พัฒนาคี แอสเสท',
    note: 'ภาพถ่ายเอียง "พัฒนาคี" ถูกอ่านเป็น Fwd',
  },

  {
    pattern: /สปาร์ค\s*[38]{2}(?!\d)/gi,
    correct: 'สปาร์ค อีวี',
    note: 'ตัวอักษรไทย "อีวี" ขนาดเล็กบนสลิป K+ ถูกอ่านผิดเป็นเลข "83" หรือ "33"',
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