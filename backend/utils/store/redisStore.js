/**
 * redisStore.js
 * -------------
 * ตัวขับ (driver) แบบ Redis สำหรับ rate-limit / single-use token
 * ใช้เมื่อตั้ง REDIS_URL ใน .env — รองรับการรันหลาย instance (scale out)
 *
 * หมายเหตุ: ทุก method เป็น async (ต่างจาก memoryStore ที่เป็น sync)
 * ฝั่งที่เรียกใช้ควร await เสมอ — await กับค่าที่เป็น sync ก็ทำงานได้ปกติ
 */
const Redis = require('ioredis');

let client = null;
let url = null;

function getClient() {
  if (!client) {
    if (!url) throw new Error('Redis store ยังไม่ได้ init (ต้องตั้งค่า REDIS_URL)');
    client = new Redis(url, {
      lazyConnect: false,
      maxRetriesPerRequest: null,
    });
    client.on('error', () => {});
  }
  return client;
}

function init(redisUrl) {
  url = redisUrl;
}

function toNumberOrRaw(value) {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

async function set(key, value, ttlMs) {
  await getClient().set(key, String(value), 'PX', Math.max(1, Math.round(ttlMs || 0)));
}

async function get(key) {
  const value = await getClient().get(key);
  return toNumberOrRaw(value);
}

async function ttlLeft(key) {
  const ttl = await getClient().ttl(key);
  return ttl < 0 ? 0 : ttl;
}

async function del(key) {
  await getClient().del(key);
}

async function incr(key, ttlMs) {
  const client = getClient();
  const next = await client.incr(key);
  await client.pexpire(key, Math.max(1, Math.round(ttlMs || 0)));
  return next;
}

async function incrDay(key) {
  const client = getClient();
  const next = await client.incr(key);
  await client.pexpire(key, Math.max(1, msUntilMidnight()));
  return next;
}

async function dayCount(key) {
  const value = await getClient().get(key);
  const n = Number(value);
  return Number.isNaN(n) ? 0 : n;
}

async function clearAll() {
  await getClient().flushdb();
}

module.exports = {
  init,
  set,
  get,
  ttlLeft,
  del,
  incr,
  incrDay,
  dayCount,
  msUntilMidnight,
  clearAll,
};