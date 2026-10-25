// ==========================================
// OCR & Receipt / Slip Scanning Service
// ใช้ Tesseract.js (OCR แบบ open-source)
//
// ติดตั้งเพิ่ม: npm i sharp
//
// โครงสร้าง:
//   runOcr(input, opts)   -> preprocess + OCR (ปรับ parameter ได้ผ่าน opts)
//   parseText(rawText)    -> แปลงข้อความดิบเป็นฟิลด์ (ทดสอบได้โดยไม่ต้องรัน OCR)
//   scanReceipt(...)      -> เรียกสองอย่างข้างบนต่อกัน (API เดิม)
// ==========================================

const Tesseract = require('tesseract.js');
const sharp = require('sharp');

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

// ==========================================
// ⚙️ OCR options (ปรับ/ทดสอบผ่าน grid search ได้)
// ==========================================
// หมายเหตุ: ค่า default ด้านล่างยังไม่ได้ยืนยันด้วยข้อมูลจริงชุดใหญ่
// ให้รัน tests/ocrAccuracy.js แล้วแทนค่าตามผลที่ดีที่สุดบน dev set
const DEFAULT_OPTS = {
  psmModes: [11],
  scale: 2,
  preprocess: 'threshold',
  maxWidth: 3200,
  dpi: 300,
};

// ---------- Shared worker (ไม่สร้างใหม่ทุก request) ----------
let sharedWorker = null;
let workerPromise = null;
let ocrQueue = Promise.resolve(); // ทำทีละงาน กัน setParameters ชนกัน

async function getWorker() {
  if (sharedWorker) return sharedWorker;
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('tha+eng', 1, { logger: () => {} })
      .then((w) => {
        sharedWorker = w;
        return w;
      })
      .catch((err) => {
        workerPromise = null;
        throw err;
      });
  }
  return workerPromise;
}

async function resetWorker() {
  const w = sharedWorker;
  sharedWorker = null;
  workerPromise = null;
  if (w) {
    try {
      await w.terminate();
    } catch (_) {
      /* ignore */
    }
  }
}

// ---------- Preprocessing ----------
async function preprocessImage(input, opts) {
  if (opts.preprocess === 'none' && opts.scale === 1) return input;

  try {
    let img = sharp(input).rotate(); // เคารพ EXIF orientation
    const meta = await img.metadata();

    if (opts.scale && opts.scale !== 1 && meta.width) {
      const targetWidth = Math.min(Math.round(meta.width * opts.scale), opts.maxWidth);
      img = img.resize({ width: targetWidth, kernel: 'cubic' });
    }

    if (opts.preprocess !== 'none') {
      img = img.grayscale().normalize();
      if (opts.preprocess === 'gray') img = img.sharpen();
      if (opts.preprocess === 'threshold') img = img.sharpen().threshold(150);
    }

    return await img.png().toBuffer();
  } catch (err) {
    console.warn('⚠️ preprocess ล้มเหลว ใช้ภาพต้นฉบับแทน:', err.message);
    return input;
  }
}

// ---------- OCR หลัก ----------
async function runOcr(input, options = {}) {
  const opts = { ...DEFAULT_OPTS, ...options };

  const job = ocrQueue.then(async () => {
    try {
      const worker = await getWorker();
      const image = await preprocessImage(input, opts);

      let best = null;
      for (const psm of opts.psmModes) {
        await worker.setParameters({
          tessedit_pageseg_mode: String(psm),
          preserve_interword_spaces: '1',
          user_defined_dpi: String(opts.dpi),
        });
        const { data } = await worker.recognize(image);
        if (!best || data.confidence > best.confidence) best = data;
      }
      return best;
    } catch (err) {
      await resetWorker(); // worker อาจพัง สร้างใหม่ในรอบหน้า
      throw err;
    }
  });

  ocrQueue = job.catch(() => {});
  return job;
}

// ใช้ตอนปิดโปรเซส/จบสคริปต์ทดสอบ
async function shutdown() {
  await resetWorker();
}

