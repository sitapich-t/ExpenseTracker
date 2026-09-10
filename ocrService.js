// ==========================================
// OCR & Receipt Scanning Service — FREE VERSION
// ใช้ Tesseract.js (OCR แบบ open-source รันบนเครื่องเอง)
// แทน Claude Vision API เพื่อไม่ให้มีค่าใช้จ่ายต่อการสแกน
//
// ข้อจำกัด: ความแม่นยำต่ำกว่า Claude Vision พอสมควร โดยเฉพาะ
// ใบเสร็จที่พิมพ์ด้วยกระดาษความร้อน (thermal paper) เบลอๆ หรือ
// ฟอนต์ภาษาไทยแบบพิเศษ ผลลัพธ์อาจต้องแก้ไขมือบ้างในหน้า Confirm
//
// วิธีติดตั้ง (รันในโฟลเดอร์ backend):
//   npm install tesseract.js --save
//
// หมายเหตุ: ครั้งแรกที่รัน Tesseract จะดาวน์โหลด "traineddata"
// (ไฟล์ language model ภาษาไทย+อังกฤษ ขนาดรวมไม่กี่ MB) จาก
// อินเทอร์เน็ตอัตโนมัติ แล้ว cache ไว้ในเครื่อง — ครั้งต่อไปจะ
// ไม่โหลดซ้ำและไม่มีค่าใช้จ่ายใดๆ ทั้งสิ้น (มันประมวลผลบนเครื่องเราเอง)
// ==========================================

const Tesseract = require('tesseract.js');

// เปิดโหมด mock ได้เฉพาะตอนตั้งค่านี้ใน .env เท่านั้น (สำหรับ dev/test)
const USE_MOCK_OCR = String(process.env.USE_MOCK_OCR || '').toLowerCase() === 'true';

const MOCK_RESULT = {
  merchant: 'สปาร์ค อีวี (MOCK)',
  total: 100.0,
  date: new Date().toISOString(),
  parsedText: 'สปาร์ค อีวี\n1683533\nTransaction ID: 016242082205CPM12337',
  bankName: 'ธนาคารกสิกรไทย',
  transactionId: '016242082205CPM12337',
  documentType: 'slip',
  isMock: true,
};

// ---------- Helper: ดึงยอดรวมจากข้อความ OCR ด้วย regex ----------
function extractTotal(text) {
  // เดิม: ไล่ pattern ตามลำดับความเฉพาะเจาะจง แล้ว "หยุดที่ pattern แรกที่เจอ"
  // ปัญหา: ถ้า OCR อ่านคำเฉพาะเจาะจง (เช่น "ยอดชำระสุทธิ") ไม่ชัด/เพี้ยน
  // แม้แค่นิดเดียว โค้ดจะข้ามไป pattern ทั่วไปกว่า (เช่น "ยอดรวม") ซึ่งมักอยู่
  // *ก่อน* ยอดสุทธิในเนื้อบิลเสมอ (ยอดรวมก่อนหักส่วนลด -> ยอดสุทธิหลังหักส่วนลด)
  // ทำให้ได้ยอดก่อนหักส่วนลดไปใช้แทนยอดที่จ่ายจริง
  //
  // แก้ใหม่: เก็บ "ทุกคำที่แมตช์ได้ในทั้งข้อความ" จากทุกกลุ่ม แล้วให้คะแนน
  // ความเฉพาะเจาะจงตัดสิน (ยอดสุทธิ > ยอดชำระ/รวมทั้งหมด > ยอดรวม/รวม ทั่วไป)
  // ไม่ว่าคำไหนจะอยู่ตำแหน่งใดในข้อความก่อน-หลังก็ตาม
  const patternGroups = [
    {
      // เฉพาะเจาะจงที่สุด: ยอดสุทธิ/ยอดที่ต้องจ่ายจริงหลังหักส่วนลด
      priority: 3,
      regex: /(?:ยอดชำระสุทธิ|ยอดสุทธิ|รวมสุทธิ|net\s*total)[^\d]{0,20}([\d,]+\.\d{1,2}|[\d,]+)/gi,
    },
    {
      // รองลงมา: คำที่มักหมายถึงยอดสุดท้ายเช่นกัน แต่กว้างกว่าเล็กน้อย
      priority: 2,
      regex: /(?:รวมทั้งหมด|ยอดรวมทั้งหมด|ยอดชำระ|grand\s*total|total\s*amount)[^\d]{0,20}([\d,]+\.\d{1,2}|[\d,]+)/gi,
    },
    {
      // ทั่วไปสุด: อาจเป็นยอดก่อนหักส่วนลด ใช้เป็นตัวเลือกสุดท้ายเท่านั้น
      priority: 1,
      regex: /(?:ยอดรวม|รวม|\btotal\b)[^\d]{0,20}([\d,]+\.\d{1,2}|[\d,]+)/gi,
    },
  ];

  const candidates = [];
  for (const { priority, regex } of patternGroups) {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const num = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(num) && num > 0) {
        candidates.push({ priority, position: match.index, value: num });
      }
    }
  }

  if (candidates.length > 0) {
    // เรียงตามความเฉพาะเจาะจงสูงสุดก่อน ถ้าเฉพาะเจาะจงเท่ากันให้เอาตำแหน่ง
    // ท้ายสุดของข้อความ (ยอดสุทธิ/ยอดชำระมักพิมพ์เป็นรายการสุดท้ายบนใบเสร็จ)
    candidates.sort((a, b) => b.priority - a.priority || b.position - a.position);
    return candidates[0].value;
  }

  // Fallback: ถ้า OCR อ่านคำว่า "รวมทั้งหมด"/"total" ผิดเพี้ยนจนหาคำไม่เจอเลย
  // (พบบ่อยกับ Tesseract + ภาษาไทย) ให้ไล่หาตัวเลขรูปแบบเงิน (X.XX) ทั้งหมดในข้อความ
  // แล้วเอาตัวสุดท้าย เพราะยอดรวมสุทธิบนใบเสร็จมักอยู่บรรทัดท้ายๆ เสมอ
  const moneyMatches = [...text.matchAll(/(\d{1,3}(?:,\d{3})*\.\d{2})/g)];
  if (moneyMatches.length > 0) {
    const lastMatch = moneyMatches[moneyMatches.length - 1][1];
    const num = parseFloat(lastMatch.replace(/,/g, ''));
    if (!isNaN(num) && num > 0) return num;
  }

  return 0;
}

