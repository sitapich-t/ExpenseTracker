// ==========================================
// OCR & Receipt / Slip Scanning Service
// ใช้ Tesseract.js (OCR แบบ open-source)
// ==========================================

const { recognizeText } = require('./ocrEngine');
const { shouldUseAI, fixItemsWithAI } = require('./aiFallback');
const USE_MOCK_OCR = String(process.env.USE_MOCK_OCR || '').toLowerCase() === 'true';

const { applyMerchantCorrections } = require('./merchantCorrections');
const MOCK_RESULT = {
  merchant: 'สปาร์ค อีวี (MOCK)',
  total: 100.0,
  netAmount: 100.0,
  vat: 0,
  serviceCharge: 0,
  date: new Date().toISOString(),
  parsedText: 'สปาร์ค อีวี\n1683533\nTransaction ID: 016242082205CPM12337',
  bankName: 'ธนาคารกสิกรไทย',
  transactionId: '016242082205CPM12337',
  paymentMethod: 'e-banking',
  documentType: 'slip',
  isMock: true,
};

// 🔍 1. ฟังก์ชันจำแนกประเภทเอกสาร (รองรับ SCB / Kept / K+)
function detectDocumentTypeAndPaymentMethod(rawText) {
  if (!rawText) return { documentType: 'receipt', paymentMethod: 'cash' };
  const text = rawText.toLowerCase();

  const slipKeywords = [
    'successful transfer', 'transaction successful', 'transfer successful',
    'successful payment', 'payment completed', 'transfer completed', 'top-up completed',
    'scan to verify', 'scan for verify', 'verify the transfer status',
    'ref id', 'transaction id', 'โอนแล้ว', 'โอนเงินสำเร็จ', 'ทำรายการสำเร็จ', 'ชำระเงินสำเร็จ',
    'เติมเงินสำเร็จ', 'รหัสอ้างอิง', 'คิวอาร์โค้ดนี้'
  ];

  const isSlip = slipKeywords.some(kw => text.includes(kw)) ||
                 (text.includes('from') && text.includes('to') && text.includes('amount'));

  if (isSlip) {
    return { documentType: 'slip', paymentMethod: 'bank_transfer' };
  }
  return { documentType: 'receipt', paymentMethod: 'cash' };
}

// 🧾 2. สกัดชื่อร้านจากใบเสร็จ (ข้ามคำขยะ POS และคำว่า "ระบบขายหน้าร้าน")
function extractReceiptMerchant(rawText) {
  if (!rawText) return '';
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const ignoreKeywords = /^(ใบเสร็จ|ใบกำกับภาษี|พนักงาน|เจ้าของ|ระบบขายหน้าร้าน|POS|เสิร์ฟ|โต๊ะ|Table|Tax Invoice|Receipt|Welcome)/i;

  // ใบเสร็จจากแอป 7-Eleven: หัวข้อหน้าจอ "รายการสั่งซื้อที่ร้านและ 7Delivery" ไม่ใช่ชื่อร้าน
  // ชื่อร้านจริงอยู่บรรทัด "สาขา 7-Eleven ..." (OCR อาจมีตัวขยะนำหน้า เช่น "Bl")
  const branchLine = lines.find(l => /สาขา\s*7-?\s*Eleven/i.test(l));
  if (branchLine) {
    const m = branchLine.match(/7-?\s*Eleven[^\n]*/i);
    if (m) {
      return m[0]
        .replace(/[.…]{2,}.*$/, '')   // ตัด "กม...." ที่แอปตัดข้อความทิ้ง
        .replace(/\s+กม\s*$/, '')
        .trim();
    }
  }
  const headerIdx = lines.findIndex(l => /(TAX\s*INVOICE|ใบกำกับภาษี|ใบเสร็จ)/i.test(l));
  if (headerIdx > 0) {
    for (let i = headerIdx - 1; i >= Math.max(0, headerIdx - 2); i--) {
      const l = lines[i];
      if (ignoreKeywords.test(l)) continue;
      if ((l.match(/[ก-๙a-zA-Z]/g) || []).length >= 3) return l;
    }
  }
  for (const line of lines) {
    if (ignoreKeywords.test(line)) continue;
    if (line.length > 2 && !/^[\d\s\W]+$/.test(line)) {
      return line;
    }
  }
  return '';
}