// ==========================================
// 🔍 1. ฟังก์ชันจำแนกประเภทเอกสาร (รองรับ SCB / Kept / K+ / กรุงไทย)
// ==========================================
function detectDocumentTypeAndPaymentMethod(rawText) {
  if (!rawText) return { documentType: 'receipt', paymentMethod: 'cash' };
  const text = rawText.toLowerCase();

  const slipKeywords = [
    'successful transfer', 'transaction successful', 'transfer successful',
    'payment completed', 'transfer completed', 'top-up completed',
    'scan to verify', 'scan for verify', 'verify the transfer status',
    'ref id', 'transaction id', 'โอนแล้ว', 'โอนเงินสำเร็จ', 'ทำรายการสำเร็จ', 'ชำระเงินสำเร็จ',
    // เพิ่มเพื่อรองรับกรณี OCR อ่านหัวสลิปไม่ได้ (เช่น สลิปกรุงไทย)
    'รหัสอ้างอิง', 'ค่าธรรมเนียม', 'วันที่ทำรายการ'
  ];

  const isSlip = slipKeywords.some(kw => text.includes(kw)) ||
                 (text.includes('from') && text.includes('to') && text.includes('amount'));

  if (isSlip) {
    return { documentType: 'slip', paymentMethod: 'bank_transfer' };
  }
  return { documentType: 'receipt', paymentMethod: 'cash' };
}

// ==========================================
// 🔧 Helper: จัดการ "฿ ถูกอ่านเป็น 8"
// ==========================================
// เดิมตัดเลข 8 ทิ้งทุกครั้งที่สตริงยาว > 6 ทำให้ยอดจริง 8,000-8,999 ผิด (เช่น 8500.00 -> 500.00)
// ปรับใหม่: ใบเสร็จที่พิมพ์ยอดหลักพันมักมีเครื่องหมายคอมมา (8,500.00)
// ถ้ามีคอมมา = ตัวเลขจริง ไม่ตัด / ตัดเฉพาะกรณีไม่มีคอมมา + ส่วนจำนวนเต็มยาว >= 4 หลัก + ขึ้นต้นด้วย 8
// ข้อจำกัด: ยอดจริงที่พิมพ์ไม่มีคอมมา เช่น "8500.00" ยังกำกวมอยู่ ต้องตรวจเทียบกับผลรวมรายการ/ตาราง VAT
function stripMisreadBahtSymbol(numStr) {
  if (numStr.includes(',')) return numStr;
  const intPart = numStr.split('.')[0];
  if (intPart.length >= 4 && intPart.startsWith('8')) {
    return numStr.substring(1);
  }
  return numStr;
}

// รับ token ตัวเลขดิบ (ยังมีคอมมา) -> ตัวเลข
function parseAmountToken(token) {
  const fixed = stripMisreadBahtSymbol(token);
  return parseFloat(fixed.replace(/,/g, ''));
}

// ==========================================
// 🧾 2. สกัดชื่อร้านจากใบเสร็จ (ข้ามคำขยะ POS และคำว่า "ระบบขายหน้าร้าน")
// ==========================================
function extractReceiptMerchant(rawText) {
  if (!rawText) return '';
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const ignoreKeywords = /^(ใบเสร็จ|ใบกำกับภาษี|พนักงาน|เจ้าของ|ระบบขายหน้าร้าน|POS|เสิร์ฟ|โต๊ะ|Table|Tax Invoice|Receipt|Welcome)/i;

  // แอป/สกรีนช็อตใบเสร็จบางเจ้ามีบรรทัด "สาขา ..." ชัดเจน
  const branchLine = lines.find((l) => /^สาขา\s*\S+/.test(l));
  if (branchLine) {
    return branchLine.replace(/^สาขา\s*/, '').replace(/\s*(กม)?\.{2,}\s*$/, '').trim();
  }

  for (const line of lines) {
    if (ignoreKeywords.test(line)) continue;
    const letters = (line.match(/[ก-๙a-zA-Z]/g) || []).length;
    if (letters >= 3 && !/^[\d\s\W]+$/.test(line)) {
      return line;
    }
  }
  return '';
}

