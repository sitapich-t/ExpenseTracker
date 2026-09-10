/* Backend server.js — Ultra-robust Express.js + Supabase Backend */


const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
const Tesseract = require('tesseract.js');
require('dotenv').config();

// Polyfill for WebSocket if missing in environment
if (typeof global !== 'undefined' && !global.WebSocket) {
  try {
    global.WebSocket = require('ws');
  } catch (e) {
    console.warn('ws package optional warning:', e.message);
  }
}

const app = express();
app.use(cors());

// 💡 1. ขยายขีดจำกัดให้รับ Base64 String ขนาดใหญ่ได้ (แก้ Error Request Failed / 413)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup Multer for file uploads (กรณีรับแบบ multipart)
const upload = multer({ dest: 'uploads/' });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'student_wallet_jwt_secret_key_2026';
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

// Fallback In-Memory Storage
const memoryStore = {
  users: [],
  transactions: [],
};

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY && !SUPABASE_KEY.includes('YOUR-')) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('⚡ Attempting Supabase connection...');
  } catch (error) {
    console.warn('⚠️ Supabase init warning. Using in-memory fallback:', error.message || error);
  }
} else {
  console.warn('⚠️ SUPABASE_URL or SUPABASE_KEY missing/invalid. Running in-memory fallback mode.');
}

async function findUserByEmail(email) {
  if (!supabase) {
    return memoryStore.users.find((user) => user.email === email) || null;
  }
  try {
    const { data, error } = await supabase.from('users').select('*').eq('email', email).limit(1);
    if (error) throw error;
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.warn('⚠️ Supabase user query failed, fallback to memory:', error.message || error);
    return memoryStore.users.find((user) => user.email === email) || null;
  }
}

async function insertUserRecord(user) {
  if (!supabase) {
    memoryStore.users.push(user);
    return user;
  }
  try {
    const { data, error } = await supabase.from('users').insert([user]).select();
    if (error) throw error;
    return data && data[0] ? data[0] : user;
  } catch (error) {
    console.warn('⚠️ Supabase user insert failed, fallback to memory:', error.message || error);
    memoryStore.users.push(user);
    return user;
  }
}

async function getTransactionsByUser(userId) {
  if (!supabase) {
    return memoryStore.transactions
      .filter((tx) => tx.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
  try {
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (error) {
    console.warn('⚠️ Supabase transactions query failed, fallback to memory:', error.message || error);
    return memoryStore.transactions
      .filter((tx) => tx.user_id === userId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }
}

// Helper: Insert Transaction (ปรับแก้ให้รองรับ Foreign Key Supabase)
async function insertTransactionRecord(transaction) {
  if (!supabase) {
    memoryStore.transactions.push(transaction);
    return transaction;
  }
  try {
    // 💡 1. ลอง Insert เข้า Supabase ปกติ
    const { data, error } = await supabase.from('transactions').insert([transaction]).select();
    if (error) throw error;
    return data && data[0] ? data[0] : transaction;
  } catch (error) {
    console.warn('⚠️ Supabase transaction insert failed (FK violation or Schema mismatch), fallback to memory:', error.message || error);
    
    // 💡 2. ถ้า Supabase ฟ้อง Foreign Key Error ให้ fallback เก็บลง Memory แทน Server จะได้ไม่พัง
    memoryStore.transactions.push(transaction);
    return transaction;
  }
}

function generateToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ error: 'Missing authorization header' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid token format' });
    }

    const token = parts[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token' });
  }
}

// API ROUTES
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    timestamp: new Date().toISOString(),
    database: supabase ? 'Supabase (Connected/Ready)' : 'In-Memory Mode (Active)',
  });
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password, name, username } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();
    const cleanName = String(name || username || '').trim();

    if (!cleanEmail || !cleanPassword || !cleanName) {
      return res.status(400).json({ error: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'รูปแบบอีเมลไม่ถูกต้อง' });
    }
    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร' });
    }

    const existing = await findUserByEmail(cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'อีเมลนี้ถูกใช้งานในระบบแล้ว' });
    }

    const password_hash = await bcrypt.hash(cleanPassword, 10);
    const id = uuidv4();
    const userRecord = { id, email: cleanEmail, password_hash, name: cleanName };
    const savedUser = await insertUserRecord(userRecord);

    const token = generateToken({ id: savedUser.id, email: savedUser.email, name: savedUser.name });
    return res.json({
      message: 'สมัครสมาชิกสำเร็จ',
      token,
      user: { id: savedUser.id, email: savedUser.email, name: savedUser.name },
    });
  } catch (err) {
    console.error('❌ Register Error:', err);
    return res.status(500).json({ error: `Server Error: ${err.message || 'Unknown error'}` });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPassword = String(password || '').trim();

    if (!cleanEmail || !cleanPassword) {
      return res.status(400).json({ error: 'กรุณากรอกอีเมลและรหัสผ่าน' });
    }

    const user = await findUserByEmail(cleanEmail);
    if (!user) {
      return res.status(400).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const ok = await bcrypt.compare(cleanPassword, user.password_hash);
    if (!ok) {
      return res.status(400).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง' });
    }

    const token = generateToken({ id: user.id, email: user.email, name: user.name });
    return res.json({
      message: 'เข้าสู่ระบบสำเร็จ',
      token,
      user: { id: user.id, email: user.email, name: user.name },
    });
  } catch (err) {
    console.error('❌ Login Error:', err);
    return res.status(500).json({ error: `Server Error: ${err.message}` });
  }
});

