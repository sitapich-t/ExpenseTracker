/**
 * setupEnv.js — รันก่อนทุก test file โดย Jest (setupFiles)
 * ตั้ง env ที่จำเป็นให้ tests ที่ require middleware/ลับ ซึ่งอ่านค่า ณ module load
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-for-jest-only';
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-key';