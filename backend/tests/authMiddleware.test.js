/**
 * authMiddleware.test.js
 * รัน: npx jest tests/authMiddleware.test.js
 * ทดสอบเฉพาะเส้นทางที่ไม่ต้องแตะ DB (type/ver ก่อน query)
 */
process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-key';

const jwt = require('jsonwebtoken');
const authenticate = require('../middlewares/authMiddleware');
const { signFlowToken, signAccessToken, JWT_SECRET, TTL } = require('../utils/jwt');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(obj) {
      res.body = obj;
      return res;
    }
  };
  return res;
}

function run(req) {
  const res = mockRes();
  let nextCalled = false;
  authenticate(req, res, () => {
    nextCalled = true;
  }).catch((e) => {
    throw e;
  });
  return { res, nextCalled };
}

describe('authenticate middleware', () => {
  test('ไม่มี token → 401 Access Token Required', () => {
    const { res, nextCalled } = run({ headers: {} });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toBe('Access Token Required');
  });

  test('token สุ่ม/เสีย → 401', () => {
    const { res, nextCalled } = run({ headers: { authorization: 'Bearer garbage.token.here' } });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  test('flow token (registration/reset) ถูกปฏิเสธ แม้เซ็นถูก key → 401', () => {
    const flowToken = signFlowToken(
      'register_otp',
      { email: 'a@b.c', name: 'A', hashedPassword: 'h', otpHash: 'o' },
      TTL.register_otp
    );
    const { res, nextCalled } = run({ headers: { authorization: `Bearer ${flowToken}` } });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  test('access token ที่ไม่มี claim ver (รุ่นก่อน deploy) → 401 บังคับ login ใหม่', () => {
    const legacy = jwt.sign({ type: 'access', id: 'u1', email: 'a@b.c', name: 'A' }, JWT_SECRET, {
      expiresIn: '30d'
    });
    const { res, nextCalled } = run({ headers: { authorization: `Bearer ${legacy}` } });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/เข้าสู่ระบบใหม่/);
  });

  test('reset_verified_token ถูกปฏิเสธ → 401', () => {
    const token = signFlowToken('reset_verified', { userId: 'u1' }, TTL.reset_verified);
    const { res, nextCalled } = run({ headers: { authorization: `Bearer ${token}` } });
    expect(nextCalled).toBe(false);
    expect(res.statusCode).toBe(401);
  });

  test('signAccessToken สร้าง token ที่มี type+ver ครบ (ผ่าน 2 เงื่อนไขแรก)', () => {
    const token = signAccessToken({ id: 'u1', email: 'a@b.c', name: 'A', ver: 0 });
    const decoded = jwt.verify(token, JWT_SECRET);
    expect(decoded.type).toBe('access');
    expect(decoded.ver).toBe(0);
    expect(typeof decoded.ver).toBe('number');
  });
});
