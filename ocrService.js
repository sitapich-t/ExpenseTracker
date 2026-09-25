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

// 🔍 1. ฟังก์ชันจำแนกประเภทเอกสาร (รองรับ SCB / Kept / K+)
function detectDocumentTypeAndPaymentMethod(rawText) {
  if (!rawText) return { documentType: 'receipt', paymentMethod: 'cash' };
  const text = rawText.toLowerCase();

  const slipKeywords = [
    'successful transfer', 'transaction successful', 'transfer successful',
    'payment completed', 'transfer completed', 'top-up completed',
    'scan to verify', 'scan for verify', 'verify the transfer status',
    'ref id', 'transaction id', 'โอนแล้ว', 'โอนเงินสำเร็จ', 'ทำรายการสำเร็จ', 'ชำระเงินสำเร็จ'
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

  for (const line of lines) {
    if (ignoreKeywords.test(line)) continue;
    if (line.length > 2 && !/^[\d\s\W]+$/.test(line)) {
      return line;
    }
  }
  return '';
}

// 🧾 3. สกัดยอดเงินจากใบเสร็จ (แก้ปัญหา ฿ กลายเป็นเลข 8)
function extractReceiptTotalAmount(rawText) {
  if (!rawText) return 0;
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const totalLine = lines.find(l => /(?:รวมทั้งหมด|รวมทั้งสิ้น|ยอดรวม|Total|Net Amount)/i.test(l));

  if (totalLine) {
    let cleanedLine = totalLine
      .replace(/[฿Bb]/g, '')
      .replace(/รวมทั้งหมด|รวมทั้งสิ้น|ยอดรวม|Total|Net Amount/gi, '');

    const match = cleanedLine.match(/(\d+(?:\,\d+)*\.\d{2})/);
    if (match) {
      let amountStr = match[1].replace(/,/g, '');
      if (amountStr.length > 6 && amountStr.startsWith('8')) {
        amountStr = amountStr.substring(1);
      }
      return parseFloat(amountStr);
    }
  }
  return 0;
}

// 📄 4. สกัดชื่อผู้รับจากสลิปโอนเงิน
function extractRecipientFromSlip(rawText) {
  if (!rawText) return '';
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // กรณี SCB/Kept ที่มีคำว่า TO / To
  const toIndex = lines.findIndex(l => /^TO$/i.test(l) || /^To$/i.test(l));
  if (toIndex !== -1 && toIndex + 1 < lines.length) {
    const recipientLine = lines[toIndex + 1];
    if (!/^[\d\-xX=]{6,}$/i.test(recipientLine)) return recipientLine;
  }

  // กรณี K+ อ่านย้อนยึดจากตำแหน่งผู้โอน
  let senderEndIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/KBank|Kasikorn/i.test(lines[i]) || /x{2,}/i.test(lines[i]) || /^[\d\-xX=]{6,}$/i.test(lines[i])) {
      senderEndIndex = i;
    }
  }

  if (senderEndIndex !== -1 && senderEndIndex + 1 < lines.length) {
    const recipientLines = [];
    for (let i = senderEndIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:Transaction ID|Amount|Fee|เลขที่รายการ|จำนวนเงิน|Ref ID)/i.test(line)) break;
      if (/^[\d\s\-]{7,}$/.test(line)) break;
      if (/^(?:[A-Z0-9]{10,}|LICENSED|COPYRIGHT)/i.test(line)) break;
      if (/^PromptPay ID$/i.test(line)) continue;
      if (line.length <= 2 || /^[\=\+\-\*\.\_]+$/.test(line)) continue;

      recipientLines.push(line);
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

