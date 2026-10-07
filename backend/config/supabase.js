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

let supabase = null;
if (SUPABASE_URL && SUPABASE_KEY) {
  supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false }
  });
} else {
  console.warn('⚠️ Supabase URL/KEY not set. Operating in local MySQL/fallback mode.');
}

module.exports = supabase;