// ==========================================
// 🧾 3. สกัดยอดเงินจากใบเสร็จ
// ==========================================
function extractReceiptTotalAmount(rawText) {
  if (!rawText) return 0;
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const totalLine = lines.find(l => /(?:รวมทั้งหมด|รวมทั้งสิ้น|ยอดรวม|Total|Net Amount)/i.test(l));

  if (totalLine) {
    const cleanedLine = totalLine
      .replace(/[฿Bb]/g, '')
      .replace(/รวมทั้งหมด|รวมทั้งสิ้น|ยอดรวม|Total|Net Amount/gi, '');

    const match = cleanedLine.match(/(\d+(?:,\d+)*\.\d{2})/);
    if (match) {
      return parseAmountToken(match[1]);
    }
  }
  return 0;
}

// ==========================================
// 📄 4. สกัดชื่อผู้รับจากสลิปโอนเงิน
// ==========================================
function extractRecipientFromSlip(rawText) {
  if (!rawText) return '';
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);

  // กรณี SCB/Kept ที่มีคำว่า TO / To
  const toIndex = lines.findIndex(l => /^TO$/i.test(l));
  if (toIndex !== -1 && toIndex + 1 < lines.length) {
    const recipientLine = lines[toIndex + 1];
    if (!/^[\d\-xX=]{6,}$/i.test(recipientLine)) return recipientLine;
  }

  // เลขบัญชีที่ถูกปิดบัง ต้องมีตัว x อย่างน้อยหนึ่งตัว (เลขล้วนอย่างเลขอ้างอิงไม่นับ)
  const maskedAcct = /^(?=.*[xX])[\dxX\-=*]{6,}$/;
  const letterCount = (s) => (s.match(/[ก-๙a-zA-Z]/g) || []).length;

  // ชื่อผู้รับอยู่หลังเลขบัญชีผู้โอน = บรรทัดแรกที่เป็นเลขบัญชีปิดบัง
  let senderEndIndex = lines.findIndex((l) => maskedAcct.test(l));
  if (senderEndIndex === -1) {
    for (let i = 0; i < lines.length; i++) {
      if (/KBank|Kasikorn/i.test(lines[i])) senderEndIndex = i;
    }
  }

  if (senderEndIndex !== -1 && senderEndIndex + 1 < lines.length) {
    const recipientLines = [];
    for (let i = senderEndIndex + 1; i < lines.length; i++) {
      const line = lines[i];
      if (/(?:Transaction ID|Amount|Fee|เลขที่รายการ|จำนวนเงิน|Ref ID)/i.test(line)) break;
      if (/^[\d\s\-]{7,}$/.test(line)) break;           // เลขอ้างอิงล้วน
      if (maskedAcct.test(line)) break;                  // เลขบัญชีผู้รับ
      if (/^(?:[A-Z0-9]{10,}|LICENSED|COPYRIGHT)/i.test(line)) break;
      if (/^(PromptPay( ID)?|พร้อมเพย์)$/i.test(line)) break;
      // ป้ายกำกับ (รวมกรณี OCR อ่านเพี้ยน เช่น "ไปฮัง" แทน "ไปยัง")
      if (/^(ไปยัง|To|ถึง)$/i.test(line) || /^ไป\S{1,3}$/.test(line)) continue;
      // ขยะจากไอคอน/กราฟิก
      if (letterCount(line) < 4 || /^[=+\-*._]+$/.test(line)) continue;

      recipientLines.push(line);
      if (recipientLines.length >= 2) break;
    }
    if (recipientLines.length > 0) return recipientLines.join(' ');
  }
  return '';
}