app.get('/api/transactions/my', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const transactions = await getTransactionsByUser(userId);
    return res.json({ transactions });
  } catch (err) {
    console.error('❌ Get transactions error:', err);
    return res.status(500).json({ error: 'ไม่สามารถดึงข้อมูลรายการได้' });
  }
});

app.post('/api/transactions/create', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { title, type, amount, merchant, date } = req.body || {};

    if (!title || !amount) {
      return res.status(400).json({ error: 'กรุณากรอกชื่อรายการและจำนวนเงิน' });
    }

    const tx = {
      id: uuidv4(),
      user_id: userId,
      title: String(title),
      type: type || 'expense',
      amount: parseFloat(amount) || 0,
      merchant: merchant || 'General',
      created_at: date || new Date().toISOString(),
    };

    const createdTransaction = await insertTransactionRecord(tx);
    return res.json({ message: 'บันทึกรายการสำเร็จ', transaction: createdTransaction });
  } catch (err) {
    console.error('❌ Create transaction error:', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการบันทึกรายการ' });
  }
});

app.post('/api/transactions/confirm-scan', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { merchant, total, title, date } = req.body || {};

    if (!total) {
      return res.status(400).json({ error: 'กรุณาระบุจำนวนเงิน' });
    }

    const tx = {
      id: uuidv4(),
      user_id: userId,
      title: title || `สแกนใบเสร็จ - ${merchant || 'ร้านค้าทั่วไป'}`,
      type: 'expense',
      amount: parseFloat(total),
      merchant: merchant || 'ร้านค้าทั่วไป',
      created_at: date || new Date().toISOString(),
    };

    const createdTransaction = await insertTransactionRecord(tx);
    return res.json({ message: 'บันทึกใบเสร็จสำเร็จ', transaction: createdTransaction });
  } catch (err) {
    console.error('❌ Confirm scan error:', err);
    return res.status(500).json({ error: 'ไม่สามารถบันทึกข้อมูลสแกนได้' });
  }
});


