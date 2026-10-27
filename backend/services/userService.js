const userRepository = require('../repositories/userRepository');

function ensureClient() {
  if (!userRepository) {
    throw new Error('Supabase Client ไม่ได้ถูกเริ่มต้น ตรวจสอบค่า SUPABASE_URL และ SUPABASE_KEY ในไฟล์ .env');
  }
}

async function findUserByEmail(email) {
  ensureClient();
  const { data, error } = await userRepository.findByEmail(email);
  if (error) throw new Error(`Database Query Error: ${error.message}`);
  return data && data.length > 0 ? data[0] : null;
}

async function findUserById(id) {
  ensureClient();
  const { data, error } = await userRepository.findById(id);
  if (error) throw new Error(`Database Query Error: ${error.message}`);
  return data && data.length > 0 ? data[0] : null;
}

module.exports = { findUserByEmail, findUserById };