// ==========================================
// 📄 5. สกัดยอดเงินจากสลิปโอนเงิน (รองรับ THB และ Baht)
// ==========================================
function extractAmountFromSlip(rawText) {
  if (!rawText) return 0;
  const label = '(?:Amount|AMOUNT|จำนวนเงิน|จานวนเงิน)';

  // 1) มีป้ายกำกับ + ตัวเลขปกติ
  const labeled = rawText.match(new RegExp(`${label}[\\s\\n]*:?[\\s\\n]*([\\d,]+\\.\\d{2})`, 'i'));
  if (labeled) return parseFloat(labeled[1].replace(/,/g, ''));

  // 2) มีป้ายกำกับ แต่ OCR อ่านจุดทศนิยมเป็นช่องว่าง เช่น "55 00 บาท"
  const spaced = rawText.match(new RegExp(`${label}[\\s:]*([\\d,]+)[\\s\\u00A0]{1,3}(\\d{2})\\s*(?:Baht|THB|บาท)`, 'i'));
  if (spaced) return parseFloat(`${spaced[1].replace(/,/g, '')}.${spaced[2]}`);

  // 3) ไม่มีป้ายกำกับ: ตัวเลขที่ตามด้วย Baht/THB/บาท ตัวแรกที่ไม่ใช่ 0 (ข้ามค่าธรรมเนียม 0.00)
  for (const m of rawText.matchAll(/([\d,]+\.\d{2})\s*(?:Baht|THB|บาท)/gi)) {
    const v = parseFloat(m[1].replace(/,/g, ''));
    if (v > 0) return v;
  }
  return 0;
}

// ==========================================
// 🏪 6. สกัดชื่อร้านค้า/ผู้รับโอนเงินจากข้อความ OCR (กรณีทั่วไป ใบเสร็จ/สลิป)
// ==========================================
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
    if (/^\s*(KBank|K\+|SCB|BBL|Krungthai|KTB|TTB|BAY|PromptPay|Payment\s*Completed)\s*[+-]?\s*$/i.test(line)) return false;
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
      // เดินหาแถวถัดไปจนกว่าจะเจอแถวที่ดูเหมือนชื่อจริง
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (looksLikeMerchantCandidate(lines[j])) {
          return lines[j];
        }
      }
    }
  }

  return '';
}

// ==========================================
// 🔢 7. สกัด Transaction ID / Ref ID
// ==========================================
function extractTransactionId(text) {
  const match = text.match(/(?:Transaction\s*ID|Ref(?:erence)?\s*ID|เลขที่รายการ|รห[ัี]สอ้างอิง)[\s:]*([A-Za-z0-9]+)/i);
  if (match) return match[1];

  // fallback: ป้ายกำกับถูก OCR อ่านเพี้ยน (เช่น "หนมายเลขอางอง") จึงจับจากรูปแบบของตัวเลขแทน
  // กรุงศรี: ตัวอักษร 2-4 ตัว + เลขยาว เช่น KSA00000000934007899
  const prefixed = text.match(/\b(?!TAX)[A-Z]{2,4}\d{12,}\b/);
  if (prefixed) return prefixed[0];
  const afterLabel = text.match(/เลขที่อ้างอิง[\s\S]{0,40}?\b(\d{20,})\b/);
  if (afterLabel) return afterLabel[1];
  // ป้าย "Trans ID" ถูกอ่านเป็น "Trans" ... "15:" แล้วตามด้วยเลขยาว
  const afterTrans = text.match(/\bTrans\b[\s\S]{0,15}?\b(\d{12,25})\b/i);
  return afterTrans ? afterTrans[1] : null;
}