// 💡 2. ปรับรองรับทั้ง JSON Base64 และ Multipart Form Data
app.post('/api/transactions/scan-receipt', upload.single('receipt'), async (req, res) => {
  try {
    const { image } = req.body || {};
    const file = req.file;

    let imageSource;

    // กรณีส่งเป็นไฟล์
    if (file) {
      imageSource = file.path;
    }
    // กรณีส่งเป็น Base64
    else if (image) {
      const base64Image = image.replace(/^data:image\/\w+;base64,/, '');
      imageSource = Buffer.from(base64Image, 'base64');
    }
    else {
      return res.status(400).json({
        error: 'ไม่พบรูปใบเสร็จ'
      });
    }

    console.log('🔍 Starting Tesseract OCR...');

    const result = await Tesseract.recognize(
      imageSource,
      'eng+tha',
      {
        logger: (info) => {
          if (info.status === 'recognizing text') {
            console.log(`OCR Progress: ${Math.round(info.progress * 100)}%`);
          }
        }
      }
    );

// =========================
// แก้ปัญหา Tesseract อ่านตัวอักษรแยกทีละตัว
// (เช่น "บ า ว ค า ฟ" ที่จริงคือ "นาว คาเฟ่")
// บรรทัดไหนส่วนใหญ่เป็นตัวอักษรโดดๆ คั่นด้วยช่องว่าง ให้ยุบช่องว่างทิ้ง
// =========================
function collapseSpacedOutText(rawText) {
  return rawText
    .split('\n')
    .map((line) => {
      const tokens = line.trim().split(/\s+/).filter(Boolean);
      if (tokens.length < 3) return line;

      const singleCharTokens = tokens.filter((t) => t.length === 1).length;

      // ถ้าอย่างน้อยครึ่งนึงของ "คำ" ในบรรทัดเป็นตัวอักษรเดี่ยว แปลว่าโดน OCR แยกตัวอักษร
      if (singleCharTokens / tokens.length < 0.5) return line;

      // ยุบเฉพาะกลุ่มตัวอักษรเดี่ยวที่เรียงติดกันให้เป็นคำเดียว
      // แต่คงช่องว่างรอบ token ที่ยาวกว่า 1 ตัวอักษรไว้ (เช่น วันที่ "30/8/26", เวลา "3:45")
      // ไม่งั้นจะไปเชื่อมวันที่กับเวลาให้กลายเป็นตัวเลขก้อนเดียวโดยไม่ตั้งใจ
      const parts = [];
      let buffer = '';

      tokens.forEach((token) => {
        if (token.length === 1) {
          buffer += token;
        } else {
          if (buffer) {
            parts.push(buffer);
            buffer = '';
          }
          parts.push(token);
        }
      });

      if (buffer) parts.push(buffer);

      return parts.join(' ');
    })
    .join('\n');
}

const parsedText = collapseSpacedOutText(result.data.text || '');

console.log('📝 OCR Text (raw):', result.data.text);
console.log('📝 OCR Text (collapsed):', parsedText);

// =========================
// หา Total Amount
// =========================

let total = 0;
let totalRawStr = null;

// 1. หาเลขที่มีทศนิยม เช่น 31.00, 100.00
const decimalMatches =
  parsedText.match(/\b\d{1,6}[.,]\d{2}\b/g) || [];

// เผื่อ OCR อ่านสัญลักษณ์สกุลเงิน (฿) เป็นตัวเลขแปลกปลอมติดหน้าจำนวนเงินจริง
// (เช่น "฿210.25" กลายเป็น "8210.25") — ถ้าตัดหลักแรกออกแล้วค่าที่ได้ซ้ำกับ
// จำนวนเงินอื่นในใบเสร็จตั้งแต่ 2 ครั้งขึ้นไป แสดงว่าหลักแรกน่าจะเป็นขยะ
const trimmedFreq = {};
decimalMatches.forEach((raw) => {
  const digitsBeforeDot = raw.split(/[.,]/)[0].length;
  if (digitsBeforeDot >= 4) {
    const trimmed = raw.slice(1);
    trimmedFreq[trimmed] = (trimmedFreq[trimmed] || 0) + 1;
  }
});

const decimalAmounts = decimalMatches
  .map((raw) => {
    const digitsBeforeDot = raw.split(/[.,]/)[0].length;
    if (digitsBeforeDot >= 4) {
      const trimmed = raw.slice(1);
      if ((trimmedFreq[trimmed] || 0) >= 2) {
        return trimmed;
      }
    }
    return raw;
  })
  .map((value) => parseFloat(value.replace(',', '.')))
  .filter((value) => value > 0 && value < 100000);

// 2. ถ้ามีคำว่า รวม / ยอดสุทธิ / total
const totalLineMatch = parsedText.match(
  /(?:รวม|ยอดสุทธิ|ยอดรวม|total|net)[^\d]{0,30}(\d{1,6}[.,]\d{2})/i
);

if (totalLineMatch) {
  totalRawStr = totalLineMatch[1];
  total = parseFloat(totalRawStr.replace(',', '.'));
}

// 3. ถ้ายังหาไม่ได้ ให้ใช้จำนวนเงินที่มีทศนิยม
if (total === 0 && decimalAmounts.length > 0) {
  total = Math.max(...decimalAmounts);
}

// แก้เคสตัวเลขจากยอดรวมมีหลักแปลกปลอมติดหน้า (ดูตรรกะเดียวกับข้างบน)
if (totalRawStr) {
  const digitsBeforeDot = totalRawStr.split(/[.,]/)[0].length;
  if (digitsBeforeDot >= 4) {
    const trimmed = totalRawStr.slice(1);
    if ((trimmedFreq[trimmed] || 0) >= 2) {
      console.log(`⚠️ Total ${totalRawStr} ดูเหมือนมีเลขแปลกปลอมติดหน้า ปรับเป็น ${trimmed}`);
      total = parseFloat(trimmed.replace(',', '.'));
    }
  }
}

console.log('💰 Detected Total:', total);


// =========================
// หา Date
// =========================

const dateMatch = parsedText.match(
  /\b(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})\b/
);

let date = null;

if (dateMatch) {
  const day = dateMatch[1].padStart(2, '0');
  const month = dateMatch[2].padStart(2, '0');

  let year = parseInt(dateMatch[3], 10);

  // ปี 2 หลัก อาจเป็น ค.ศ. แบบย่อ (26 -> 2026) หรือ พ.ศ. แบบย่อ (65 -> 2565 -> 2022)
  // ใบเสร็จยุคนี้พิมพ์ทั้งสองแบบ เลยต้องเดาว่าแบบไหนสมเหตุสมผลกว่า
  if (year < 100) {
    const asChristianEra = 2000 + year;
    const asBuddhistEra = (2500 + year) - 543;
    const nowYear = new Date().getFullYear();

    // ถ้าตีความแบบ ค.ศ. แล้วใกล้เคียงปีปัจจุบัน (ไม่เกิน 5 ปี) ให้ใช้แบบนั้น
    // ไม่งั้นถือว่าเป็น พ.ศ. แบบย่อ
    if (Math.abs(asChristianEra - nowYear) <= 5) {
      year = asChristianEra;
    } else {
      year = asBuddhistEra;
    }
  }

  if (year > 2400) {
    year = year - 543;
  }

  date = `${year}-${month}-${day}`;
}

// รูปแบบวันที่แบบมีชื่อเดือนภาษาอังกฤษ เช่น "30 Aug 26" (พบในสลิปโอนเงินจากแอปธนาคาร)
if (!date) {
  const monthNames = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
  };

  const monthNameMatch = parsedText.match(
    /\b(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})\b/
  );

  if (monthNameMatch) {
    const day = monthNameMatch[1].padStart(2, '0');
    const monthKey = monthNameMatch[2].slice(0, 3).toLowerCase();
    const month = monthNames[monthKey];

    if (month) {
      // สลิปธนาคารที่พิมพ์ชื่อเดือนภาษาอังกฤษ ปี 2 หลักมักหมายถึง ค.ศ. เสมอ (ไม่ใช่ พ.ศ.)
      let year = parseInt(monthNameMatch[3], 10);
      if (year < 100) {
        year = 2000 + year;
      }
      date = `${year}-${month}-${day}`;
    }
  }
}