// ช่วยแก้ปัญหา OCR อ่านสัญลักษณ์ ฿ ผิดเป็นตัวเลข "8" นำหน้า (พบบ่อยกับฟอนต์ใบเสร็จเทอร์มอล)
// ต้องรับตัวเลขดิบที่ "ยังมี comma" เท่านั้น (ห้าม .replace(/,/g,'') ก่อนเรียก)
// เพราะ comma คือสัญญาณว่าเป็นเลขจริง เช่น 8,500.00
// ประกาศไว้ก่อนฟังก์ชันที่เรียกใช้ (function declaration ถูก hoist อยู่แล้ว แต่เรียงไว้เพื่ออ่านง่าย)
function stripMisreadBahtSymbol(rawNum) {
  if (rawNum.includes(',')) return rawNum.replace(/,/g, ''); // 8,500.00 = ของจริง
  if (rawNum.length > 6 && rawNum.startsWith('8') && parseFloat(rawNum.substring(1)) > 0) {
    return rawNum.substring(1);
  }
  return rawNum;
}

// 3.ยอดสุทธิ + รูปที่ OCR อ่านเพี้ยน (ยอดสูทธิ / ยอด สุทธิ)
const NET_TOTAL_LABEL = /ยอด\s*ส[ุูิ]?\s*ท\S*/i;

function extractReceiptTotalAmount(rawText) {
  if (!rawText) return 0;
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // ให้ความสำคัญกับ "ยอดสุทธิ" ก่อน (หลังหักส่วนลดแล้ว) ค่อยถอยไป รวม/Total
  const totalLine =
    lines.find(l => NET_TOTAL_LABEL.test(l) || /Net\s*Amount/i.test(l)) ||
    lines.find(l => /(?:รวมทั้งหมด|รวมทั้งสิ้น|ยอดรวม|Total)/i.test(l));

  if (totalLine) {
    const cleanedLine = totalLine
      .replace(/[฿Bb]/g, '')
      .replace(NET_TOTAL_LABEL, '')
      .replace(/รวมทั้งหมด|รวมทั้งสิ้น|ยอดรวม|Total|Net Amount/gi, '');

    // "3 ชั้น 113.00" -> ข้ามจำนวนชิ้น เอาเฉพาะเลขที่มีทศนิยม
    const match = cleanedLine.match(/(\d+(?:\,\d+)*\.\d{2})/);
    if (match) {
      return parseFloat(stripMisreadBahtSymbol(match[1]));
    }
  }
  return 0;
}

// 📄 4. สกัดชื่อผู้รับจากสลิปโอนเงิน
function extractRecipientFromSlip(rawText) {
  if (!rawText) return '';
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const stripLabel = (s) => s.replace(/^(?:ไปยัง|ถึง|TO)\s*[:：]?\s+/, '').trim();

  // กรณี "TO TRUE TOP-UP" อยู่บรรทัดเดียวกัน (SCB ภาษาอังกฤษ)
  for (const l of lines) {
    const m = l.match(/^TO\s+(\S.*)$/);
    if (m) return m[1].trim();
  }

  // กรณี SCB/Kept ที่มีคำว่า TO / To อยู่บรรทัดเดี่ยว
  const toIndex = lines.findIndex(l => /^TO$/i.test(l));
  if (toIndex !== -1 && toIndex + 1 < lines.length) {
    const recipientLine = lines[toIndex + 1];
    if (!/^[\d\-xX=]{6,}$/i.test(recipientLine)) return recipientLine;
  }

  // ใช้บรรทัดเลขบัญชีที่ถูกปิดบัง (มี xx) บรรทัดแรกเป็นจุดสิ้นสุดของผู้โอน
  let senderEndIndex = lines.findIndex(l => /x{2,}/i.test(l) && /\d/.test(l));
  if (senderEndIndex === -1) senderEndIndex = lines.findIndex(l => /KBank|Kasikorn/i.test(l));
  

  if (senderEndIndex !== -1 && senderEndIndex + 1 < lines.length) {
    const recipientLines = [];
    for (let i = senderEndIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:Transaction ID|Amount|Fee|เลขที่รายการ|จำนวนเงิน|Ref ID|Customer No|Reference No|Biller)/i.test(line)) break;
      if (/^[\d\s\-]{7,}$/.test(line)) break;
      if (/^(?:[A-Z0-9]{10,}|LICENSED|COPYRIGHT)/i.test(line)) break;
      if (/^PromptPay ID$/i.test(line)) continue;
      if (line.length <= 2 || /^[\=\+\-\*\.\_]+$/.test(line)) continue;

      const cleaned = stripLabel(line);
      if (!cleaned) continue;
      recipientLines.push(cleaned);
      if (recipientLines.length >= 2) break;
    }
    if (recipientLines.length > 0) return recipientLines.join(' ');
  }
  return '';
}

