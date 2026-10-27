const store = require('../utils/store');
const { verifyFlowToken } = require('../utils/jwt');

const LIMITS = {
  cooldownSec: 60,
  emailDaily: 5,
  ipDaily: 10,
  verifyPerToken: 5,
  verifyPerEmailDay: 15,
  confirmPerIpHour: 10,
  authPerIpMin: 60,
  loginMaxAttempts: 3,
  loginLockoutSec: 15 * 60
};

function retryAfter(res, seconds, error) {
  const s = Math.max(1, Math.ceil(seconds));
  return res
    .status(429)
    .set('Retry-After', String(s))
    .json({ success: false, error, retry_after: s });
}

function clientIp(req) {
  return req.ip || (req.socket && req.socket.remoteAddress) || 'unknown';
}

function emailKey(email) {
  return String(email || '').trim().toLowerCase();
}

function secondsUntilMidnight() {
  return Math.ceil(store.msUntilMidnight() / 1000);
}

/* ==========================================================================
   IP-based Limiters
   ========================================================================== */

async function authIpLimiter(req, res, next) {
  try {
    const ip = clientIp(req);
    const n = await store.incr(`authip:${ip}`, 60 * 1000);
    if (n > LIMITS.authPerIpMin) {
      return retryAfter(res, await store.ttlLeft(`authip:${ip}`), 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

async function confirmIpLimiter(req, res, next) {
  try {
    const ip = clientIp(req);
    const n = await store.incr(`confirm:${ip}`, 60 * 60 * 1000);
    if (n > LIMITS.confirmPerIpHour) {
      return retryAfter(res, await store.ttlLeft(`confirm:${ip}`), 'พยายามยืนยันบ่อยเกินไป กรุณาลองใหม่ภายหลัง');
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/* ==========================================================================
   Login Rate Limiting (ล็อกอินผิดเกินกำหนด)
   ========================================================================== */

/**
 * Middleware เช็กก่อนเข้า controller ล็อกอิน
 * ถ้าติด Cooldown จะบล็อกทันที
 */
async function loginAttemptLimiter(req, res, next) {
  try {
    const email = emailKey(req.body && req.body.email);
    if (!email) return next();

    const lockLeft = await store.ttlLeft(`login:lock:${email}`);
    if (lockLeft > 0) {
      const minutes = Math.ceil(lockLeft / 60);
      return retryAfter(
        res,
        lockLeft,
        `พยายามเข้าสู่ระบบผิดเกินกำหนด กรุณารอ ${minutes} นาที แล้วลองใหม่อีกครั้ง`
      );
    }
    return next();
  } catch (err) {
    return next(err);
  }
}

/**
 * เรียกเมื่อผู้ใช้ระบุรหัสผ่านผิด
 * @returns {Promise<number>} จำนวนครั้งที่เหลือที่ลองได้
 */
async function recordFailedLogin(email) {
  const key = emailKey(email);
  if (!key) return LIMITS.loginMaxAttempts;

  const ttl = LIMITS.loginLockoutSec * 1000;
  const n = await store.incr(`login:att:${key}`, ttl);

  if (n >= LIMITS.loginMaxAttempts) {
    // ล็อกบัญชีชั่วคราวเป็นเวลา 15 นาที
    await store.set(`login:lock:${key}`, 1, ttl);
    // ล้างนับครั้ง เพื่อเริ่มนับใหม่หลังหมด Cooldown
    await store.del(`login:att:${key}`);
  }

  return Math.max(LIMITS.loginMaxAttempts - n, 0);
}

/**
 * คืนค่าจำนวนครั้งการล็อกอินที่เหลือ
 * @returns {Promise<number>}
 */
async function loginAttemptsLeft(email) {
  const key = emailKey(email);
  if (!key) return LIMITS.loginMaxAttempts;
  const n = await store.get(`login:att:${key}`);
  return Math.max(LIMITS.loginMaxAttempts - (typeof n === 'number' ? n : 0), 0);
}

/**
 * ล้างประวัติเมื่อล็อกอินสำเร็จ
 */
async function clearLoginAttempts(email) {
  const key = emailKey(email);
  if (key) {
    await store.del(`login:att:${key}`);
    await store.del(`login:lock:${key}`);
  }
}

/* ==========================================================================
   OTP Request & Verify Limiters
   ========================================================================== */

function otpRequestLimiter(purpose, options = {}) {
  const fromToken = !!options.fromToken;
  return async (req, res, next) => {
    try {
      const email = fromToken
        ? emailKey(req.flowToken && req.flowToken.email)
        : emailKey(req.body && req.body.email);
      const ip = clientIp(req);

      if (email) {
        const left = await store.ttlLeft(`cd:${purpose}:e:${email}`);
        if (left > 0) return retryAfter(res, left, `โปรดรอ ${left} วินาทีก่อนขอรหัส OTP ใหม่`);
      }
      if (email && (await store.dayCount(`day:${purpose}:e:${email}`)) >= LIMITS.emailDaily) {
        return retryAfter(res, secondsUntilMidnight(), 'ขอรหัส OTP วันนี้ครบ 5 ครั้งแล้ว กรุณาลองใหม่วันพรุ่งนี้');
      }
      if ((await store.dayCount(`day:${purpose}:ip:${ip}`)) >= LIMITS.ipDaily) {
        return retryAfter(res, secondsUntilMidnight(), 'เครื่องนี้ขอรหัส OTP บ่อยเกินไป กรุณาลองใหม่วันพรุ่งนี้');
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

async function recordOtpSent(purpose, { email, ip } = {}) {
  const ttl = LIMITS.cooldownSec * 1000;
  if (email) {
    await store.set(`cd:${purpose}:e:${email}`, 1, ttl);
    await store.incrDay(`day:${purpose}:e:${email}`);
  }
  if (ip) await store.incrDay(`day:${purpose}:ip:${ip}`);
}

function otpVerifyLimiter(purpose) {
  return async (req, res, next) => {
    try {
      const t = req.flowToken || {};
      if (await store.get(`blocked:${t.jti}`)) {
        return retryAfter(
          res,
          await store.ttlLeft(`blocked:${t.jti}`),
          'พยายามยืนยันรหัส OTP บ่อยเกินไป กรุณาร้องขอรหัส OTP ใหม่'
        );
      }
      if (t.email && (await store.dayCount(`vday:${purpose}:e:${t.email}`)) >= LIMITS.verifyPerEmailDay) {
        return retryAfter(res, secondsUntilMidnight(), 'ยืนยันรหัส OTP เกินจำนวนครั้งที่อนุญาตในวันนี้');
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

async function recordFailedVerify(purpose, t) {
  const n = await store.incr(`att:${t.jti}`, 10 * 60 * 1000);
  if (n >= LIMITS.verifyPerToken) await store.set(`blocked:${t.jti}`, 1, 10 * 60 * 1000);
  if (t.email) await store.incrDay(`vday:${purpose}:e:${t.email}`);
  return Math.max(LIMITS.verifyPerToken - n, 0);
}

async function attemptsLeft(t) {
  const n = await store.get(`att:${t.jti}`);
  return Math.max(LIMITS.verifyPerToken - (typeof n === 'number' ? n : 0), 0);
}

async function clearVerifyAttempts(t) {
  if (t && t.jti) await store.del(`att:${t.jti}`);
}

/* ==========================================================================
   Token Loaders
   ========================================================================== */

function loadFlowToken(expectedType) {
  return (req, res, next) => {
    const body = req.body || {};
    const token =
      body.registration_token || body.password_reset_token || body.reset_verified_token;
    if (!token) {
      return res.status(400).json({ success: false, error: 'กรุณาส่งโทเคน (token) มาด้วย' });
    }
    try {
      req.flowToken = verifyFlowToken(token, expectedType);
      return next();
    } catch (err) {
      if (err.name === 'TokenExpiredError') {
        return res
          .status(401)
          .json({ success: false, error: 'โทเคนหมดอายุ กรุณาร้องขอรหัส OTP ใหม่' });
      }
      return res.status(401).json({ success: false, error: 'โทเคนไม่ถูกต้อง' });
    }
  };
}

module.exports = {
  LIMITS,
  authIpLimiter,
  confirmIpLimiter,
  // --- Export Login Limiter ---
  loginAttemptLimiter,
  recordFailedLogin,
  loginAttemptsLeft,
  clearLoginAttempts,
  // --- Export OTP Limiters ---
  otpRequestLimiter,
  otpVerifyLimiter,
  loadFlowToken,
  recordOtpSent,
  recordFailedVerify,
  attemptsLeft,
  clearVerifyAttempts
};