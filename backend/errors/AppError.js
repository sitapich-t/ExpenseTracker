/**
 * AppError.js
 * -----------
 * Error class มาตรฐานของแอป ใช้คู่กับ middlewares/errorMiddleware.js
 * เพื่อให้ทุก error ถูก map เป็น HTTP status ที่คาดเดาได้
 */
class AppError extends Error {
  constructor(message, statusCode = 500, options = {}) {
    super(message);
    const { code = null, isOperational = true, cause } = options;

    this.name = 'AppError';
    this.statusCode = statusCode;
    this.status = statusCode; // เผื่อโค้ดเดิมที่อ่าน err.status
    this.code = code;
    this.isOperational = isOperational;
    if (cause) this.cause = cause;

    if (Error.captureStackTrace) Error.captureStackTrace(this, AppError);
  }

  static badRequest(message, options) {
    return new AppError(message, 400, options);
  }

  static unauthorized(message = 'Unauthorized', options) {
    return new AppError(message, 401, options);
  }

  static forbidden(message = 'Forbidden', options) {
    return new AppError(message, 403, options);
  }

  static notFound(message = 'Not Found', options) {
    return new AppError(message, 404, options);
  }

  static conflict(message, options) {
    return new AppError(message, 409, options);
  }

  static internal(message = 'Internal Server Error', options) {
    return new AppError(message, 500, { isOperational: false, ...options });
  }
}

module.exports = AppError;