// 📄 5. สกัดยอดเงินจากสลิปโอนเงิน (รองรับ THB และ Baht)
function extractAmountFromSlip(rawText) {
  if (!rawText) return 0;
  const match = rawText.match(/(?:Amount|AMOUNT|จำนวนเงิน)[\s\n]*:?[\s\n]*([\d,]+\.\d{2})/i) ||
                rawText.match(/([\d,]+\.\d{2})\s*(?:Baht|THB|บาท)/i);
  if (match) return parseFloat(match[1].replace(/,/g, ''));
  return 0;
}

// 🏪 6. สกัดชื่อร้านค้า/ผู้รับโอนเงินจากข้อความ OCR (กรณีทั่วไป ใบเสร็จ/สลิป)
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

  // เคสสลิป/ใบเสร็จ: หาตามคีย์เวิร์ดนำหน้า (เช่น ไปยัง, ถึง, To, Merchant, ร้านค้า)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/(?:ไปยัง|ถึง|to|merchant|ร้านค้า|ชำระให้|โอนให้)[\s:]*(.*)/i);
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

// 🔢 7. สกัด Transaction ID (รวม Ref ID ของ SCB ภาษาอังกฤษ)
function extractTransactionId(text) {
  const match = text.match(/(?:Transaction\s*ID|Ref\s*ID|เลขที่รายการ|รหัสอ้างอิง)[\s:]*([A-Za-z0-9]+)/i);
  if (!match) return null;
  const id = match[1];
  // รหัส SCB ขึ้นต้น yyyymmdd และปกติยาว 18+ ตัว ถ้าสั้นแปลว่า OCR อ่านตัดกลางคัน -> คืน null ดีกว่ารหัสที่ขาด
  if (/^20\d{6}/.test(id) && id.length < 15) return null;
  return id;
}

