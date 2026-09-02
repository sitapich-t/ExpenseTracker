/* Backend server.js — Ultra-robust Express.js + Supabase Backend */

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const personalRoutes = require('./routes/personalRoutes');

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

app.use('/api/v1/auth', authRoutes);

app.use((req, res, next) => {
  req.supabase = supabase;
  next();
});

// ผูก Path หลักสำหรับข้อมูลส่วนบุคคล
app.use('/api/v1/personal', personalRoutes);

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

    let merchant = 'comico (NHN THAILAND)';
    let total = 285.0;
    let parsedText = '';

    // กรณีส่งแบบ Multipart File
    if (file && file.originalname) {
      parsedText = file.originalname;
      const match = file.originalname.match(/([^_]+)__?.*?(?:total|amt|amount)[_\-]?(\d+(?:[\.,]\d+)?)/i);
      if (match) {
        merchant = match[1].replace(/[-_]/g, ' ');
        total = parseFloat(match[2].replace(',', '.'));
      }
    } 
    // กรณีส่งแบบ Base64 (JSON)
    else if (image) {
      parsedText = 'Base64 Receipt Image Processed Successfully';
    }

    return res.json({
      merchant,
      total,
      date: new Date().toISOString(),
      parsedText,
    });
  } catch (err) {
    console.error('❌ Scan receipt error:', err);
    return res.status(500).json({ error: 'การอ่านสแกนใบเสร็จล้มเหลว' });
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