// ==========================================
// OCR & Receipt / Slip Scanning Service
// ใช้ Tesseract.js (OCR แบบ open-source)
// ==========================================

const Tesseract = require('tesseract.js');

const USE_MOCK_OCR = String(process.env.USE_MOCK_OCR || '').toLowerCase() === 'true';

const { applyMerchantCorrections } = require('./merchantCorrections');
const MOCK_RESULT = {
  merchant: 'สปาร์ค อีวี (MOCK)',
  total: 100.0,
  date: new Date().toISOString(),
  parsedText: 'สปาร์ค อีวี\n1683533\nTransaction ID: 016242082205CPM12337',
  bankName: 'ธนาคารกสิกรไทย',
  transactionId: '016242082205CPM12337',
  paymentMethod: 'e-banking',
  documentType: 'slip',
  isMock: true,
};

// ---------- Helper: ตรวจสอบประเภทเอกสารและช่องทางการชำระเงิน ----------
function detectDocumentTypeAndPaymentMethod(text) {
  const isSlip = /(Payment\s*Completed|โอนเงินสำเร็จ|Transaction\s*ID|Scan\s*for\s*Verify|K\+|SCB|PromptPay|พร้อมเพย์|เลขที่รายการ|รหัสอ้างอิง)/i.test(text);

  if (isSlip) {
    return {
      documentType: 'slip',
      paymentMethod: 'e-banking', // สลิปโอนเงินกำหนดเป็น e-banking
    };
  }

  return {
    documentType: 'receipt',
    paymentMethod: 'cash', // Default สำหรับใบเสร็จทั่วไป
  };
}

// ---------- Helper: ดึงชื่อร้านค้า/ผู้รับโอนเงิน ----------
function extractMerchant(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

  // คำนำหน้าชื่อคน -> เป็นชื่อ "ผู้โอน" เสมอ ไม่ใช่ชื่อร้าน/ผู้รับ
  const isPersonName = (line) =>
    /^(MS\.|MR\.|MRS\.|MISS|นาย|นาง|นางสาว|น\.ส\.)\s*/i.test(line);

  function looksLikeMerchantCandidate(line) {
    if (!line || line.length < 2) return false;
    if (/(Transaction|Amount|Fee|โอนเงิน|สำเร็จ|เลขที่|Scan|Verify|จำนวนเงิน|จำนวน|เติมเงินสำเร็จ|การเติมเงิน)/i.test(line)) return false;
    if (/x{2,}/i.test(line) && /\d/.test(line)) return false;
    if (isPersonName(line)) return false;
    if (/^\s*(KBank|K\+|SCB|BBL|Krungthai|KTB|TTB|BAY|PromptPay|Payment\s*Completed)\s*[+\-]?\s*$/i.test(line)) return false;
    if (!/[ก-๙]{3,}|[a-zA-Z]{3,}/.test(line)) return false;

    const meaningfulChars = (line.match(/[ก-๙a-zA-Z]/g) || []).length;
    if (meaningfulChars < 3) return false;
    return true;
  }

  // หาเลขบัญชีผู้โอนที่ถูกปิดบังก่อน — ชื่อร้าน/ผู้รับเงินจะอยู่ "หลัง" จุดนี้เสมอ
  const accountIndex = lines.findIndex(
    l => /x{2,}[-=\s]?x[-=\s]?x?\d{2,4}[-=\s]?x?/i.test(l) || /\d{3}-\d{1}-\d{5}-\d{1}/.test(l)
  );
  if (accountIndex !== -1) {
    for (let i = accountIndex + 1; i < Math.min(accountIndex + 4, lines.length); i++) {
      if (looksLikeMerchantCandidate(lines[i])) {
        return lines[i];
      }
    }
  }

    // 2. เคสสลิป/ใบเสร็จ: หาตาม คีย์เวิร์ด นำหน้า (เช่น ไปยัง, ถึง, To, Merchant, ร้านค้า)
  console.log('🔍 [backend extractMerchant] lines array:', JSON.stringify(lines, null, 2));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/(?:ไปยัง|ถึง|to|merchant|ร้านค้า|ชำระให้|โอนให้)[\s:]*(.*)/i);
    if (match) {
      console.log(`🔍 matched keyword on line[${i}]="${line}" → inline="${match[1]}"`);
    }
    if (match) {
      const inlineValue = match[1] && match[1].trim();
      if (inlineValue && inlineValue.length > 2 && looksLikeMerchantCandidate(inlineValue)) {
        return inlineValue;
      }
      // เดินหาแถวถัดไปจนกว่าจะเจอแถวที่ดูเหมือนชื่อจริง แทนที่จะคืนบรรทัดถัดไปแบบมั่ว
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (looksLikeMerchantCandidate(lines[j])) {
          return lines[j];
        }
      }
    }
}

  return '';
}

