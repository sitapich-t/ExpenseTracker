/**
 * userRepository.js
 * -----------------
 * Data Access Layer สำหรับตาราง users
 * ทุก method คืนค่า { data, error } เหมือน Supabase client (await ได้เลย)
 */
const supabase = require('../config/supabase');

const TABLE = 'users';

module.exports = {
  async findByEmail(email) {
    return supabase.from(TABLE).select('*').eq('email', email).limit(1);
  },

  async findById(id) {
    return supabase.from(TABLE).select('*').eq('id', id).limit(1);
  },

  async findAuthById(id) {
    return supabase.from(TABLE).select('id, token_version').eq('id', id).maybeSingle();
  },

  async insert(user) {
    return supabase.from(TABLE).insert([user]).select();
  },

  async updateById(id, patch) {
    return supabase.from(TABLE).update(patch).eq('id', id);
  },
};