// 🔢 7. สกัด Transaction ID
function extractTransactionId(text) {
  const match = text.match(/(?:Transaction\s*ID|เลขที่รายการ|รหัสอ้างอิง)[\s:]*([A-Za-z0-9]+)/i);
  return match ? match[1] : null;
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

// 💰 9. สกัดยอดรวมจากข้อความ OCR ด้วย regex (รองรับใบเสร็จ/สลิป)
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
// ช่วยแก้ปัญหา OCR อ่านสัญลักษณ์ ฿ ผิดเป็นตัวเลข "8" นำหน้า (พบบ่อยกับฟอนต์ใบเสร็จเทอร์มอล)
// ใช้ heuristic เดียวกับที่ extractReceiptTotalAmount ใช้อยู่แล้ว: ตัวเลขยาวผิดปกติ + ขึ้นต้นด้วย 8
function stripMisreadBahtSymbol(numStr) {
  if (numStr.length > 6 && numStr.startsWith('8')) {
    return numStr.substring(1);
  }
  return numStr;
}

// 🧺 10. สกัดรายการสินค้า (Line Items) จากใบเสร็จ — รองรับหลายรูปแบบ
function extractLineItems(parsedText) {
  if (!parsedText) return [];
  const lines = parsedText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  const usedLineIdx = new Set();

  // บรรทัดที่ไม่ใช่รายการสินค้าแน่ๆ (header/footer/ยอดรวม/ส่วนลด/metadata)
  const noiseRegex = /(ใบเสร็จ|พนักงาน|ระบบขายหน้าร้าน|เสริฟในร้าน|รวมทั้งหมด|ยอดรวม|ยอดสุทธิ|ยอดชำระ|ส่วนลด|รวมส่วนลด|ภาษี|VAT|Tax\b|Subtotal|Total\b|Net\s*Amount|เงินทอน|เงินสด|Cash|Change|ไทยช่วยไทย|THANK YOU|Tax Invoice|โต๊ะ|Table|เวลา|วันที่|Tran{1,2}\s*ID|โทร|Tel\b|^[A-Z]{2,}#|^\d+[-=|]|บริการ|Service\s*Charge|ขอบคุณ)/i;
  const pureNumberLine = /^[\$8฿]?[\d,]+\.\d{2}$/;
  // หัวข้อหมวดหมู่ในใบเสร็จ (เช่น "เครื่องดื่ม 10%", "อาหาร") ไม่ใช่ตัวสินค้า
  const sectionHeaderRegex = /^(เครื่องดื่ม|อาหาร|ของหวาน|อื่นๆ|ทั่วไป|Beverages?|Foods?|Drinks?)\s*(\(?\d+\s*%\)?)?$/i;

  const isNoiseLine = (line) => noiseRegex.test(line) || sectionHeaderRegex.test(line) || pureNumberLine.test(line);

  // ---------- Pattern A: ชื่ออยู่บรรทัดก่อนหน้า, "qty x unitPrice" อยู่คนละบรรทัด ----------
  // เช่น "A ซุปกระดูกหมูหม่าล่าเผ็ดกลาง" แล้วบรรทัดถัดมา "0.725 x ฿290.00"
  const qtyPriceRegex = /^(\d+(?:\.\d+)?)\s*[xX×]\s*[฿Bb]?\s*([\d,]+\.\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qtyMatch = line.match(qtyPriceRegex);
    if (!qtyMatch) continue;

    const qty = parseFloat(qtyMatch[1]);
    const unitPriceStr = stripMisreadBahtSymbol(qtyMatch[2].replace(/,/g, ''));
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
    const total = parseFloat(stripMisreadBahtSymbol(totalStr.replace(/,/g, '')));
    if (isNaN(qty) || isNaN(total)) continue;

    items.push({ name, quantity: qty, price: total });
    usedLineIdx.add(i);
  }

  // ---------- Pattern C: บรรทัดเดียว "ชื่อสินค้า  ราคา" แบบง่าย (จำนวน = 1) ----------
  // ใช้เป็นตัวสุดท้ายเพราะกว้างสุด เสี่ยง false-positive มากสุด จึงกรอง noise เข้มงวดก่อน
  const simpleRowRegex = /^(.+?)\s+([\d,]+\.\d{2})\s*$/;

  if (items.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLineIdx.has(i)) continue;
      const line = lines[i];
      if (isNoiseLine(line)) continue;

      const rowMatch = line.match(simpleRowRegex);
      if (!rowMatch) continue;

      const [, rawName, priceStr] = rowMatch;
      const name = rawName.trim();
      if (name.length < 3 || isNoiseLine(name) || /^\d+$/.test(name)) continue;

      const price = parseFloat(stripMisreadBahtSymbol(priceStr.replace(/,/g, '')));
      if (isNaN(price)) continue;

      items.push({ name, quantity: 1, price });
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

  return items;
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
      logger: () => {},
    });

    const psmModesToTry = [
      Tesseract.PSM.SINGLE_BLOCK, // 6: บังคับอ่านบรรทัดซ้ายไปขวา
      Tesseract.PSM.AUTO_LAYOUT,  // 1: Auto detection
      Tesseract.PSM.SINGLE_COLUMN // 4: ตัวสำรอง
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
    rawText = rawText.replace(/\u0E4D\u0E32/g, '\u0E33');
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

  // 1. กำหนด parsedText จาก rawText
  const parsedText = rawText;

  // 2. ตรวจจับประเภทเอกสาร และวิธีชำระเงิน (รองรับ SCB / Kept / K+ / ใบเสร็จ)
  const { documentType, paymentMethod } = detectDocumentTypeAndPaymentMethod(rawText);

  // 3. ดึงข้อมูล Merchant, Total และ Items แยกตามประเภทเอกสาร
  let total = 0;
  let merchant = '';
  let items = [];

  if (documentType === 'slip' || documentType === 'transfer_slip') {
    // 📄 Logic สำหรับสลิปโอนเงิน (K+, SCB, Kept, Krungthai ฯลฯ)
    total = extractAmountFromSlip(rawText) || extractTotal(rawText) || 0;
    merchant = extractRecipientFromSlip(rawText) || extractMerchant(rawText);
  } else {
    // 🧾 Logic สำหรับใบเสร็จซื้อสินค้าปกติ (เช่น ร้าน Yo-i, POS หน้าร้าน)
    total = extractReceiptTotalAmount(rawText) || extractTotal(rawText) || 0;
    merchant = extractReceiptMerchant(rawText) || extractMerchant(rawText);
    items = extractLineItems(parsedText);
    console.log('🧺 Extracted items:', JSON.stringify(items, null, 2));
  }

  // 4. ดึงข้อมูล Metadata อื่นๆ
  const date = extractDate(rawText);
  const bankName = extractBankName(rawText);
  const transactionId = extractTransactionId(rawText);
  const categoryId = 1; // หมวดหมู่เริ่มต้น

  console.log('=== RAW OCR TEXT ===');
  console.log(rawText);
  console.log('====================');

  // 5. ส่ง Plain Object กลับออกไป
  return {
    success: true,
    merchant: merchant,
    total: total,
    date: date,
    parsedText: parsedText,
    items: items,
    documentType: documentType,
    paymentMethod: paymentMethod,
    bankName: bankName,
    transactionId: transactionId,
    categoryId: categoryId,
  };
};