// 🏦 8. สกัดชื่อธนาคาร
function extractBankName(text) {
  const infoIndex = text.search(/ข้อมูลเพิ่มเติมจากผู้ให้บริการ/i);
  const scopedText = infoIndex !== -1 ? text.slice(0, infoIndex) : text;

  const banks = [
    { pattern: /KBank|กสิกร|K\+/i, name: 'ธนาคารกสิกรไทย' },
    { pattern: /SCB|ไทยพาณิชย์/i, name: 'ธนาคารไทยพาณิชย์' },
    { pattern: /BBL|กรุงเทพ/i, name: 'ธนาคารกรุงเทพ' },
    { pattern: /Krungthai|กรุงไทย|KTB/i, name: 'ธนาคารกรุงไทย' },
    { pattern: /TTB|ทหารไทยธนชาต/i, name: 'ธนาคารทีทีบี' },
    { pattern: /BAY|KMA|Krungsri|krungsri|กรุงศรี/i, name: 'ธนาคารกรุงศรีอยุธยา' },
  ];

  const findBank = (src) => {
    let best = null;
    for (const { pattern, name } of banks) {
      const m = src.match(pattern);
      if (m && (best === null || m.index < best.index)) best = { index: m.index, name };
    }
    return best && best.name;
  };

  // 1) ค้นเฉพาะส่วนก่อน "ข้อมูลเพิ่มเติม" (กันชื่อธนาคารของผู้รับ เช่น (KTB) มาแย่ง)
  const scoped = findBank(scopedText);
  if (scoped) return scoped;

  // 2) ลายเซ็นสลิป SCB Easy: หัว "Successful payment" / "เติมเงินสำเร็จ" + รหัสอ้างอิงขึ้นต้น yyyymmdd
  //    (เดาจากรูปแบบ ตั้งอยู่บนสลิป SCB 2 ใบ ถ้าไม่มั่นใจให้ลบข้อนี้ทิ้งแล้วปล่อย null)
  if (/(successful payment|เติมเงินสำเร็จ|ทำรายการสำเร็จ)/i.test(scopedText) &&
      /(Ref ID|รหัสอ้างอิง)[\s:]*20\d{6}/i.test(scopedText)) {
    return 'ธนาคารไทยพาณิชย์';
  }

  // 3) ค้นทั้งข้อความ ก่อนถอยไป PromptPay
  const full = findBank(text);
  if (full) return full;

  if (/PromptPay|พร้อมเพย์/i.test(scopedText)) return 'PromptPay';
  return null;
}

