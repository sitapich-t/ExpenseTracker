const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'student_wallet_jwt_secret_key_2026';

const TTL = {
  register_otp: 600,
  reset_otp: 600,
  reset_verified: 240,
  access: '30d'
};

function signFlowToken(type, payload, ttlSec) {
  return jwt.sign({ type, jti: crypto.randomUUID(), ...payload }, JWT_SECRET, {
    expiresIn: ttlSec != null ? ttlSec : TTL[type]
  });
}

function verifyFlowToken(token, expectedType) {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.type !== expectedType) {
    const err = new Error('invalid token type');
    err.code = 'ERR_TOKEN_TYPE';
    throw err;
  }
  return decoded;
}

function signAccessToken({ id, name, email, phone, ver }) {
  return jwt.sign(
    { type: 'access', id, name: name || null, email: email || null, phone: phone || null, ver },
    JWT_SECRET,
    { expiresIn: TTL.access }
  );
}

function verifyAccessToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = { TTL, signFlowToken, verifyFlowToken, signAccessToken, verifyAccessToken, JWT_SECRET };