// ---------- Helper: ดึงวันที่จากข้อความ OCR ด้วย regex ----------
function extractDate(text) {
  // รองรับรูปแบบ dd/mm/yy, dd/mm/yyyy, dd-mm-yy ฯลฯ
  const match = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (!match) return null;

  let [, day, month, year] = match.map(Number);

  if (year < 100) year += 2000; // ปีย่อ 2 หลักบนใบเสร็จของแอปนี้เป็นปี ค.ศ. (เช่น 26 = 2026)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  try {
    return new Date(Date.UTC(year, month - 1, day)).toISOString();
  } catch {
    return null;
  }
}

exports.scanReceipt = async ({ file, image } = {}) => {
  if (USE_MOCK_OCR) {
    console.warn('⚠️ USE_MOCK_OCR=true -> ใช้ Mock OCR Data (dev only)');
    return MOCK_RESULT;
  }

  // 1. เตรียม input ให้ Tesseract อ่านได้ (รับได้ทั้ง path ไฟล์ หรือ base64 data URL)
  let inputImage;
  if (file && file.path) {
    inputImage = file.path;
  } else if (image) {
    inputImage = image.startsWith('data:') ? image : `data:image/jpeg;base64,${image}`;
  } else {
    throw new Error('ไม่พบไฟล์รูปภาพหรือข้อมูลรูปภาพ');
  }

  // 2. รัน OCR ด้วย Tesseract (ภาษาไทย + อังกฤษ) — ทำงานบนเครื่องเราเอง ไม่มีค่าใช้จ่าย
  let result;
  try {
    result = await Tesseract.recognize(inputImage, 'tha+eng', {
      logger: () => {}, // ปิด progress log; เปลี่ยนเป็น m => console.log(m) ถ้าอยากดู progress ตอน debug
    });
  } catch (err) {
    console.error('❌ Tesseract OCR error:', err.message);
    throw new Error('ไม่สามารถประมวลผล OCR ได้ กรุณาลองใหม่อีกครั้ง หรือถ่ายรูปให้ชัดเจนขึ้น');
  }

  const rawText = (result?.data?.text || '').trim();

  if (!rawText) {
    throw new Error('อ่านข้อความจากรูปไม่ได้เลย กรุณาถ่ายรูปให้ชัดเจนขึ้นและมีแสงเพียงพอ');
  }

  // 3. ดึง total และ date ด้วย regex ฝั่ง backend
  //    ส่วน merchant ปล่อยให้ frontend (extractMerchant ใน confirm-receipt.js)
  //    เป็นคนเดาจาก parsedText แทน เพราะมี logic ให้คะแนนบรรทัดที่ซับซ้อนกว่าอยู่แล้ว
  const total = extractTotal(rawText);
  const date = extractDate(rawText);

  return {
    merchant: '',
    total,
    date,
    parsedText: rawText,
    documentType: 'receipt',
    bankName: null,
    transactionId: null,
  };
};