console.log('📅 Detected Date:', date);

// =========================
// ตรวจว่าเป็นสลิปโอนเงิน/ชำระเงินผ่านแอป หรือใบเสร็จร้านค้า
// =========================

// สัญญาณคำ/วลีที่มักเจอในสลิปโอนเงิน (แต่ละแอปธนาคารใช้คำไม่เหมือนกัน เลยต้องรวมหลายแบบ)
const transferKeywordPattern = /transaction\s*id|payment\s*completed|payment\s*success|kbank|scb|bualuang|krungthai|krungsri|promptpay|truemoney|ธนาคาร|โอนเงิน|โอนสำเร็จ|ทำรายการสำเร็จ|เติมเงิน|พร้อมเพย์|รหัสอ้างอิง|ktb|bbl|tmb|gsb|bay|ttb/i;

// สัญญาณเชิงโครงสร้าง: เลขบัญชีที่ถูกปิดบังบางส่วน (XXX-XXX709-3, XXX=X=X7251-X ฯลฯ)
// พบรูปแบบนี้เกือบทุกแอปธนาคาร ใช้แทนการพึ่งคำเฉพาะที่เปลี่ยนไปตามแอป
const maskedAccountPattern = /\bXXX[\-=][\dX\-=]{3,}/i;

const isTransferSlip =
  transferKeywordPattern.test(parsedText) ||
  maskedAccountPattern.test(parsedText);

console.log('📄 Document Type:', isTransferSlip ? 'transfer_slip' : 'receipt');

