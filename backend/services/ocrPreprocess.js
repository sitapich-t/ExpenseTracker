// backend/services/ocrPreprocess.js
// เตรียมภาพก่อนส่งเข้า Tesseract: หมุนตาม EXIF -> ขาวดำ -> ขยาย -> (ไม่บังคับ) threshold
// ต้องติดตั้ง: npm i sharp
const sharp = require('sharp');

// รับได้ 3 แบบ: path, data URI (base64), Buffer
function toSharpInput(input) {
  if (Buffer.isBuffer(input)) return input;
  if (typeof input === 'string' && input.startsWith('data:')) {
    return Buffer.from(input.slice(input.indexOf(',') + 1), 'base64');
  }
  return input; // path
}

/**
 
@param input      path | data URI | Buffer
@param opts.scale     ตัวคูณขยายภาพ (เช่น 1.5, 2, 3)
@param opts.threshold 'none' หรือตัวเลข 0-255 (เช่น 150)
@returns Buffer (PNG) พร้อมส่งให้ worker.recognize*/
async function preprocess(input, { scale = 1, threshold = 'none', sharpen = false, pad = true } = {}) {
  const { data: rotated, info } = await sharp(toSharpInput(input), { failOn: 'none' })
    .rotate()
    .toBuffer({ resolveWithObject: true });

  const st = await sharp(rotated).grayscale().stats();
  const isDark = st.channels[0].mean < 110;

  const width = Math.min(Math.round(info.width * Number(scale)), 3000);

  let pipe = sharp(rotated).grayscale();
  if (isDark) pipe = pipe.negate();
  pipe = pipe.normalize().resize({ width, kernel: 'lanczos3' });

  if (sharpen) pipe = pipe.sharpen({ sigma: 1 });

  const t = Number(threshold);
  if (threshold !== 'none' && Number.isFinite(t)) pipe = pipe.median(3).threshold(t);

  if (pad) pipe = pipe.extend({ top: 20, bottom: 20, left: 20, right: 20, background: '#fff' });

  return pipe.png().toBuffer();
}

module.exports = { preprocess };