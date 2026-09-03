require('dotenv').config();
process.env.TZ = "Asia/Bangkok";
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// 1. ดึง Supabase Instance จาก config/supabase.js (จัดการ WebSocket & .env ให้เสร็จในตัว)
const supabase = require('./config/supabase');

// 2. ดึง Routes
const authRoutes = require('./routes/authRoutes');
const personalRoutes = require('./routes/personalRoutes');

const app = express();
app.use(cors());

// ขยายขีดจำกัดให้รับ Base64 String ขนาดใหญ่สำหรับสแกนใบเสร็จ
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Setup Multer for file uploads
const upload = multer({ dest: 'uploads/' });

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'student_wallet_jwt_secret_key_2026';

// Middleware สำหรับตรวจสอบ JWT Token
function authenticate(req, res, next) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ success: false, error: 'Access Token Required' });

    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ success: false, error: 'Invalid token format' });
    }

    const token = parts[1];
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Session expired or invalid token' });
  }
}

// ส่ง supabase instance ไปให้ Middleware / Route ย่อยใช้งาน
app.use((req, res, next) => {
  req.supabase = supabase;
  next();
});

// ==========================================
// ROUTES MODULES
// ==========================================
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/personal', personalRoutes);

// Health Check Endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', supabaseConnected: !!supabase });
});

// ==========================================
// TRANSACTIONS & SCANNER ENDPOINTS
// ==========================================

// ดึงรายการธุรกรรมส่วนตัวของผู้ใช้
app.get('/api/v1/transactions/my', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const { data, error } = await supabase
      .from('personal_transactions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ success: true, transactions: data || [] });
  } catch (err) {
    console.error('❌ Get transactions error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
});

// บันทึกรายการธุรกรรม
app.post('/api/v1/transactions/create', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { title, type, amount, merchant, date, category_id } = req.body || {};

    if (!title || !amount) {
      return res.status(400).json({ success: false, error: 'กรุณากรอกชื่อรายการและจำนวนเงิน' });
    }

    const tx = {
      id: uuidv4(),
      user_id: userId,
      title: String(title),
      type: type || 'expense',
      amount: parseFloat(amount) || 0,
      merchant: merchant || 'General',
      category_id: category_id || null,
      transaction_date: date || new Date().toISOString(),
    };

    const { data, error } = await supabase.from('personal_transactions').insert([tx]).select();
    if (error) throw error;

    return res.json({ success: true, message: 'บันทึกรายการสำเร็จ', transaction: data[0] });
  } catch (err) {
    console.error('❌ Create transaction error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
});

// สแกนใบเสร็จ (Mock Scanner Endpoint)
app.post('/api/v1/transactions/scan-receipt', upload.single('receipt'), async (req, res) => {
  try {
    const { image } = req.body || {};
    const file = req.file;

    let merchant = 'comico (NHN THAILAND)';
    let total = 285.0;
    let parsedText = '';

    if (file && file.originalname) {
      parsedText = file.originalname;
      const match = file.originalname.match(/([^_]+)__?.*?(?:total|amt|amount)[_\-]?(\d+(?:[\.,]\d+)?)/i);
      if (match) {
        merchant = match[1].replace(/[-_]/g, ' ');
        total = parseFloat(match[2].replace(',', '.'));
      }
    } else if (image) {
      parsedText = 'Base64 Receipt Image Processed Successfully';
    }

    return res.json({
      success: true,
      merchant,
      total,
      date: new Date().toISOString(),
      parsedText,
    });
  } catch (err) {
    console.error('❌ Scan receipt error:', err);
    return res.status(500).json({ success: false, error: 'การอ่านสแกนใบเสร็จล้มเหลว' });
  }
});

// ==========================================
// GROUPS API (เตรียมไว้สำหรับ feature/group-management)
// ==========================================

// ดึงรายการกลุ่มทั้งหมดของผู้ใช้
app.get('/api/v1/groups/my', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;

    const { data, error } = await supabase
      .from('groups')
      .select('*')
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return res.json({ success: true, groups: data || [] });
  } catch (err) {
    console.error('❌ Fetch groups error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
});

// สร้างกลุ่มใหม่
app.post('/api/v1/groups/create', authenticate, async (req, res) => {
  try {
    const userId = req.user.id || req.user.user_id;
    const { name, category } = req.body || {};

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'กรุณาระบุชื่อกลุ่ม' });
    }

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
      members_count: 1,
      total_spend: 0,
      status_type: 'settled',
      amount: 0,
      icon,
      icon_bg: iconBg,
      icon_color: iconColor,
    };

    const { data, error } = await supabase.from('groups').insert([newGroup]).select();
    if (error) throw error;

    return res.json({ success: true, message: 'สร้างกลุ่มสำเร็จ', group: data[0] });
  } catch (err) {
    console.error('❌ Create Group Error:', err);
    return res.status(500).json({ success: false, error: `Database Error: ${err.message}` });
  }
});

// ==========================================
// SERVER START
// ==========================================
app.listen(PORT, () => {
  console.log(`=========================================`);
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
  console.log(`=========================================`);
});