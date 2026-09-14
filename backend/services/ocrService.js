// ==========================================
// OCR & Receipt / Slip Scanning Service
// ใช้ Tesseract.js (OCR แบบ open-source)
// ==========================================

const Tesseract = require('tesseract.js');

const USE_MOCK_OCR = String(process.env.USE_MOCK_OCR || '').toLowerCase() === 'true';

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

  // 1. เคสสลิป: หาหลังจากเลขบัญชีผู้โอน (เช่น xxx-x-x7251-x หรือ xxx-xxxxxx-x)
  // ชื่อผู้รับโอน/ร้านค้าจะอยู่บรรทัดถัดจากเลขบัญชีผู้โอนเสมอ
  const accountIndex = lines.findIndex(l => /x{2,}[-\s]?x[-\s]?x?\d{3,4}[-\s]?x/i.test(l) || /\d{3}-\d{1}-\d{5}-\d{1}/.test(l));
  if (accountIndex !== -1 && accountIndex + 1 < lines.length) {
    const candidate = lines[accountIndex + 1];
    // ต้องไม่ใช่ Transaction ID, Amount, Fee หรือคำที่ไม่ใช่ชื่อร้าน
    if (!/(Transaction|Amount|Fee|โอนเงิน|สำเร็จ|เลขที่|Scan)/i.test(candidate) && candidate.length > 2) {
      return candidate;
    }
  }

  // 2. เคสสลิป/ใบเสร็จ: หาตาม คีย์เวิร์ด นำหน้า (เช่น ไปยัง, ถึง, To, Merchant, ร้านค้า)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/(?:ไปยัง|ถึง|to|merchant|ร้านค้า|ชำระให้|โอนให้)[\s:]*(.*)/i);
    if (match) {
      if (match[1] && match[1].trim().length > 2) {
        return match[1].trim();
      }
      if (i + 1 < lines.length) return lines[i + 1];
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
  if (/KBank|กสิกร|K\+/i.test(text)) return 'ธนาคารกสิกรไทย';
  if (/SCB|ไทยพาณิชย์/i.test(text)) return 'ธนาคารไทยพาณิชย์';
  if (/BBL|กรุงเทพ/i.test(text)) return 'ธนาคารกรุงเทพ';
  if (/Krungthai|กรุงไทย|KTB/i.test(text)) return 'ธนาคารกรุงไทย';
  if (/TTB|ทหารไทยธนชาต/i.test(text)) return 'ธนาคารทีทีบี';
  if (/BAY|กรุงศรี/i.test(text)) return 'ธนาคารกรุงศรีอยุธยา';
  if (/PromptPay|พร้อมเพย์/i.test(text)) return 'PromptPay';
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

// ---------- Helper: ดึงวันที่จากข้อความ OCR ----------
function extractDate(text) {
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

  // 2. รูปแบบตัวเลข เช่น dd/mm/yy, dd/mm/yyyy, dd-mm-yy
  const numMatch = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (numMatch) {
    let [, day, month, year] = numMatch.map(Number);
    if (year < 100) year += 2000;
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

  let result;
  try {
    result = await Tesseract.recognize(inputImage, 'tha+eng', {
      logger: () => {},
    });
  } catch (err) {
    console.error('❌ Tesseract OCR error:', err.message);
    throw new Error('ไม่สามารถประมวลผล OCR ได้ กรุณาลองใหม่อีกครั้ง หรือถ่ายรูปให้ชัดเจนขึ้น');
  }

  const rawText = (result?.data?.text || '').trim();

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