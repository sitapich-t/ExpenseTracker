/**
 * rateLimitMiddleware.test.js
 * รัน: npx jest tests/rateLimitMiddleware.test.js
 */
const store = require('../utils/memoryStore');
const { signFlowToken, TTL } = require('../utils/jwt');
const {
  LIMITS,
  otpRequestLimiter,
  otpVerifyLimiter,
  loadFlowToken,
  recordOtpSent,
  recordFailedVerify,
  attemptsLeft,
  clearVerifyAttempts
} = require('../middlewares/rateLimitMiddleware');

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    set(key, value) {
      res.headers[key] = value;
      return res;
    },
    json(obj) {
      res.body = obj;
      return res;
    }
  };
  return res;
}

function run(middleware, req) {
  const res = mockRes();
  let nextCalled = false;
  middleware(req, res, () => {
    nextCalled = true;
  });
  return { res, nextCalled };
}

function makeRegisterToken(email = 'a@b.c') {
  return signFlowToken(
    'register_otp',
    { email, name: 'A', hashedPassword: 'h', otpHash: 'o' },
    TTL.register_otp
  );
}

describe('otpRequestLimiter (cooldown + daily ต่อ email/IP)', () => {
  beforeEach(() => store.clearAll());

  const reqBody = { body: { email: 'a@b.c' }, ip: '1.1.1.1' };

  test('ครั้งแรกผ่านปกติ', () => {
    const { nextCalled } = run(otpRequestLimiter('register'), reqBody);
    expect(nextCalled).toBe(true);
  });

  test('cooldown 60 วินาที: ขอซ้ำภายใน cooldown โดน 429 + Retry-After', () => {
    recordOtpSent('register', { email: 'a@b.c', ip: '1.1.1.1' });
    const { res, nextCalled } = run(otpRequestLimiter('register'), reqBody);

    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBeDefined();
    expect(res.body.retry_after).toBeGreaterThan(0);
    expect(res.body.success).toBe(false);
  });

  test('cooldown คนละ IP แต่ email เดียวก็ยังโดน 429', () => {
    recordOtpSent('register', { email: 'a@b.c', ip: '1.1.1.1' });
    const { res, nextCalled } = run(otpRequestLimiter('register'), {
      body: { email: 'a@b.c' },
      ip: '9.9.9.9'
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  test('daily limit ต่อ email: เกิน 5 ครั้ง/วัน โดน 429', () => {
    for (let i = 0; i < LIMITS.emailDaily; i++) store.incrDay('day:register:e:a@b.c');

    const { res, nextCalled } = run(otpRequestLimiter('register'), reqBody);
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  test('daily limit ต่อ IP: เกิน 10 ครั้ง/วัน โดน 429 (คนละ email ก็โดน)', () => {
    for (let i = 0; i < LIMITS.ipDaily; i++) store.incrDay('day:register:ip:1.1.1.1');

    const { res, nextCalled } = run(otpRequestLimiter('register'), {
      body: { email: 'x@y.z' },
      ip: '1.1.1.1'
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  test('fromToken: cooldown อ่าน email จาก flow token (resend)', () => {
    recordOtpSent('register', { email: 'a@b.c', ip: '1.1.1.1' });
    const { res, nextCalled } = run(otpRequestLimiter('register', { fromToken: true }), {
      body: { registration_token: makeRegisterToken('a@b.c') },
      flowToken: { email: 'a@b.c' },
      ip: '1.1.1.1'
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
  });
});

describe('brute-force protection (verify)', () => {
  beforeEach(() => store.clearAll());

  const t = { jti: 'jti-1', email: 'a@b.c' };

  test('ล้มเหลว 5 ครั้ง → token ถูกบล็อกและ attempts หมด', () => {
    const results = [];
    for (let i = 0; i < LIMITS.verifyPerToken; i++) {
      results.push(recordFailedVerify('register', t));
    }
    expect(results).toEqual([4, 3, 2, 1, 0]);
    expect(attemptsLeft(t)).toBe(0);

    const { res, nextCalled } = run(otpVerifyLimiter('register'), { flowToken: t });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
  });

  test('ยังไม่ครบจำนวนครั้ง → ผ่านและบอกจำนวนครั้งที่เหลือ', () => {
    recordFailedVerify('register', t);
    expect(attemptsLeft(t)).toBe(LIMITS.verifyPerToken - 1);

    const { nextCalled } = run(otpVerifyLimiter('register'), { flowToken: t });
    expect(nextCalled).toBe(true);
  });

  test('verify สำเร็จ → clearVerifyAttempts รีเซ็ตตัวนับของ token', () => {
    recordFailedVerify('register', t);
    recordFailedVerify('register', t);
    clearVerifyAttempts(t);
    expect(attemptsLeft(t)).toBe(LIMITS.verifyPerToken);
  });

  test('daily verify limit ต่อ email: เกิน 15 ครั้ง/วัน → 429 แม้ token ใหม่', () => {
    for (let i = 0; i < LIMITS.verifyPerEmailDay; i++) {
      store.incrDay('vday:register:e:a@b.c');
    }
    const fresh = { jti: 'jti-2', email: 'a@b.c' };
    const { res, nextCalled } = run(otpVerifyLimiter('register'), { flowToken: fresh });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(429);
  });
});

describe('loadFlowToken (verify JWT ก่อนเสมอ ห้าม decode เปล่า ๆ)', () => {
  beforeEach(() => store.clearAll());

  test('token ถูกต้อง → req.flowToken ถูกตั้งค่าและ next ถูกเรียก', () => {
    const req = { body: { registration_token: makeRegisterToken() } };
    const { res, nextCalled } = run(loadFlowToken('register_otp'), req);

    expect(nextCalled).toBe(true);
    expect(req.flowToken.email).toBe('a@b.c');
    expect(res.statusCode).toBe(200);
  });

  test('ไม่มี token → 400', () => {
    const { res, nextCalled } = run(loadFlowToken('register_otp'), { body: {} });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(400);
  });

  test('token ผิด type → 401', () => {
    const token = signFlowToken('reset_otp', { userId: 'u1' }, TTL.reset_otp);
    const { res, nextCalled } = run(loadFlowToken('register_otp'), {
      body: { registration_token: token }
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  test('token หมดอายุ → 401 พร้อมข้อความขอ OTP ใหม่', () => {
    const jwt = require('jsonwebtoken');
    const { JWT_SECRET } = require('../utils/jwt');
    const expired = jwt.sign(
      { type: 'register_otp', jti: 'x', email: 'a@b.c' },
      JWT_SECRET,
      { expiresIn: -10 }
    );
    const { res, nextCalled } = run(loadFlowToken('register_otp'), {
      body: { registration_token: expired }
    });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/หมดอายุ/);
  });
});
