// backend/services/ocrEngine.js
// แยกเฉพาะส่วน "อ่านภาพ -> ข้อความดิบ" ออกจาก ocrService.js
// เพื่อให้จูน parameter ได้ และ cache ข้อความดิบไว้จูน regex แยกต่างหากได้
const Tesseract = require('tesseract.js');
const { preprocess } = require('./ocrPreprocess');

const DEFAULTS = { scale: 1, psm: '3', threshold: 'none' };

// ใช้ worker ตัวเดียวซ้ำ (createWorker ทุกครั้งช้ามาก โดยเฉพาะ tha+eng)
let workerPromise = null;
function getWorker() {
  if (!workerPromise) {
    workerPromise = Tesseract.createWorker('tha+eng', 1, { logger: () => {} });
  }
  return workerPromise;
}

/**
 * คืนข้อความดิบจาก Tesseract "ก่อน" ผ่าน normalize/merchant corrections
 * @returns {{ rawText: string, confidence: number }}
 */
async function recognizeText(input, opts = {}) {
  const { scale, psm, threshold } = { ...DEFAULTS, ...opts };
  const image = await preprocess(input, { scale, threshold });

  const worker = await getWorker();
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: '1',
    user_defined_dpi: '300', // บอก DPI ให้ Tesseract ภาพจาก screenshot ไม่มีข้อมูล DPI
  });

  const { data } = await worker.recognize(image);
  return { rawText: (data.text || '').trim(), confidence: data.confidence };
}

async function shutdown() {
  if (!workerPromise) return;
  const w = await workerPromise;
  workerPromise = null;
  await w.terminate();
}

module.exports = { recognizeText, shutdown, DEFAULTS };