// ---------- Helper: ดึง Transaction ID ----------
function extractTransactionId(text) {
  const match = text.match(/(?:Transaction\s*ID|เลขที่รายการ|รหัสอ้างอิง)[\s:]*([A-Za-z0-9]+)/i);
  return match ? match[1] : null;
}

// ---------- Helper: ดึงชื่อธนาคาร ----------
function extractBankName(text) {
  const infoIndex = text.search(/ข้อมูลเพิ่มเติมจากผู้ให้บริการ/i);
  const scopedText = infoIndex !== -1 ? text.slice(0, infoIndex) : text;

  const banks = [
    { pattern: /KBank|กสิกร|K\+/i, name: 'ธนาคารกสิกรไทย' },
    { pattern: /SCB|ไทยพาณิชย์/i, name: 'ธนาคารไทยพาณิชย์' },
    { pattern: /BBL|กรุงเทพ/i, name: 'ธนาคารกรุงเทพ' },
    { pattern: /Krungthai|กรุงไทย|KTB/i, name: 'ธนาคารกรุงไทย' },
    { pattern: /TTB|ทหารไทยธนชาต/i, name: 'ธนาคารทีทีบี' },
    { pattern: /BAY|กรุงศรี/i, name: 'ธนาคารกรุงศรีอยุธยา' },
  ];

  // ✅ ค้นหาจาก text เต็ม ไม่ตัด scope เพราะชื่อธนาคารต้นทางมักอยู่หลังจุดตัด
  let best = null;
  for (const { pattern, name } of banks) {
    const match = text.match(pattern);
    if (match && (best === null || match.index < best.index)) {
      best = { index: match.index, name };
    }
  }
  if (best) return best.name;

  // fallback เป็น PromptPay เฉพาะตอนหาชื่อธนาคารเฉพาะไม่เจอเลยจริงๆ — ใช้ scopedText กันเผลอ match ผิดจุด
  if (/PromptPay|พร้อมเพย์/i.test(scopedText)) return 'PromptPay';
  return null;
}
// ---------- Helper: ดึงยอดรวมจากข้อความ OCR ด้วย regex ----------
function extractTotal(text) {
  const patternGroups = [
    {
      // เฉพาะเจาะจงที่สุด: ยอดสุทธิ/Amount (ไม่รวม Fee)
      priority: 3,
      regex: /(?:ยอดชำระสุทธิ|ยอดสุทธิ|รวมสุทธิ|\bamount\b|net\s*total)[^\d]{0,20}([\d,]+\.\d{1,2}|[\d,]+)/gi,
    },
    {
      // รองลงมา: ยอดชำระ/รวมทั้งหมด
      priority: 2,
      regex: /(?:รวมทั้งหมด|ยอดรวมทั้งหมด|ยอดชำระ|grand\s*total|total\s*amount)[^\d]{0,20}([\d,]+\.\d{1,2}|[\d,]+)/gi,
    },
    {
      // ทั่วไปสุด
      priority: 1,
      regex: /(?:ยอดรวม|รวม|\btotal\b)[^\d]{0,20}([\d,]+\.\d{1,2}|[\d,]+)/gi,
    },
  ];

  const candidates = [];
  for (const { priority, regex } of patternGroups) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      // ป้องกันการเผลอดึงค่า Fee: 0.00 Baht หากไม่ใช่ยอดหลัก
      if (!isNaN(num) && num > 0) {
        candidates.push({ priority, position: match.index, value: num });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.priority - a.priority || b.position - a.position);
    return candidates[0].value;
  }

  // Fallback: ดึงตัวเลขเงิน (X.XX) ทั้งหมดในข้อความ
  const moneyMatches = [...text.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})/g)];
  if (moneyMatches.length > 0) {
    // เอาตัวเลขก่อน Fee หรือตัวท้ายสุดถ้าไม่มี Fee
    const filtered = moneyMatches.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(n => n > 0);
    if (filtered.length > 0) return filtered[0]; // บนสลิป Amount มักมาก่อน Fee
  }

  return 0;
}

