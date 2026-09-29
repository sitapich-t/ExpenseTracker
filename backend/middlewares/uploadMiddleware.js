/**
 * uploadMiddleware.js
 * -------------------
 * Multer config กลาง สำหรับอัปโหลดรูปสลิป/ใบเสร็จ
 *
 * หลักความปลอดภัยที่ตั้งใจทำไว้ (อย่าลบออกนะครับ):
 *   1) ใช้ "นามสกุลไฟล์จาก MIME" ไม่ใช่จาก originalname ของ client
 *      กัน path traversal (../../) และ double extension (a.php.jpg)
 *   2) whitelist เฉพาะรูปภาพ — กันอัปโหลด .html/.svg แล้วให้เข้า XSS
 *      ตอน browser เปิดไฟล์ที่เรา serve กลับ (ดู server.js ที่ mount static)
 *   3) จำกัดขนาดไฟล์ กันเติม disk
 *   4) ตั้งชื่อไฟล์เองด้วย randomUUID ไม่รับชื่อจาก client มาใช้ตรง ๆ
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');

const MAX_FILE_SIZE = 8 * 1024 * 1024; // 8 MB

// นามสกุลที่ยอมให้ ผูกกับ MIME จริง (ไม่เชื่อนามสกุลจาก client)
const ALLOWED_TYPES = new Map([
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp'],
  ['image/heic', '.heic'],
  ['image/heif', '.heif'],
]);

// เก็บแยกโฟลเดอร์กับไฟล์ OCR เดิมของ personal (uploads/*.bin ไม่มีนามสกุล)
const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const SLIP_DIR = path.join(UPLOAD_ROOT, 'slips');

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true });
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDir(SLIP_DIR);
    cb(null, SLIP_DIR);
  },
  filename: (req, file, cb) => {
    const ext = ALLOWED_TYPES.get(file.mimetype) || '.jpg';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

/** ตัวกรอง MIME + ขนาด ขีดจำกัดเขียนเป็น middleware เพื่อให้ error เป็น JSON สมบูรณ์ */
const handleUpload = (uploadMiddleware) => (req, res, next) => {
  uploadMiddleware(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: `ไฟล์ใหญ่เกินไป (สูงสุด ${Math.floor(MAX_FILE_SIZE / 1024 / 1024)} MB)`,
        });
      }
      if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        return res.status(400).json({ success: false, error: 'ชื่อ field ไฟล์ไม่ถูกต้อง' });
      }
      return res.status(400).json({ success: false, error: `อัปโหลดไม่สำเร็จ: ${err.message}` });
    }

    // error จาก fileFilter ของเราเอง
    if (err.status) return res.status(err.status).json({ success: false, error: err.message });
    return next(err);
  });
};

const fileFilter = (req, file, cb) => {
  if (!ALLOWED_TYPES.has(file.mimetype)) {
    const err = new Error('รองรับเฉพาะไฟล์รูปภาพ (jpg, png, webp, heic)');
    err.status = 400;
    return cb(err);
  }
  cb(null, true);
};

const makeUploader = (fieldName) =>
  handleUpload(multer({ storage, fileFilter, limits: { fileSize: MAX_FILE_SIZE } }).single(fieldName));

/** อัปโหลดสลิปบิลกลุ่ม (field: slip) */
const uploadSlip = makeUploader('slip');

/**
 * รับได้ทั้ง 2 แบบเหมือน scan-receipt:
 *   - multipart/form-data -> field "slip"  (ไฟล์รูป)
 *   - JSON                -> field "slip_url" (URL ที่อัปโหลดไว้แล้ว)
 * ถ้าเป็น JSON ให้ผ่านเลย ไม่ต้องแตะ multer
 */
const slipUpload = (req, res, next) => {
  if (req.is('multipart/form-data')) return uploadSlip(req, res, next);
  return next();
};

/** คืน URL สัมพัทธ์ของไฟล์ที่เพิ่งบันทึก (เก็บลง DB ได้เลย ไม่ผูกกับ host) */
const slipPathOf = (file) => (file ? `/uploads/slips/${file.filename}` : null);

/** ลบไฟล์สลิป (ใช้ตอนแทนที่รูปเดิม) — กันไฟล์ค้างใน disk */
const removeSlip = (slipUrl) => {
  if (!slipUrl || !slipUrl.startsWith('/uploads/slips/')) return;
  const name = path.basename(slipUrl);
  const target = path.join(SLIP_DIR, name);
  // กัน path traversal เผื่อค่าใน DB ถูกแก้
  if (path.dirname(target) !== SLIP_DIR) return;
  fs.promises.unlink(target).catch(() => {});
};

module.exports = {
  UPLOAD_ROOT,
  SLIP_DIR,
  MAX_FILE_SIZE,
  ALLOWED_TYPES,
  ensureDir,
  slipUpload,
  slipPathOf,
  removeSlip,
};
