const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const authFlowController = require('../controllers/authFlowController');
const {
  authIpLimiter,
  confirmIpLimiter,
  otpRequestLimiter,
  otpVerifyLimiter,
  loadFlowToken
} = require('../middlewares/rateLimitMiddleware');

// ==========================================
// Auth Routes (Public)
// ==========================================
router.use(authIpLimiter);

// Register (stateless, OTP ทางอีเมล)
router.post(
  '/register/request-otp',
  otpRequestLimiter('register'),
  authFlowController.registerRequestOtp
);
router.post(
  '/register/verify-otp',
  loadFlowToken('register_otp'),
  otpVerifyLimiter('register'),
  authFlowController.registerVerifyOtp
);
router.post(
  '/register/resend-otp',
  loadFlowToken('register_otp'),
  otpRequestLimiter('register', { fromToken: true }),
  authFlowController.registerResendOtp
);

// Password reset (stateless, OTP ทางอีเมล)
router.post(
  '/reset-password/request-otp',
  otpRequestLimiter('reset'),
  authFlowController.resetRequestOtp
);
router.post(
  '/reset-password/verify-otp',
  loadFlowToken('reset_otp'),
  otpVerifyLimiter('reset'),
  authFlowController.resetVerifyOtp
);
router.post(
  '/reset-password/confirm',
  loadFlowToken('reset_verified'),
  confirmIpLimiter,
  authFlowController.resetConfirm
);

// Login
router.post('/login', authController.login);

module.exports = router;
