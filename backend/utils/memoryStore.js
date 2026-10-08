const store = new Map();

function set(key, value, ttlMs) {
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry.value;
}

function ttlLeft(key) {
  const entry = store.get(key);
  if (!entry) return 0;
  const left = entry.expiresAt - Date.now();
  if (left <= 0) {
    store.delete(key);
    return 0;
  }
  return Math.ceil(left / 1000);
}

function del(key) {
  store.delete(key);
}

function incr(key, ttlMs) {
  const current = get(key);
  const next = (typeof current === 'number' ? current : 0) + 1;
  set(key, next, ttlMs);
  return next;
}

function msUntilMidnight() {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
}

function incrDay(key) {
  const current = get(key);
  const next = (typeof current === 'number' ? current : 0) + 1;
  set(key, next, msUntilMidnight());
  return next;
}

function dayCount(key) {
  const value = get(key);
  return typeof value === 'number' ? value : 0;
}

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.expiresAt <= now) store.delete(key);
  }
}, 60 * 1000);
if (sweep.unref) sweep.unref();

function clearAll() {
  store.clear();
}

module.exports = { set, get, ttlLeft, del, incr, incrDay, dayCount, msUntilMidnight, clearAll };
