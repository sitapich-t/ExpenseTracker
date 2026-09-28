/**
 * ใช้ DDL จากไฟล์ .sql โดยตรง (Supabase JS ทำ DDL ไม่ได้)
 *
 *   node sql/apply.js sql/add_group_bill_split_columns.sql
 *
 * ใช้ DATABASE_URL จาก .env (ต้องเป็น connection string แบบ
 * postgresql:// ของ Supabase ไม่ใช่ SUPABASE_URL แบบ https://)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const file = process.argv[2];
if (!file) {
  console.error('usage: node sql/apply.js <file.sql>');
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  try {
    await client.connect();
    await client.query(sql);
    console.log(`applied: ${file}`);
  } catch (err) {
    console.error('apply failed:', err.message);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
})();
