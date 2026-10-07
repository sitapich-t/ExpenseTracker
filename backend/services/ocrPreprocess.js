// backend/services/ocrPreprocess.js
// เตรียมภาพก่อนส่งเข้า Tesseract: หมุนตาม EXIF -> ขาวดำ -> ขยาย -> (ไม่บังคับ) threshold
// ต้องติดตั้ง: npm i sharp
let sharp = null;
try {
  sharp = require('sharp');
} catch (e) {
  console.warn('⚠️ sharp module could not be loaded. Preprocessing will return raw input.');
}

// รับได้ 3 แบบ: path, data URI (base64), Buffer
function toSharpInput(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string' && input.startsWith('data:')) {
    return Buffer.from(input.slice(input.indexOf(',') + 1), 'base64');
  }
  return input; // path
}

/**
 * @param input      path | data URI | Buffer
 * @param opts.scale     ตัวคูณขยายภาพ (เช่น 1.5, 2, 3)
 * @param opts.threshold 'none' หรือตัวเลข 0-255 (เช่น 150)
 * @returns Buffer (PNG) พร้อมส่งให้ worker.recognize
 */
async function preprocess(input, { scale = 1, threshold = 'none' } = {}) {
  if (!sharp) {
    return toSharpInput(input);
  }

  // 1) หมุนตาม EXIF ก่อน เพื่อให้ width/height หลังหมุนถูกต้อง
  const { data: rotated, info } = await sharp(toSharpInput(input), { failOn: 'none' })
    .rotate()
    .toBuffer({ resolveWithObject: true });

  // 2) ขาวดำ + ยืด contrast + ขยาย
  let pipe = sharp(rotated)
    .grayscale()
    .normalize()
    .resize({ width: Math.round(info.width * Number(scale)), kernel: 'lanczos3' });

  // 3) threshold (ไม่บังคับ)
  const t = Number(threshold);
  if (threshold !== 'none' && Number.isFinite(t)) {
    pipe = pipe.threshold(t);
  }

  return pipe.png().toBuffer();
}

module.exports = { preprocess };