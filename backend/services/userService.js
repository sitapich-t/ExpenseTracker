const supabase = require('../config/supabase');

function ensureClient() {
  if (!supabase) {
    throw new Error('Supabase Client ไม่ได้ถูกเริ่มต้น ตรวจสอบค่า SUPABASE_URL และ SUPABASE_KEY ในไฟล์ .env');
  }
}

async function findUserByEmail(email) {
  ensureClient();
  const { data, error } = await supabase.from('users').select('*').eq('email', email).limit(1);
  if (error) throw new Error(`Database Query Error: ${error.message}`);
  return data && data.length > 0 ? data[0] : null;
}

async function findUserById(id) {
  ensureClient();
  const { data, error } = await supabase.from('users').select('*').eq('id', id).limit(1);
  if (error) throw new Error(`Database Query Error: ${error.message}`);
  return data && data.length > 0 ? data[0] : null;
}

module.exports = { findUserByEmail, findUserById };