// ==========================================
// 🏦 8. สกัดชื่อธนาคาร
// ==========================================
function extractBankName(text) {
  const infoIndex = text.search(/ข้อมูลเพิ่มเติมจากผู้ให้บริการ/i);
  const scopedText = infoIndex !== -1 ? text.slice(0, infoIndex) : text;

  // ใส่ \b กับชื่อย่อภาษาอังกฤษ กันแมตช์กลางคำอื่น (เช่น "bay" ใน "Bayfront")
  const banks = [
    { pattern: /\bKBank\b|กสิกร|K\+/i, name: 'ธนาคารกสิกรไทย' },
    { pattern: /\bSCB\b|ไทยพาณิชย์/i, name: 'ธนาคารไทยพาณิชย์' },
    { pattern: /\bBBL\b|กรุงเทพ/i, name: 'ธนาคารกรุงเทพ' },
    { pattern: /\bKrungthai\b|กรุงไทย|\bKTB\b/i, name: 'ธนาคารกรุงไทย' },
    { pattern: /\bTTB\b|ทหารไทยธนชาต/i, name: 'ธนาคารทีทีบี' },
    { pattern: /\bBAY\b|\bKMA\b|\bKrungsri\b|กรุงศรี/i, name: 'ธนาคารกรุงศรีอยุธยา' },
    { pattern: /ออมสิน|\bGSB\b/i, name: 'ธนาคารออมสิน' },
  ];

  // ค้นหาจาก text เต็ม ไม่ตัด scope เพราะชื่อธนาคารต้นทางมักอยู่หลังจุดตัด
  let best = null;
  for (const { pattern, name } of banks) {
    const match = text.match(pattern);
    if (match && (best === null || match.index < best.index)) {
      best = { index: match.index, name };
    }
  }
  if (best) return best.name;

  // fallback เป็น PromptPay เฉพาะตอนหาชื่อธนาคารเฉพาะไม่เจอเลยจริงๆ
  if (/PromptPay|พร้อมเพย์/i.test(scopedText)) return 'PromptPay';
  return null;
}

// ==========================================
// 💰 9. สกัดยอดรวมจากข้อความ OCR ด้วย regex (รองรับใบเสร็จ/สลิป)
// fixBahtSymbol: เปิดเฉพาะใบเสร็จ (สลิปธนาคารไม่มี ฿ นำหน้ายอด)
// ==========================================
function extractTotal(text, { fixBahtSymbol = false } = {}) {
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
      regex: /(?:ยอดรวม|รวม|\btota[l1i]\b)[^\d-]{0,20}([\d,]+\.\d{1,2}|\d+,\d{2}(?!\d))/gi,
    },
  ];

  const candidates = [];
  for (const { priority, regex } of patternGroups) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const token = match[1];
      const num = fixBahtSymbol && token.includes('.')
        ? parseAmountToken(token)
        : /^\d+,\d{1,2}$/.test(token)
          ? parseFloat(token.replace(',', '.'))   // คอมมาเป็นทศนิยม เช่น 116,70
          : parseFloat(token.replace(/,/g, ''));
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
  // ใบเสร็จที่ ฿ ถูกอ่านเป็น 8 ต่อท้ายยอดสรุป เช่น "202.008" (ยอดรวม, เงินสด, เงินทอน)
  // ตัวแรกที่เจอคือยอดรวม
  if (fixBahtSymbol) {
    const withSymbol = [...text.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})8(?!\d)/g)];
    if (withSymbol.length > 0) return parseFloat(withSymbol[0][1].replace(/,/g, ''));
  }
  // (?!\d{2}) กันไปหยิบเศษของเลขยาว เช่น 1.07 จาก "1.076500002A0161"
  const moneyMatches = [...text.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})(?!\d{2})/g)];
  if (moneyMatches.length > 0) {
    const values = moneyMatches.map(m => parseFloat(m[1].replace(/,/g, ''))).filter(n => n > 0);
    if (values.length > 0) {
      if (fixBahtSymbol) {
        // ใบเสร็จที่หา Total ไม่เจอ: ยอดรวมมักซ้ำกับยอดเงินสดที่จ่าย จึงเลือกค่าที่ซ้ำมากสุด
        const count = new Map();
        for (const v of values) count.set(v, (count.get(v) || 0) + 1);
        const top = Math.max(...count.values());
        if (top >= 2) return values.find((v) => count.get(v) === top);
      }
      return values[0]; // บนสลิป Amount มักมาก่อน Fee
    }
  }

  return 0;
}