// หาชื่อธนาคาร (ถ้ามี)
let bankName = null;
const bankMatch = parsedText.match(
  /(KBank|SCB|กสิกร|ไทยพาณิชย์|Krungthai|กรุงไทย|Krungsri|กรุงศรี|Bangkok\s*Bank|กรุงเทพ|TMB|ทหารไทย|ttb|GSB|ออมสิน|CIMB|UOB|TrueMoney|PromptPay|KTB|BBL|BAY)\b/i
);
if (bankMatch) {
  bankName = bankMatch[1];
}

// หาเลขอ้างอิงธุรกรรม (ถ้ามี)
let transactionId = null;
const transactionIdMatch = parsedText.match(
  /(?:transaction\s*id|เลขอ้างอิง)[:\s]*([A-Za-z0-9]{8,})/i
);
if (transactionIdMatch) {
  transactionId = transactionIdMatch[1];
}

console.log('🏦 Bank:', bankName);
console.log('🔖 Transaction ID:', transactionId);

    // =========================
    // ส่งผล OCR กลับไป
    // =========================
// =========================
// หาเฉพาะชื่อร้าน
// =========================

const lines = parsedText
  .split('\n')
  .map(line => line.trim())
  .filter(line => line.length > 0);

let merchant = 'ร้านค้าทั่วไป';

// รวม OCR ให้ตรวจชื่อร้านได้ง่าย
const normalizedOCR = parsedText
  .replace(/\s+/g, ' ')
  .trim();


// =========================
// ตรวจชื่อร้านจาก OCR
// =========================

