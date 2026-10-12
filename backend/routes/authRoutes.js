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
// Auth Routes (Public) — จำกัดอัตราการส่งคำขอต่อ IP ทุกเส้นทาง
// ==========================================
router.use(authIpLimiter);

/**
 * @openapi
 * tags:
 *   - name: Auth
 */

/**
 * @openapi
 * /api/v1/auth/register/request-otp:
 *   post:
 *     summary: ขอรหัส OTP สำหรับสมัครสมาชิก
 *     description: "ส่ง OTP 6 หลักทางอีเมล (หมดอายุ 10 นาที) เพื่อใช้สมัครสมาชิกแบบไม่เก็บข้อมูลค้างใน DB"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, name, password]
 *             properties:
 *               email: { type: string, format: email, example: "user@example.com" }
 *               name: { type: string, example: "สมชาย" }
 *               password: { type: string, format: password, minLength: 8 }
 *     responses:
 *       200:
 *         description: ส่ง OTP สำเร็จ คืน registration_token (อายุ 10 นาที)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 registration_token: { type: string }
 *                 message: { type: string }
 *       429:
 *         description: ส่งคำขอบ่อยเกินไป (cooldown 60 วินาที / 5 ครั้งต่อวันต่ออีเมล / 10 ครั้งต่อวันต่อ IP)
 *       400:
 *         description: ข้อมูลไม่ถูกต้อง (email/name/password)
 */
router.post(
  '/register/request-otp',
  otpRequestLimiter('register'),
  authFlowController.registerRequestOtp
);

/**
 * @openapi
 * /api/v1/auth/register/verify-otp:
 *   post:
 *     summary: ตรวจ OTP เพื่อสร้างบัญชีผู้ใช้
 *     description: "ยืนยัน OTP ที่ได้จาก request-otp ระบบจะสร้างผู้ใช้และคืน Access Token (ลองผิด 5 ครั้ง -> token ถูกบล็อก)"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [registration_token, otp]
 *             properties:
 *               registration_token: { type: string }
 *               otp: { type: string, example: "123456" }
 *     responses:
 *       201:
 *         description: สมัครสมาชิกสำเร็จ พร้อม access_token
 *       401:
 *         description: OTP ไม่ถูกต้อง / token หมดอายุหรือถูกใช้แล้ว
 *       429:
 *         description: พยายามยืนยันบ่อยเกินไป
 */
router.post(
  '/register/verify-otp',
  loadFlowToken('register_otp'),
  otpVerifyLimiter('register'),
  authFlowController.registerVerifyOtp
);

/**
 * @openapi
 * /api/v1/auth/register/resend-otp:
 *   post:
 *     summary: ขอ OTP ใหม่ (ส่งอีกครั้ง)
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [registration_token]
 *             properties:
 *               registration_token: { type: string }
 *     responses:
 *       200:
 *         description: ส่ง OTP ใหม่สำเร็จ และคืน registration_token ใหม่
 *       429:
 *         description: รอ cooldown ก่อนขอใหม่
 */
router.post(
  '/register/resend-otp',
  loadFlowToken('register_otp'),
  otpRequestLimiter('register', { fromToken: true }),
  authFlowController.registerResendOtp
);

/**
 * @openapi
 * /api/v1/auth/reset-password/request-otp:
 *   post:
 *     summary: ขอรหัส OTP สำหรับรีเซ็ตรหัสผ่าน
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, format: email }
 *     responses:
 *       200:
 *         description: ส่ง OTP สำเร็จ คืน password_reset_token (อายุ 10 นาที)
 *       429:
 *         description: ส่งคำขอบ่อยเกินไป
 */
router.post(
  '/reset-password/request-otp',
  otpRequestLimiter('reset'),
  authFlowController.resetRequestOtp
);

/**
 * @openapi
 * /api/v1/auth/reset-password/verify-otp:
 *   post:
 *     summary: ตรวจ OTP สำหรับรีเซ็ตรหัสผ่าน
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reset_token, otp]
 *             properties:
 *               reset_token: { type: string }
 *               otp: { type: string }
 *     responses:
 *       200:
 *         description: OTP ถูกต้อง คืน reset_verified_token (อายุ 4 นาที ใช้ครั้งเดียว)
 *       401:
 *         description: OTP ไม่ถูกต้อง / token หมดอายุหรือถูกใช้แล้ว
 */
router.post(
  '/reset-password/verify-otp',
  loadFlowToken('reset_otp'),
  otpVerifyLimiter('reset'),
  authFlowController.resetVerifyOtp
);

/**
 * @openapi
 * /api/v1/auth/reset-password/confirm:
 *   post:
 *     summary: ยืนยันรหัสผ่านใหม่หลังตรวจ OTP
 *     description: "เปลี่ยนรหัสผ่านจริง + bump token_version (บังคับล็อกเอาต์ทุกอุปกรณ์)"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reset_token, new_password]
 *             properties:
 *               reset_token: { type: string }
 *               new_password: { type: string, format: password, minLength: 8 }
 *     responses:
 *       200:
 *         description: เปลี่ยนรหัสผ่านสำเร็จ
 *       401:
 *         description: reset_verified_token หมดอายุหรือถูกใช้แล้ว
 *       429:
 *         description: ยืนยันบ่อยเกินไป (คิดตาม IP ต่อชั่วโมง)
 */
router.post(
  '/reset-password/confirm',
  loadFlowToken('reset_verified'),
  confirmIpLimiter,
  authFlowController.resetConfirm
);

/**
 * @openapi
 * /api/v1/auth/login:
 *   post:
 *     summary: ล็อกอินด้วย email + password
 *     description: "ใส่รหัสผ่านผิดเกิน 5 ครั้ง -> ล็อก 15 นาที"
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, format: email }
 *               password: { type: string, format: password }
 *     responses:
 *       200:
 *         description: ล็อกอินสำเร็จ คืน access_token (JWT อายุ 30 วัน)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean, example: true }
 *                 token: { type: string }
 *                 user:
 *                   type: object
 *                   properties:
 *                     id: { type: string }
 *                     email: { type: string }
 *                     name: { type: string }
 *       401:
 *         description: อีเมล/รหัสผ่านไม่ถูกต้อง หรือถูก lock ชั่วคราว
 *       429:
 *         description: ส่งคำขอล็อกอินบ่อยเกินไปต่อ IP
 */
router.post('/login', authController.login);

module.exports = router;
