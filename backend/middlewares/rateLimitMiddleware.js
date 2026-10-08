const store = require('../utils/memoryStore');
const { verifyFlowToken } = require('../utils/jwt');

const LIMITS = {
  cooldownSec: 60,
  emailDaily: 5,
  ipDaily: 10,
  verifyPerToken: 5,
  verifyPerEmailDay: 15,
  confirmPerIpHour: 10,
  authPerIpMin: 60
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

function authIpLimiter(req, res, next) {
  const ip = clientIp(req);
  const n = store.incr(`authip:${ip}`, 60 * 1000);
  if (n > LIMITS.authPerIpMin) {
    return retryAfter(res, store.ttlLeft(`authip:${ip}`), 'ส่งคำขอบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่');
  }
  return next();
}

function confirmIpLimiter(req, res, next) {
  const ip = clientIp(req);
  const n = store.incr(`confirm:${ip}`, 60 * 60 * 1000);
  if (n > LIMITS.confirmPerIpHour) {
    return retryAfter(res, store.ttlLeft(`confirm:${ip}`), 'พยายามยืนยันบ่อยเกินไป กรุณาลองใหม่ภายหลัง');
  }
  return next();
}

function otpRequestLimiter(purpose, options = {}) {
  const fromToken = !!options.fromToken;
  return (req, res, next) => {
    const email = fromToken
      ? emailKey(req.flowToken && req.flowToken.email)
      : emailKey(req.body && req.body.email);
    const ip = clientIp(req);

    if (email) {
      const left = store.ttlLeft(`cd:${purpose}:e:${email}`);
      if (left > 0) return retryAfter(res, left, `โปรดรอ ${left} วินาทีก่อนขอรหัส OTP ใหม่`);
    }
    if (email && store.dayCount(`day:${purpose}:e:${email}`) >= LIMITS.emailDaily) {
      return retryAfter(res, secondsUntilMidnight(), 'ขอรหัส OTP วันนี้ครบ 5 ครั้งแล้ว กรุณาลองใหม่วันพรุ่งนี้');
    }
    if (store.dayCount(`day:${purpose}:ip:${ip}`) >= LIMITS.ipDaily) {
      return retryAfter(res, secondsUntilMidnight(), 'เครื่องนี้ขอรหัส OTP บ่อยเกินไป กรุณาลองใหม่วันพรุ่งนี้');
    }
    return next();
  };
}

function recordOtpSent(purpose, { email, ip } = {}) {
  const ttl = LIMITS.cooldownSec * 1000;
  if (email) {
    store.set(`cd:${purpose}:e:${email}`, 1, ttl);
    store.incrDay(`day:${purpose}:e:${email}`);
  }
  if (ip) store.incrDay(`day:${purpose}:ip:${ip}`);
}

function otpVerifyLimiter(purpose) {
  return (req, res, next) => {
    const t = req.flowToken || {};
    if (store.get(`blocked:${t.jti}`)) {
      return retryAfter(
        res,
        store.ttlLeft(`blocked:${t.jti}`),
        'พยายามยืนยันรหัส OTP บ่อยเกินไป กรุณาร้องขอรหัส OTP ใหม่'
      );
    }
    if (t.email && store.dayCount(`vday:${purpose}:e:${t.email}`) >= LIMITS.verifyPerEmailDay) {
      return retryAfter(res, secondsUntilMidnight(), 'ยืนยันรหัส OTP เกินจำนวนครั้งที่อนุญาตในวันนี้');
    }
    return next();
  };
}

function recordFailedVerify(purpose, t) {
  const n = store.incr(`att:${t.jti}`, 10 * 60 * 1000);
  if (n >= LIMITS.verifyPerToken) store.set(`blocked:${t.jti}`, 1, 10 * 60 * 1000);
  if (t.email) store.incrDay(`vday:${purpose}:e:${t.email}`);
  return Math.max(LIMITS.verifyPerToken - n, 0);
}

function attemptsLeft(t) {
  const n = store.get(`att:${t.jti}`);
  return Math.max(LIMITS.verifyPerToken - (typeof n === 'number' ? n : 0), 0);
}

function clearVerifyAttempts(t) {
  if (t && t.jti) store.del(`att:${t.jti}`);
}

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
  otpRequestLimiter,
  otpVerifyLimiter,
  loadFlowToken,
  recordOtpSent,
  recordFailedVerify,
  attemptsLeft,
  clearVerifyAttempts
};