// ---------- Helper: เดาว่าปี 2 หลักเป็น ค.ศ. หรือ พ.ศ. โดยเทียบกับปีปัจจุบัน ----------
function convertTwoDigitYear(y2) {
  const currentYear = new Date().getFullYear();
  const asCE = 2000 + y2;              // ตีความเป็น ค.ศ. เช่น 26 -> 2026
  const asBE = (2500 + y2) - 543;      // ตีความเป็น พ.ศ. เช่น 69 -> 2569 -> 2026

  // เลือกปีที่ใกล้เคียงปีปัจจุบันมากที่สุด (ใบเสร็จมักเป็นวันที่ล่าสุด)
  return Math.abs(asBE - currentYear) <= Math.abs(asCE - currentYear) ? asBE : asCE;
}

// ---------- เดือนภาษาไทย (ทั้งแบบย่อและเต็ม) สำหรับ parse วันที่บนสลิป ----------
const monthsTh = {
  'มกราคม': 0, 'ม.ค.': 0,
  'กุมภาพันธ์': 1, 'ก.พ.': 1,
  'มีนาคม': 2, 'มี.ค.': 2,
  'เมษายน': 3, 'เม.ย.': 3,
  'พฤษภาคม': 4, 'พ.ค.': 4,
  'มิถุนายน': 5, 'มิ.ย.': 5,
  'กรกฎาคม': 6, 'ก.ค.': 6,
  'สิงหาคม': 7, 'ส.ค.': 7,
  'กันยายน': 8, 'ก.ย.': 8,
  'ตุลาคม': 9, 'ต.ค.': 9,
  'พฤศจิกายน': 10, 'พ.ย.': 10,
  'ธันวาคม': 11, 'ธ.ค.': 11,
};

// ---------- Helper: ดึงวันที่จากข้อความ OCR ----------
function extractDate(text) {
  // แก้ OCR อ่านเดือนไทยแบบย่อผิดบ่อย เช่น "ก.ุย." ที่จริงคือ "ก.ย." (มีสระ ุ แทรกผิดระหว่างจุด)
  text = text.replace(/([ก-๙])\.\s*ุ?\s*([ก-๙])\./g, '$1.$2.');
  const monthsEn = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  // 1. รูปแบบสลิปภาษาอังกฤษ เช่น "29 Aug 26 12:49 PM" หรือ "29 Aug 2026"
  const enMatch = text.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/i);
  if (enMatch) {
    let [, day, monthStr, yearStr, hours, minutes] = enMatch;
    const month = monthsEn[monthStr.toLowerCase()];
    if (month !== undefined) {
      let year = parseInt(yearStr, 10);
      if (year < 100) year += 2000;
      const h = hours ? parseInt(hours, 10) : 0;
      const m = minutes ? parseInt(minutes, 10) : 0;
      return new Date(Date.UTC(year, month, parseInt(day, 10), h, m)).toISOString();
    }
  }

  // 2. รูปแบบวันที่ภาษาไทย เช่น "01 ก.ย. 2569" หรือ "1 กันยายน 2569"
  const monthKeys = Object.keys(monthsTh).sort((a, b) => b.length - a.length);
  const monthPattern = monthKeys.map(k => k.replace(/\./g, '\\.')).join('|');
  const thMatch = text.match(new RegExp(`(\\d{1,2})\\s*(${monthPattern})\\s*(\\d{2,4})`));
  if (thMatch) {
    const day = parseInt(thMatch[1], 10);
    const month = monthsTh[thMatch[2]];
    let year = parseInt(thMatch[3], 10);
    if (year < 100) year = convertTwoDigitYear(year);
    if (year > 2500) year -= 543; // แปลง พ.ศ. -> ค.ศ.
    if (month !== undefined && day >= 1 && day <= 31) {
      try {
        return new Date(Date.UTC(year, month, day)).toISOString();
      } catch {
        return null;
      }
    }
  }

  // 3. รูปแบบตัวเลข เช่น dd/mm/yy, dd/mm/yyyy, dd-mm-yy
  const numMatch = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (numMatch) {
    let [, day, month, year] = numMatch.map(Number);
    if (year < 100) year = convertTwoDigitYear(year);
    if (year > 2500) year -= 543; // แปลง พ.ศ. -> ค.ศ.
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      try {
        return new Date(Date.UTC(year, month - 1, day)).toISOString();
      } catch {
        return null;
      }
    }
  }

  return null;
}