// ==========================================
// 💵 9.5 สกัดตาราง VAT breakdown แบบใบกำกับภาษี (VAT% Net.Amt VAT Amount)
// รองรับ 2 รูปแบบ: มี % ครบ (4 ตัวเลข: percent netAmt vatAmt amount)
// หรือไม่มี % เพราะ OCR อ่านตกหล่น (3 ตัวเลข: netAmt vatAmt amount)
// ==========================================
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

// ==========================================
// 💵 9.6 สกัดยอด VAT หรือ Service Charge แบบบรรทัดเดี่ยว (fallback เมื่อไม่มีตาราง)
// เช่น "VAT 15.00", "Service Charge 50.00", "ค่าบริการ 10%  50.00"
// ==========================================
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

// ==========================================
// 💵 9.7 ฟังก์ชันหลัก: ดึง net / vat / serviceCharge ออกจากใบเสร็จ
// ถ้าบิลไม่ได้แยก VAT/SC (หรือรวมในราคาสินค้าแล้ว) -> คืนค่า 0 ทั้งคู่
// ==========================================
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

// ==========================================
// 🧺 10. สกัดรายการสินค้า (Line Items) จากใบเสร็จ — รองรับหลายรูปแบบ
// ==========================================
function extractLineItems(parsedText) {
  if (!parsedText) return [];
  const lines = parsedText.split('\n').map((l) => l.trim()).filter(Boolean);
  const items = [];
  const usedLineIdx = new Set();

  // บรรทัดที่ไม่ใช่รายการสินค้าแน่ๆ (header/footer/ยอดรวม/ส่วนลด/metadata)
  const noiseRegex = /(ใบเสร็จ|พนักงาน|ระบบขายหน้าร้าน|เสริฟในร้าน|รวมทั้งหมด|ยอดรวม|ยอดสุทธิ|ยอดชำระ|ส่วนลด|รวมส่วนลด|ภาษี|VAT|Tax\b|Subtotal|Total\b|Net\s*Amount|เงินทอน|เงินสด|Cash|Change|ไทยช่วยไทย|THANK YOU|Tax Invoice|โต๊ะ|Table|เวลา|วันที่|Tran{1,2}\s*ID|โทร|Tel\b|^[A-Z]{2,}#|^\d+[-=|]\d|บริการ|Service\s*Charge|ขอบคุณ)/i;
  const pureNumberLine = /^[$8฿]?[\d,]+\.\d{2}$/;
  // หัวข้อหมวดหมู่ในใบเสร็จ (เช่น "เครื่องดื่ม 10%", "อาหาร") ไม่ใช่ตัวสินค้า
  const sectionHeaderRegex = /^(เครื่องดื่ม|อาหาร|ของหวาน|อื่นๆ|ทั่วไป|Beverages?|Foods?|Drinks?)\s*(\(?\d+\s*%\)?)?$/i;

  const pureNumbersRowRegex = /^[\d,\s]+\.\d{2}(?:\s+[\d,]+\.\d{2}){1,3}$/;
  const isNoiseLine = (line) =>
    noiseRegex.test(line) || sectionHeaderRegex.test(line) || pureNumberLine.test(line) || pureNumbersRowRegex.test(line);

  // ---------- Pattern A: ชื่ออยู่บรรทัดก่อนหน้า, "qty x unitPrice" อยู่คนละบรรทัด ----------
  // เช่น "A ซุปกระดูกหมูหม่าล่าเผ็ดกลาง" แล้วบรรทัดถัดมา "0.725 x ฿290.00"
  const qtyPriceRegex = /^(\d+(?:\.\d+)?)\s*[xX×]\s*[฿Bb]?\s*([\d,]+\.\d{2})/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const qtyMatch = line.match(qtyPriceRegex);
    if (!qtyMatch) continue;

    const qty = parseFloat(qtyMatch[1]);
    const unitPrice = parseAmountToken(qtyMatch[2]);
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
    const rowTotal = parseAmountToken(totalStr);
    if (isNaN(qty) || isNaN(rowTotal)) continue;

    items.push({ name, quantity: qty, price: rowTotal });
    usedLineIdx.add(i);
  }

  // ---------- Pattern C: บรรทัดเดียว "ชื่อสินค้า  ราคา" แบบง่าย (จำนวน = 1) ----------
  // รองรับตัวอักษรต่อท้ายราคา เช่น "V" (VAT-applicable marker) ที่ใบเสร็จบางร้านใส่ไว้
  const simpleRowRegex = /^(.+?)\s+([\d,]+\.\d{2})\s*[A-Za-z]?\s*$/;
  if (items.length === 0) {
    for (let i = 0; i < lines.length; i++) {
      if (usedLineIdx.has(i)) continue;
      const line = lines[i];
      if (isNoiseLine(line)) continue;

      const rowMatch = line.match(simpleRowRegex);
      if (!rowMatch) continue;

      const [, rawName, priceStr] = rowMatch;
      const name = rawName.trim().replace(/^\d+[-.]\s*/, '');
      if (name.length < 3 || isNoiseLine(name) || /^\d+$/.test(name)) continue;

      const price = parseAmountToken(priceStr);
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

// ==========================================
// 📅 11. เดาว่าปี 2 หลักเป็น ค.ศ. หรือ พ.ศ. โดยเทียบกับปีปัจจุบัน
// ==========================================
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

// ==========================================
// 📅 12. สกัดวันที่จากข้อความ OCR
// ==========================================
function extractDate(text) {
  // แก้ OCR อ่านเดือนไทยแบบย่อผิดบ่อย เช่น "ก.ุย." ที่จริงคือ "ก.ย." (มีสระ ุ แทรกผิดระหว่างจุด)
  text = text.replace(/([ก-๙])\.\s*ุ?\s*([ก-๙])\./g, '$1.$2.');

  // OCR อ่านเดือนไทยย่อเป็นตัวละติน เช่น "n.w." = ก.พ., "a.n." = ต.ค.
  // แยกตามตำแหน่ง เพราะ n เป็น ก ในตัวแรก แต่เป็น ค ในตัวที่สอง
  const FIRST = { n: 'ก', a: 'ต' };
  const SECOND = { w: 'พ', n: 'ค' };
  text = text.replace(/(\d{1,2})\s+([A-Za-z])\.([A-Za-z])\.\s*(\d{4})/g, (m, d, a, b, y) => {
    const tok = `${FIRST[a.toLowerCase()] || a}.${SECOND[b.toLowerCase()] || b}.`;
    return monthsTh[tok] !== undefined ? `${d} ${tok} ${y}` : m;
  });

  const monthsEn = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };

  // 1. รูปแบบสลิปภาษาอังกฤษ เช่น "29 Aug 26 12:49 PM" หรือ "29 Aug 2026"
  for (const enMatch of text.matchAll(/(?<!\d)(\d{1,2})\s+([A-Za-z]{3,9})\.?\s+(\d{2,4})(?:\s+(\d{1,2}):(\d{2}))?/g)) {
    const [, day, monthStr, yearStr, hours, minutes] = enMatch;
    const month = monthsEn[monthStr.slice(0, 3).toLowerCase()];
    if (month === undefined) continue;   // ไม่ใช่ชื่อเดือน ลองคู่ถัดไป
    if (parseInt(day, 10) < 1 || parseInt(day, 10) > 31) continue;   // กันวันที่เกินช่วง
    let year = parseInt(yearStr, 10);
    if (year < 100) year += 2000;
    const h = hours ? parseInt(hours, 10) : 0;
    const m = minutes ? parseInt(minutes, 10) : 0;
    return new Date(Date.UTC(year, month, parseInt(day, 10), h, m)).toISOString();
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
  const numMatch = text.match(/(?<!\d)(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?!\d)/);
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

// ==========================================
// 🧹 ทำความสะอาดข้อความดิบจาก OCR
// ==========================================
function cleanRawText(text) {
  let t = (text || '').trim().normalize('NFC');
  t = t.replace(/\u0E4D\u0E32/g, '\u0E33'); // นิคหิต + สระอา -> สระอำ
  t = t.replace(/พร้อม[เแ]{1,2}พย์/gi, 'พร้อมเพย์');
  t = applyMerchantCorrections(t);
  return t;
}

// ==========================================
// 🧠 parseText: ข้อความดิบ -> ฟิลด์ (ไม่เรียก OCR จึงทดสอบ regex ได้เร็ว)
// ==========================================
function parseText(ocrText, { verbose = false } = {}) {
  const rawText = cleanRawText(ocrText);
  const parsedText = rawText;

  const { documentType, paymentMethod } = detectDocumentTypeAndPaymentMethod(rawText);
  
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
    total = extractReceiptTotalAmount(rawText) || extractTotal(rawText, { fixBahtSymbol: true }) || 0;
    merchant = extractReceiptMerchant(rawText) || extractMerchant(rawText);
    items = extractLineItems(parsedText);

    const vatScResult = extractVatAndServiceCharge(rawText, total);
    netAmount = vatScResult.netAmount;
    vat = vatScResult.vat;
    serviceCharge = vatScResult.serviceCharge;

    if (verbose) {
      console.log('🧺 Extracted items:', JSON.stringify(items, null, 2));
      console.log('💰 VAT/SC breakdown:', vatScResult);
    }
  }

  return {
    success: true,
    merchant,
    total,
    netAmount,
    vat,
    serviceCharge,
    date: extractDate(rawText),
    parsedText,
    items,
    documentType,
    paymentMethod,
    bankName: extractBankName(rawText),
    transactionId: extractTransactionId(rawText),
    categoryId: 1, // หมวดหมู่เริ่มต้น
  };
}

// ==========================================
// ---------- Main Export Function ----------
// ==========================================
exports.scanReceipt = async ({ file, image, options } = {}) => {
  if (USE_MOCK_OCR) {
    console.warn('⚠️ USE_MOCK_OCR=true -> ใช้ Mock OCR Data (dev only)');
    return MOCK_RESULT;
  }

  let inputImage;
  if (file && file.path) {
    inputImage = file.path;
  } else if (image) {
    const b64 = image.startsWith('data:') ? image.split(',')[1] : image;
    inputImage = Buffer.from(b64, 'base64');
  } else {
    throw new Error('ไม่พบไฟล์รูปภาพหรือข้อมูลรูปภาพ');
  }

  let ocrText = '';
  let confidence = null;
  try {
    const best = await runOcr(inputImage, options);
    ocrText = best?.text || '';
    confidence = best?.confidence ?? null;
    console.log('📊 OCR confidence (best PSM):', confidence);
  } catch (err) {
    console.error('❌ Tesseract OCR error:', err.message);
    throw new Error('ไม่สามารถประมวลผล OCR ได้ กรุณาลองใหม่อีกครั้ง หรือถ่ายรูปให้ชัดเจนขึ้น');
  }

  if (!ocrText.trim()) {
    throw new Error('อ่านข้อความจากรูปไม่ได้เลย กรุณาถ่ายรูปให้ชัดเจนขึ้นและมีแสงเพียงพอ');
  }

  const result = parseText(ocrText, { verbose: true });

  console.log('=== RAW OCR TEXT ===');
  console.log(result.parsedText);
  console.log('====================');

  return { ...result, ocrConfidence: confidence };
};

// export ไว้สำหรับทดสอบ / ใช้ซ้ำ
exports.parseText = parseText;
exports.runOcr = runOcr;
exports.shutdown = shutdown;
exports.DEFAULT_OPTS = DEFAULT_OPTS;