const ocrForMerchant = parsedText
  .replace(/\r/g, ' ')
  .replace(/\n/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

console.log('🔎 OCR Merchant Check:', ocrForMerchant);

// CJ MORE
if (
  /CJ\s*MORE/i.test(ocrForMerchant) ||
  /C\s*J\s*MORE/i.test(ocrForMerchant) ||
  /CJ\s*MARKET/i.test(ocrForMerchant) ||
  /C\s*J\s*MARKET/i.test(ocrForMerchant) ||
  /33\s*K\s*arket/i.test(ocrForMerchant) ||
  /J\s*33\s*K\s*arket/i.test(ocrForMerchant) ||
  /K\s*arket\s*\(\s*แพ\s*ง\s*เสน/i.test(ocrForMerchant)
) {
  merchant = 'CJ MORE';
}

// 7-Eleven
else if (
  /7\s*[-]?\s*Eleven/i.test(ocrForMerchant) ||
  /7\s*[-]?\s*eleven/i.test(ocrForMerchant) ||
  /CP\s*ALL/i.test(ocrForMerchant)
) {
  merchant = '7-Eleven';
}


// =========================
// ถ้ายังไม่เจอ ให้หา Candidate
// =========================

if (merchant === 'ร้านค้าทั่วไป') {

  const ignoreMerchant = [
    /ใบเสร็จ/i,
    /ใบกำกับ/i,
    /receipt/i,
    /invoice/i,
    /tax/i,
    /vat/i,
    /เบอร์/i,
    /โทร/i,
    /โทรศัพท์/i,
    /tel/i,
    /phone/i,
    /ที่อยู่/i,
    /address/i,
    /ถนน/i,
    /ซอย/i,
    /ตำบล/i,
    /อำเภอ/i,
    /จังหวัด/i,
    /เลขที่/i,
    /เลขประจำตัว/i,
    /เลขผู้เสียภาษี/i,
    /รหัส/i,
    /สมาชิก/i,
    /คะแนน/i,
    /แต้ม/i,
    /รวม/i,
    /ยอด/i,
    /total/i,
    /subtotal/i,
    /net/i,
    /amount/i,
    /เงินสด/i,
    /เงินทอน/i,
    /cash/i,
    /change/i,
    /วันที่/i,
    /date/i,
    /เวลา/i,
    /time/i,
    /pos/i,
    /branch/i,
    /สาขา/i,
    // คำสถานะ/UI ของแอปชำระเงินดิจิทัล (สลิปโอนเงิน ไม่ใช่ใบเสร็จร้านค้า)
    /payment\s*completed/i,
    /payment\s*success/i,
    /transaction\s*id/i,
    /view\s*original/i,
    /โอนเงิน/i,
    /โอนสำเร็จ/i,
    /ทำรายการสำเร็จ/i,
    /ชำระเงินสำเร็จ/i,
    /qr\s*code/i,
    /อ้างอิง/i,
    // ชื่อคนที่มีคำนำหน้า (ผู้โอน/ผู้รับเงินในสลิป ไม่ใช่ชื่อร้าน)
    /^(ms\.?|mr\.?|mrs\.?|miss)\s/i,
    /^คุณ\s?[ก-๙]/,
    // ชื่อธนาคาร/ผู้ให้บริการชำระเงิน (เป็นป้ายกำกับ ไม่ใช่ชื่อร้าน/ผู้รับ)
    /^(KBank|SCB|กสิกร|ไทยพาณิชย์|Krungthai|กรุงไทย|Krungsri|กรุงศรี|Bangkok\s*Bank|กรุงเทพ|TMB|ทหารไทย|ttb|GSB|ออมสิน|CIMB|UOB|TrueMoney|PromptPay)\b/i
  ];

  const candidates = [];

  lines.slice(0, 10).forEach((line, index) => {

    if (ignoreMerchant.some(pattern => pattern.test(line))) {
      return;
    }

    let cleaned = line;

    cleaned = cleaned
      .replace(/\([^)]*\)/g, ' ')
      .replace(/\b0\d{8,9}\b/g, ' ')
      .replace(/\b\d{10,15}\b/g, ' ')
      .replace(/\b\d+[.,]\d{1,2}\b/g, ' ')
      .replace(/\bPOS\s*[:#]?\s*\w+/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    // ตัดเศษขยะที่ติดอยู่หัว-ท้ายบรรทัด (โทเคนที่ไม่มีตัวอักษรจริงติดกันอย่างน้อย 2 ตัว)
    // เช่น "ดู สปารคอิว ๑] ง+" -> "ดู สปารคอิว"
    const trimJunkEdges = (text) => {
      const tokens = text.split(' ');
      while (tokens.length > 1 && !/[ก-๙]{2,}|[a-zA-Z]{2,}/.test(tokens[0])) {
        tokens.shift();
      }
      while (tokens.length > 1 && !/[ก-๙]{2,}|[a-zA-Z]{2,}/.test(tokens[tokens.length - 1])) {
        tokens.pop();
      }
      return tokens.join(' ');
    };

    cleaned = trimJunkEdges(cleaned);

    if (!cleaned) return;

    // ต้องมีตัวอักษรที่ "ติดกัน" อย่างน้อย 2 ตัว กันขยะ OCR แบบตัวอักษรโดดๆ (เช่น "ม \"ท")
    if (!/[ก-๙]{2,}|[a-zA-Z]{2,}/.test(cleaned)) {
      return;
    }

    if (cleaned.length > 40) {
      return;
    }

    const numbers = (cleaned.match(/\d/g) || []).length;

    if (numbers > 3) {
      return;
    }

    // กันบรรทัดที่ส่วนใหญ่เป็นสัญลักษณ์/ขยะ OCR ปนตัวอักษรจริงแค่นิดเดียว
    const meaningfulChars = (cleaned.match(/[ก-๙a-zA-Z0-9]/g) || []).length;

    if (meaningfulChars < cleaned.length * 0.5) {
      return;
    }

    // เศษขยะสั้นๆ (เช่น "โร" ที่มาจากโลโก้/ตัวอักษรหลุด) ไม่ควรถูกนับเป็นชื่อร้าน
    if (meaningfulChars < 4) {
      return;
    }

    let score = 100 - (index * 10);

    // ให้คะแนนพิเศษถ้าดูเหมือนชื่อร้าน (มีคำว่า คาเฟ่ / ร้าน / market / cafe ฯลฯ)
    if (
      /(คาเฟ่|ร้านกาแฟ|ร้านอาหาร|เบเกอรี่|มินิมาร์ท|ซุปเปอร์มาร์เก็ต|ก๋วยเตี๋ยว|ร้าน)/.test(cleaned) ||
      /\b(market|mart|cafe|café|coffee|shop|store|restaurant|food|bakery)\b/i.test(cleaned)
    ) {
      score += 50;
    }

    // ชื่อร้านภาษาอังกฤษมักเป็นคำขึ้นต้นด้วยตัวใหญ่หลายคำติดกัน (Proper Noun)
    // เช่น "Yo-i soup Kamphaeng Saen" ต่างจากคำทั่วไปที่มีตัวใหญ่แค่คำเดียว
    // ต้องมีความยาวรวมอย่างน้อย 3 ตัวอักษร กันคำย่อสั้นๆ (เช่น "Cn") ได้คะแนนเกินจริง
    const capitalizedWords = (cleaned.match(/\b[A-Z][a-zA-Z'-]{2,}\b/g) || []).length;
    score += capitalizedWords * 15;

    // บรรทัดที่มีเนื้อหายาว/มีสาระมากกว่า มักเป็นชื่อร้านเต็มมากกว่าเศษขยะสั้นๆ
    // บรรทัดที่มีเนื้อหายาว/มีสาระมากกว่า มักเป็นชื่อร้านเต็มมากกว่าเศษขยะสั้นๆ ให้น้ำหนักตามความยาวเป็น 2 เท่า
    score += Math.min(meaningfulChars * 2, 20);

    candidates.push({
      text: cleaned,
      score
    });
  });

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    merchant = candidates[0].text;
  }
}

// =========================
// ทำความสะอาดชื่อร้าน
// =========================

merchant = merchant
  .replace(/\s+/g, ' ')
  .trim();

console.log('🏪 Detected Merchant:', merchant);

    return res.json({
      merchant,
      total,
      date,
      parsedText,
      documentType: isTransferSlip ? 'transfer_slip' : 'receipt',
      bankName,
      transactionId
    });

  } catch (err) {
    console.error('❌ Scan receipt error:', err);

    return res.status(500).json({
      error: 'การอ่านสแกนใบเสร็จล้มเหลว',
      message: err.message
    });
  }
});

// ==========================================
// 💡 GROUPS API (ระบบจัดการกลุ่มหารเงิน)
// ==========================================

// Fallback memory storage สำหรับกลุ่ม
if (!memoryStore.groups) {
  memoryStore.groups = [];
}

// 1. ดึงรายการกลุ่มทั้งหมดของผู้ใช้
app.get('/api/groups/my', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    if (!supabase) {
      const myGroups = memoryStore.groups.filter(g => g.created_by === userId || g.members?.includes(userId));
      return res.json({ groups: myGroups });
    }

    // ดึงจาก Supabase
    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ groups: data || [] });
  } catch (err) {
    console.warn('⚠️ Fetch groups fallback to memory:', err.message);
    const myGroups = memoryStore.groups.filter(g => g.created_by === req.user.id);
    return res.json({ groups: myGroups });
  }
});

