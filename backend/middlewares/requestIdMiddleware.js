/**
 * requestIdMiddleware.js
 * ----------------------
 * แนบ request id ให้ทุก request เพื่อใช้ติดตาม log ข้ามชั้นต่าง ๆ
 */
const crypto = require('crypto');

module.exports = (req, res, next) => {
  req.id = req.headers['x-request-id'] || crypto.randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
};
