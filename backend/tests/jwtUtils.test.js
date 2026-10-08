/**
 * jwtUtils.test.js
 * รัน: npx jest tests/jwtUtils.test.js
 */
const jwt = require('jsonwebtoken');
const {
  TTL,
  JWT_SECRET,
  signFlowToken,
  verifyFlowToken,
  signAccessToken,
  verifyAccessToken
} = require('../utils/jwt');

describe('flow tokens (สั้น, มี type + jti)', () => {
  test('sign/verify round-trip คืน payload ครบและมี jti', () => {
    const token = signFlowToken('register_otp', { phone: '0812345678' }, TTL.register_otp);
    const decoded = verifyFlowToken(token, 'register_otp');

    expect(decoded.type).toBe('register_otp');
    expect(decoded.phone).toBe('0812345678');
    expect(decoded.jti).toBeDefined();
    expect(decoded.exp - decoded.iat).toBe(TTL.register_otp);
  });

  test('verify ปฏิเสธ token ผิด type (กัน reset token ใช้แทนกัน)', () => {
    const token = signFlowToken('reset_otp', { userId: 'u1' }, TTL.reset_otp);
    expect(() => verifyFlowToken(token, 'register_otp')).toThrow(/type/);
  });

  test('verify ปฏิเสธ token หมดอายุ', () => {
    const expired = jwt.sign(
      { type: 'register_otp', jti: 'x', phone: '0812345678' },
      JWT_SECRET,
      { expiresIn: -10 }
    );
    expect(() => verifyFlowToken(expired, 'register_otp')).toThrow('jwt expired');
  });

  test('verify ปฏิเสธ token ที่เซ็นด้วยคนละ secret', () => {
    const forged = jwt.sign({ type: 'register_otp', jti: 'x' }, 'other-secret', {
      expiresIn: 600
    });
    expect(() => verifyFlowToken(forged, 'register_otp')).toThrow();
  });
});

describe('access token', () => {
  test('มี type=access + ver (ตัวนับเซสชัน) และอายุ 30 วัน', () => {
    const token = signAccessToken({ id: 'u1', name: 'A', email: 'a@b.c', phone: '0812345678', ver: 0 });
    const decoded = verifyAccessToken(token);

    expect(decoded.type).toBe('access');
    expect(decoded.id).toBe('u1');
    expect(decoded.ver).toBe(0);
    expect(decoded.exp - decoded.iat).toBe(30 * 24 * 60 * 60);
  });
});