// 2. สร้างกลุ่มใหม่
app.post('/api/groups/create', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, category } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'กรุณาระบุชื่อกลุ่ม' });
    }

    // กำหนด Icon ตาม Category
    let icon = 'home-outline';
    let iconBg = '#ede9fe';
    let iconColor = '#6d28d9';

    if (category === 'Trip') {
      icon = 'airplane-outline';
      iconBg = '#dbeafe';
      iconColor = '#2563eb';
    } else if (category === 'Food') {
      icon = 'restaurant-outline';
      iconBg = '#fef3c7';
      iconColor = '#d97706';
    } else if (category === 'Event') {
      icon = 'party-popper';
      iconBg = '#fce7f3';
      iconColor = '#db2777';
    }

    const newGroup = {
      id: uuidv4(),
      name: name.trim(),
      category: category || 'General',
      created_by: userId,
      members_count: 1, // มีตัวผู้สร้างเป็นสมาชิกคนแรก
      total_spend: 0,
      status_type: 'settled', // owe | receive | settled
      amount: 0,
      icon,
      icon_bg: iconBg,
      icon_color: iconColor,
      created_at: new Date().toISOString(),
    };

    if (!supabase) {
      memoryStore.groups.unshift(newGroup);
      return res.json({ message: 'สร้างกลุ่มสำเร็จ', group: newGroup });
    }

    // บันทึกลง Supabase
    try {
      const { data, error } = await supabase.from('groups').insert([newGroup]).select();
      if (error) throw error;
      return res.json({ message: 'สร้างกลุ่มสำเร็จ', group: data[0] });
    } catch (sbErr) {
      console.warn('⚠️ Supabase group insert failed, fallback to memory:', sbErr.message);
      memoryStore.groups.unshift(newGroup);
      return res.json({ message: 'สร้างกลุ่มสำเร็จ', group: newGroup });
    }
  } catch (err) {
    console.error('❌ Create Group Error:', err);
    return res.status(500).json({ error: 'เกิดข้อผิดพลาดในการสร้างกลุ่ม' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`🚀 Server running on http://192.168.1.45:${PORT}`);
  console.log(`🏥 Health check: http://192.168.1.45:${PORT}/api/health`);
  console.log(`=========================================`);
});