// ---------- Main Export Function ----------
exports.scanReceipt = async ({ file, image } = {}) => {
  if (USE_MOCK_OCR) {
    console.warn('⚠️ USE_MOCK_OCR=true -> ใช้ Mock OCR Data (dev only)');
    return MOCK_RESULT;
  }

  let inputImage;
  if (file && file.path) {
    inputImage = file.path;
  } else if (image) {
    inputImage = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
  } else {
    throw new Error('ไม่พบไฟล์รูปภาพหรือข้อมูลรูปภาพ');
  }

    let rawText = '';
  try {
    const worker = await Tesseract.createWorker('tha+eng', 1, {
      // oem = 1 -> LSTM engine เท่านั้น (neural net รุ่นใหม่ แม่นกว่า legacy engine
      // โดยเฉพาะกับภาษาไทยที่มีสระ/วรรณยุกต์ซับซ้อน)
      logger: () => {},
    });

    // ลองหลาย PSM (Page Segmentation Mode) แล้วเลือกผลที่ confidence สูงสุด
    // เพราะสลิปที่มีกราฟิก/พื้นหลังปนกับตัวหนังสือ แต่ละภาพเหมาะกับ PSM ไม่เท่ากัน
    const psmModesToTry = [
      Tesseract.PSM.SPARSE_TEXT,        // 11: ข้อความกระจัดกระจาย ปนกับกราฟิก/พื้นหลัง (เหมาะกับสลิปธนาคาร)
      Tesseract.PSM.SINGLE_COLUMN,      // 4: คอลัมน์เดียว ขนาดตัวอักษรไม่เท่ากัน (เหมาะกับใบเสร็จ)
      Tesseract.PSM.AUTO,               // 3: default เดิม เผื่อสองแบบบนแม่นน้อยกว่า
    ];

    let bestResult = null;

    for (const psm of psmModesToTry) {
      await worker.setParameters({
        tessedit_pageseg_mode: psm,
        preserve_interword_spaces: '1',
      });

      const { data } = await worker.recognize(inputImage);

      if (!bestResult || data.confidence > bestResult.confidence) {
        bestResult = data;
      }
    }

    await worker.terminate();

    rawText = (bestResult?.text || '').trim().normalize('NFC');
    // แก้สระ "ำ" ที่ OCR อ่านแยกเป็นนิคหิต (ํ) + สระอา (า) แทนที่จะเป็นตัวเดียว
    // เช่น "จำนวน" อ่านเป็น "จํานวน" — ต้องแปลงเองเพราะ Unicode NFC ไม่ได้จัดการเคสนี้ให้
    rawText = rawText.replace(/\u0E4D\u0E32/g, '\u0E33');
    // แก้คำที่ OCR อ่านผิดบ่อยสำหรับป้ายบริการมาตรฐาน (ไม่ใช่ชื่อคน จึง fix ตรงๆ ได้)
    rawText = rawText.replace(/พร้อม[เแ]{1,2}พย์/gi, 'พร้อมเพย์');
    rawText = applyMerchantCorrections(rawText);
    console.log('📊 OCR confidence (best PSM):', bestResult?.confidence);
  } catch (err) {
    console.error('❌ Tesseract OCR error:', err.message);
    throw new Error('ไม่สามารถประมวลผล OCR ได้ กรุณาลองใหม่อีกครั้ง หรือถ่ายรูปให้ชัดเจนขึ้น');
  }
  if (!rawText) {
    throw new Error('อ่านข้อความจากรูปไม่ได้เลย กรุณาถ่ายรูปให้ชัดเจนขึ้นและมีแสงเพียงพอ');
  }

  // ดึงข้อมูลต่างๆ
  const { documentType, paymentMethod } = detectDocumentTypeAndPaymentMethod(rawText);
  const merchant = extractMerchant(rawText);
  const total = extractTotal(rawText);
  const date = extractDate(rawText);
  const bankName = extractBankName(rawText);
  const transactionId = extractTransactionId(rawText);

  return {
    merchant,         // e.g. "Ksher_SANOOK GAME ZONE"
    total,            // e.g. 120.00
    date,             // ISO Date String
    paymentMethod,    // "e-banking"
    documentType,     // "slip" หรือ "receipt"
    bankName,         // e.g. "ธนาคารกสิกรไทย"
    transactionId,    // e.g. "016241124912DPM14401"
    parsedText: rawText,
  };
};