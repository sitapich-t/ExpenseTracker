/**
 * memoryStore.test.js
 * รัน: npx jest tests/memoryStore.test.js
 */
const store = require('../utils/memoryStore');

describe('memoryStore', () => {
  beforeEach(() => {
    store.clearAll();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('set/get คืนค่าตามที่ใส่ และหมดอายุตาม TTL', () => {
    store.set('k', 1, 1000);
    expect(store.get('k')).toBe(1);
    expect(store.ttlLeft('k')).toBeGreaterThan(0);

    jest.advanceTimersByTime(1001);
    expect(store.get('k')).toBeUndefined();
    expect(store.ttlLeft('k')).toBe(0);
  });

  test('incr เพิ่มทีละ 1 และคืนค่าปัจจุบัน', () => {
    expect(store.incr('c', 5000)).toBe(1);
    expect(store.incr('c', 5000)).toBe(2);
    expect(store.incr('c', 5000)).toBe(3);
    expect(store.get('c')).toBe(3);
  });

  test('incrDay นับสะสมและรีเซ็ตเมื่อหมดวัน', () => {
    expect(store.incrDay('d')).toBe(1);
    expect(store.incrDay('d')).toBe(2);
    expect(store.dayCount('d')).toBe(2);

    jest.advanceTimersByTime(store.msUntilMidnight() + 1000);
    expect(store.dayCount('d')).toBe(0);
  });

  test('del / clearAll ล้างค่าออก', () => {
    store.set('a', 1, 5000);
    store.del('a');
    expect(store.get('a')).toBeUndefined();

    store.set('b', 1, 5000);
    store.clearAll();
    expect(store.get('b')).toBeUndefined();
  });
});
