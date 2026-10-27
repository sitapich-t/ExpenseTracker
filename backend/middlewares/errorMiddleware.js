/**
 * errorMiddleware.js
 * ------------------
 * Error handler กลาง: map AppError / Multer error / error ทั่วไป
 * ให้เป็น JSON response รูปแบบเดียวกันทั้งระบบ
 */
const multer = require('multer');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  let status = err.statusCode || err.status || 500;
  let message = err.message || 'Internal Server Error';

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      message = 'ไฟล์ใหญ่เกินไป';
    } else {
      status = 400;
    }
  }

  const meta = {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl,
    status,
  };

  if (status >= 500) {
    logger.error('Unhandled error', { ...meta, error: err.message, stack: err.stack });
  } else {
    logger.warn('Request error', { ...meta, error: message });
  }

  if (res.headersSent) return next(err);

  return res.status(status).json({ success: false, error: message });
};
