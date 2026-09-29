require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

// Polyfill WebSocket สำหรับ Node.js < 22 ก่อนเรียก createClient
if (typeof global !== 'undefined' && !global.WebSocket) {
  try {
    global.WebSocket = require('ws');
  } catch (e) {
    // ws package optional
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_KEY in .env file!');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }
});

module.exports = supabase;