// 💰 9. สกัดยอดรวมจากข้อความ OCR ด้วย regex (รองรับใบเสร็จ/สลิป)
function extractTotal(text) {
  const patternGroups = [
    {
      priority: 3,
      regex: /(?:ยอดชำระสุทธิ|ยอด\s*ส[ุูิ]?\s*ท\S*|รวมสุทธิ|\bamount\b|net\s*total)[^\d\n]{0,20}(?:\d+\s*(?:ชิ้น|ชั้น|รายการ)\s*)?([\d,]+\.\d{1,2}|[\d,]+)/gi,
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

// 💵 9.5 สกัดตาราง VAT breakdown แบบใบกำกับภาษี (VAT% Net.Amt VAT Amount)
// รองรับ 2 รูปแบบ: มี % ครบ (4 ตัวเลข: percent netAmt vatAmt amount)
// หรือไม่มี % เพราะ OCR อ่านตกหล่น (3 ตัวเลข: netAmt vatAmt amount)
function extractVatTable(rawText, total) {
  if (!/VAT/i.test(rawText)) return null;

  const flat = rawText.replace(/\n/g, ' ');

  const regexWithPercent = /\b[Vv]?\s*(\d{1,2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\b/g;
  const regexNoPercent = /Net\.?\s*Amt[^\d]*Amount\s*([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})/i;

  const results = [];

  let match;
  while ((match = regexWithPercent.exec(flat)) !== null) {
    results.push({
      percent: parseFloat(match[1]),
      netAmt: parseFloat(match[2].replace(/,/g, '')),
      vatAmt: parseFloat(match[3].replace(/,/g, '')),
      amount: parseFloat(match[4].replace(/,/g, '')),
    });
  }

  const noPercentMatch = flat.match(regexNoPercent);
  if (noPercentMatch) {
    results.push({
      percent: null,
      netAmt: parseFloat(noPercentMatch[1].replace(/,/g, '')),
      vatAmt: parseFloat(noPercentMatch[2].replace(/,/g, '')),
      amount: parseFloat(noPercentMatch[3].replace(/,/g, '')),
    });
  }

  if (results.length === 0) return null;

  const valid = results.find((r) => {
    const internallyConsistent = Math.abs((r.netAmt + r.vatAmt) - r.amount) < 0.5;
    const matchesReceiptTotal = !total || total <= 0 || Math.abs(r.amount - total) < 0.5;
    const plausiblePercent = r.percent === null || (r.percent >= 0 && r.percent <= 15);
    return internallyConsistent && matchesReceiptTotal && plausiblePercent;
  });
  return valid || null;
}

// 💵 9.6 สกัดยอด VAT หรือ Service Charge แบบบรรทัดเดี่ยว (fallback เมื่อไม่มีตาราง)
// เช่น "VAT 15.00", "Service Charge 50.00", "ค่าบริการ 10%  50.00"
function extractLabeledAmount(rawText, keywordRegex) {
  const lines = rawText.split('\n').map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (!keywordRegex.test(line)) continue;
    const cleaned = line.replace(/[฿Bb]/g, '');
    const match = cleaned.match(/([\d,]+\.\d{2})/);
    if (match) {
      return parseFloat(match[1].replace(/,/g, ''));
    }
  }
  return null;
}

const VAT_KEYWORDS = /(VAT|ภาษีมูลค่าเพิ่ม|ภาษี)/i;
const SC_KEYWORDS = /(Service\s*Charge|S\.?C\.?\b|ค่าบริการ)/i;

// 💵 9.7 ฟังก์ชันหลัก: ดึง net / vat / serviceCharge ออกจากใบเสร็จ
// ถ้าบิลไม่ได้แยก VAT/SC (หรือรวมในราคาสินค้าแล้ว) -> คืนค่า 0 ทั้งคู่ ตามที่ต้องการ
function extractVatAndServiceCharge(rawText, total) {
  let vat = 0;
  let serviceCharge = 0;
  let netAmount = null;

  const table = extractVatTable(rawText, total);
  if (table) {
    vat = table.vatAmt;
    netAmount = table.netAmt;
  } else {
    const labeledVat = extractLabeledAmount(rawText, VAT_KEYWORDS);
    if (labeledVat !== null) vat = labeledVat;
  }

  const labeledSc = extractLabeledAmount(rawText, SC_KEYWORDS);
  if (labeledSc !== null) serviceCharge = labeledSc;

  // ถ้ายังไม่รู้ net amount ให้คำนวณจาก total - vat - sc
  if (netAmount === null) {
    netAmount = parseFloat((total - vat - serviceCharge).toFixed(2));
    if (netAmount < 0) netAmount = total; // กันเคสข้อมูลผิดเพี้ยนจน net ติดลบ
  }

  return { netAmount, vat, serviceCharge };
}

// 🧺 10. สกัดรายการสินค้า (Line Items) จากใบเสร็จ — รองรับหลายรูปแบบ
function extractLineItems(parsedText) {
  if (!parsedText) return [];
  let lines = parsedText.split('\n').map((l) => l.trim()).filter(Boolean);
  // ส่วนหลังบรรทัดยอดรวม (ตาราง VAT, เงินสด, ฯลฯ) ไม่ใช่สินค้า
  let cutoff = lines.findIndex((l) => /^(total\b|sub\s*total|ยอด|รวมทั้ง|รวมสุทธิ)/i.test(l));

  // สำรอง: บรรทัดก่อน "Cash / เงินสด" คือบรรทัดยอดรวมเสมอ แม้ OCR จะอ่านคำว่า Total เป็นขยะ
  const cashIdx = lines.findIndex((l) => /^(cash|เง.{0,3}สด)/i.test(l));
  if (cashIdx > 0 && /\d[\d,]*\.\d{2}\s*\S{0,2}$/.test(lines[cashIdx - 1])) {
   const c = cashIdx - 1;
    if (cutoff === -1 || c < cutoff) cutoff = c;
  }
  if (cutoff > 0) lines = lines.slice(0, cutoff);
  const items = [];
  const usedLineIdx = new Set();

  // บรรทัดที่ไม่ใช่รายการสินค้าแน่ๆ (header/footer/ยอดรวม/ส่วนลด/metadata)
  const noiseRegex = /(ใบเสร็จ|พนักงาน|ระบบขายหน้าร้าน|เสริฟในร้าน|รวมทั้งหมด|ยอดรวม|ยอดสุทธิ|ยอดชำระ|ส่วนลด|รวมส่วนลด|ภาษี|VAT|Tax\b|Subtotal|Total\b|Net\s*Amount|เงินทอน|เงินสด|Cash|Change|ไทยช่วยไทย|THANK YOU|Tax Invoice|โต๊ะ|Table|เวลา|วันที่|Tran{1,2}\s*ID|โทร|Tel\b|^[A-Z]{2,}#|^\d+[-=|]\d|บริการ|Service\s*Charge|ขอบคุณ|^ยอด)/i;
  const pureNumberLine = /^[\$8฿]?[\d,]+\.\d{2}$/;
  // หัวข้อหมวดหมู่ในใบเสร็จ (เช่น "เครื่องดื่ม 10%", "อาหาร") ไม่ใช่ตัวสินค้า
  const sectionHeaderRegex = /^(เครื่องดื่ม|อาหาร|ของหวาน|อื่นๆ|ทั่วไป|Beverages?|Foods?|Drinks?)\s*(\(?\d+\s*%\)?)?$/i;

  const pureNumbersRowRegex = /^[\d,\s]+\.\d{2}(?:\s+[\d,]+\.\d{2}){1,3}$/;
  const manyMoneyRow = /(\d[\d,]*\.\d{2}\D+){2,}\d[\d,]*\.\d{2}/;
  const isNoiseLine = (line) => noiseRegex.test(line) || sectionHeaderRegex.test(line) || pureNumberLine.test(line) || pureNumbersRowRegex.test(line) || manyMoneyRow.test(line);
  // ---------- Pattern A: ชื่ออยู่บรรทัดก่อนหน้า, "qty x unitPrice" อยู่คนละบรรทัด ----------
  // เช่น "A ซุปกระดูกหมูหม่าล่าเผ็ดกลาง" แล้วบรรทัดถัดมา "0.725 x ฿290.00"
  const qtyPriceRegex = /^(\d+(?:\.\d+)?)\s*[xX×]\s*[฿Bb]?\s*([\d,]+\.\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qtyMatch = line.match(qtyPriceRegex);
    if (!qtyMatch) continue;

    const qty = parseFloat(qtyMatch[1]);
    const unitPriceStr = stripMisreadBahtSymbol(qtyMatch[2]);
    const unitPrice = parseFloat(unitPriceStr);
    if (isNaN(qty) || isNaN(unitPrice)) continue;

    let name = '';
    let nameIdx = -1;
    for (let j = i - 1; j >= 0 && j >= i - 3; j--) {
      if (usedLineIdx.has(j)) continue;
      const candidate = lines[j];
      if (isNoiseLine(candidate) || candidate.length < 3) continue;
      name = candidate;
      nameIdx = j;
      break;
    }

    if (name) {
      name = name.replace(/\s+[฿8Bb]?[\d,]+\.\d{2}.*$/, '').trim();
      items.push({ name, quantity: qty, price: parseFloat((qty * unitPrice).toFixed(2)) });
      usedLineIdx.add(i);
      if (nameIdx !== -1) usedLineIdx.add(nameIdx);
    }
  }

  // ---------- Pattern B: ตารางอยู่บรรทัดเดียว "ชื่อสินค้า  จำนวน  ราคาต่อหน่วย  ราคารวม" ----------
  // เช่น "LEO 3 ขวด   1   179.00   179.00" หรือ "น้ำ   2   15.00   30.00"
  const tableRowRegex = /^(.+?)\s+(\d+(?:\.\d+)?)\s+([\d,]+\.\d{2})\s+([\d,]+\.\d{2})\s*$/;

  for (let i = 0; i < lines.length; i++) {
    if (usedLineIdx.has(i)) continue;
    const line = lines[i];
    if (isNoiseLine(line)) continue;

    const rowMatch = line.match(tableRowRegex);
    if (!rowMatch) continue;

    const [, rawName, qtyStr, , totalStr] = rowMatch;
    const name = rawName.trim();
    if (name.length < 2 || isNoiseLine(name)) continue;

    const qty = parseFloat(qtyStr);
    const total = parseFloat(stripMisreadBahtSymbol(totalStr));
    if (isNaN(qty) || isNaN(total)) continue;

    items.push({ name, quantity: qty, price: total });
    usedLineIdx.add(i);
  }

  // ---------- Pattern C: บรรทัดเดียว "ชื่อสินค้า  ราคา" แบบง่าย (จำนวน = 1) ----------
  // รองรับตัวอักษรต่อท้ายราคา เช่น "V" (VAT-applicable marker) ที่ใบเสร็จบางร้านใส่ไว้
  const simpleRowRegex = /^(.+?)\s+([\d,]+\.\d{2})\s*([A-Za-zก-๙])?\s*$/;
  if (items.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLineIdx.has(i)) continue;
      const line = lines[i];
      if (isNoiseLine(line)) continue;

      const rowMatch = line.match(simpleRowRegex);
      if (!rowMatch) continue;

      const [, rawName, priceStr, marker] = rowMatch;
      if (marker && /[Nnนมผ]/.test(marker)) continue; // 0.00N (แต้ม/สิทธิ์) ที่ OCR อ่านเป็น ม/ผ
      let name = rawName.trim().replace(/^\d+[-.]\s*/, '');

      // "1 ขนมรีบกุ้ง" -> quantity 1, name "ขนมรีบกุ้ง"
      let quantity = 1;
      const qtyPrefix = name.match(/^(\d{1,2})\s+(\S.*)$/);
      if (qtyPrefix) {
        quantity = parseInt(qtyPrefix[1], 10);
        name = qtyPrefix[2].trim();
      }

      if (name.length < 3 || isNoiseLine(name) || /^\d+$/.test(name)) continue;

      const price = parseFloat(stripMisreadBahtSymbol(priceStr));
      if (isNaN(price)) continue;

      items.push({ name, quantity, price });
      usedLineIdx.add(i);
    }
  }

  // ---------- Fallback เดิม: ใบเสร็จรูปแบบเก่าที่มี header "รายการสินค้า" ชัดเจน ----------
  if (items.length === 0) {
    let isItemSection = false;
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (/รายการสินค้า/i.test(line)) {
        isItemSection = true;
        continue;
      }
      if (isItemSection && /(ยอด|สุทธิ|เงินสด|เงินทอน|total|net)/i.test(line)) {
        break;
      }
      if (isItemSection) {
        const match = line.match(/^(\d+\s+)?(.+?)\s+([\d,]+\.\d{2})/);
        if (match) {
          const qty = match[1] ? parseInt(match[1].trim(), 10) : 1;
          const name = match[2].trim();
          const price = parseFloat(match[3].replace(/,/g, ''));
          if (name && !isNaN(price)) {
            items.push({ name, quantity: qty, price });
          }
        }
      }
    }
  }

  // ตัดรายการราคา 0 ออก (แต้มสะสม, M-Stamp, ภารกิจ, สิทธิ์แลกซื้อ ฯลฯ)
  return items.filter((it) => it.price > 0 && !/ภารกิ|M-?Stamp|สิทธิ์?แลก/i.test(it.name));
}

// 📅 11. เดาว่าปี 2 หลักเป็น ค.ศ. หรือ พ.ศ. โดยเทียบกับปีปัจจุบัน
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

// 📅 12. สกัดวันที่จากข้อความ OCR
function extractDate(text) {
  // แก้ OCR อ่านเดือนไทยแบบย่อผิดบ่อย เช่น "ก.ุย." ที่จริงคือ "ก.ย." (มีสระ ุ แทรกผิดระหว่างจุด)
  text = text.replace(/([ก-๙])\.\s*ุ?\s*([ก-๙])\./g, '$1.$2.');
  const monthsEn = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  // 1. รูปแบบสลิปภาษาอังกฤษ เช่น "29 Aug 26 12:49 PM" หรือ "29 Aug 2026"
  // เวลาบนสลิปเป็นเวลาไทย (UTC+7) -> ลบ 7 ชั่วโมงก่อนเก็บเป็น UTC
  // รองรับ AM/PM (12:49 PM = 12:49, 01:05 PM = 13:05, 12:10 AM = 00:10)
  const enMatch = text.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?:\s*([AaPp][Mm]))?)?/i);
  if (enMatch) {
    let [, day, monthStr, yearStr, hours, minutes, ampm] = enMatch;
    const month = monthsEn[monthStr.toLowerCase()];
    if (month !== undefined) {
      let year = parseInt(yearStr, 10);
      if (year < 100) year += 2000;
      let h = hours ? parseInt(hours, 10) : 0;
      const m = minutes ? parseInt(minutes, 10) : 0;
      if (ampm) {
        const isPm = ampm.toLowerCase() === 'pm';
        if (isPm && h < 12) h += 12;
        if (!isPm && h === 12) h = 0;
      }
      return new Date(Date.UTC(year, month, parseInt(day, 10), h - 7, m)).toISOString();
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

function cleanMerchantLabel(s) {
  return (s || '')
    .replace(/^(?:\u0E44\u0E1B\u0E22\u0E31\u0E07|\u0E16\u0E36\u0E07)[\s:：]*/, '')
    .replace(/^TO(?:\s*[:：]\s*|\s+)/i, '')
    .trim();
}

// ---------- Parse ข้อความ OCR (แยกออกมาเพื่อให้ evalOcr.js เรียกตรงได้) ----------
exports.parseText = (raw) => {
  let rawText = (raw || '').trim().normalize('NFC')
   .replace(/\u0E4D\u0E32/g, '\u0E33')
   .replace(/\u0E40\u0E40/g, '\u0E41')   // เ + เ -> แ
   .replace(/พร้อม[เแ]{1,2}พย์/gi, 'พร้อมเพย์');
  rawText = applyMerchantCorrections(rawText);

  // 1. กำหนด parsedText จาก rawText
  const parsedText = rawText;

  // 2. ตรวจจับประเภทเอกสาร และวิธีชำระเงิน
  const { documentType, paymentMethod } = detectDocumentTypeAndPaymentMethod(rawText);

  // 3. ดึงข้อมูล Merchant, Total และ Items แยกตามประเภทเอกสาร
  let total = 0;
  let merchant = '';
  let items = [];
  let netAmount = 0;
  let vat = 0;
  let serviceCharge = 0;

  if (documentType === 'slip' || documentType === 'transfer_slip') {
    total = extractAmountFromSlip(rawText) || extractTotal(rawText) || 0;
    merchant = extractRecipientFromSlip(rawText) || extractMerchant(rawText);
    netAmount = total;
  } else {
    total = extractReceiptTotalAmount(rawText) || extractTotal(rawText) || 0;
    merchant = extractReceiptMerchant(rawText) || extractMerchant(rawText);
    items = extractLineItems(parsedText);

    const vatScResult = extractVatAndServiceCharge(rawText, total);
    netAmount = vatScResult.netAmount;
    vat = vatScResult.vat;
    serviceCharge = vatScResult.serviceCharge;
  }

  merchant = cleanMerchantLabel(merchant);
  // 4. Metadata อื่นๆ
  const date = extractDate(rawText);
  const bankName = extractBankName(rawText);
  const transactionId = extractTransactionId(rawText);
  const categoryId = 1;

  return {
    success: true,
    merchant, total, netAmount, vat, serviceCharge, date,
    parsedText, items, documentType, paymentMethod,
    bankName, transactionId, categoryId,
  };
};

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

  let rawOcr = '';
  let confidence = 100;
  try {
    ({ rawText: rawOcr, confidence } = await recognizeText(inputImage));
  } catch (err) {
    console.error('❌ OCR error:', err.message);
    throw new Error('ไม่สามารถประมวลผล OCR ได้ กรุณาลองใหม่อีกครั้ง หรือถ่ายรูปให้ชัดเจนขึ้น');
  }

  if (!rawOcr) {
    throw new Error('อ่านข้อความจากรูปไม่ได้เลย กรุณาถ่ายรูปให้ชัดเจนขึ้นและมีแสงเพียงพอ');
  }

  const result = exports.parseText(rawOcr);

  if (shouldUseAI(result, confidence)) {
    const aiItems = await fixItemsWithAI(inputImage, result);
    if (aiItems) {
      result.items = aiItems;
      result.aiAssisted = true;
    }
  }

  console.log(`[scan] conf=${confidence?.toFixed?.(1)} ai=${!!result.aiAssisted} items=${JSON.stringify(result.items)}`);
  return result;
};