/**
 * store/index.js
 * --------------
 * ตัวเลือก store กลาง: ใช้ Redis ถ้าตั้ง REDIS_URL ไว้ ไม่เช่นนั้นใช้ memoryStore
 * เพื่อให้ rate-limit / single-use token อยู่รอดตอน restart หรือรันหลาย instance
 */
const memoryStore = require('../memoryStore');

const REDIS_URL = process.env.REDIS_URL;

let store = memoryStore;

if (REDIS_URL) {
  try {
    const redisStore = require('./redisStore');
    redisStore.init(REDIS_URL);
    store = redisStore;
  } catch (initErr) {
    // ใช้ memory แทน ถ้าติดตั้ง redisDriver ไม่สำเร็จ (เช่น ลืมติดตั้ง ioredis)
    store = memoryStore;
  }
}

module.exports = store;