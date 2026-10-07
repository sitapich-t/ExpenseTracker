// backend/services/aiFallback.js
// ใช้ AI อ่านรายการสินค้าซ้ำ เฉพาะใบเสร็จที่ผล Tesseract น่าสงสัย
let Anthropic = null;
try {
  Anthropic = require('@anthropic-ai/sdk');
} catch (e) {
  // SDK not installed or broken in node_modules
}

const MODEL = process.env.AI_MODEL || 'claude-haiku-4-5-20251001';
const MODE = (process.env.AI_FALLBACK_MODE || 'off').toLowerCase();
const CONF_THRESHOLD = Number(process.env.AI_CONF_THRESHOLD || 85);

let client = null;
const getClient = () => {
  if (!Anthropic) return null;
  return (client ||= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 20000, maxRetries: 1 }));
};

// รูปแบบชื่อสินค้าที่ OCR ภาษาไทยมักเพี้ยน
const SUSPICIOUS_NAME = [
  /([\u0E01-\u0E2E\u0E30-\u0E4E]{2,3})\1/,            // ขยะซ้ำ เช่น "ขหขห"
  /[\u0E48-\u0E4B]{2}/,                               // วรรณยุกต์ซ้อนกัน
  /(^|\s)[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/,         // คำขึ้นต้นด้วยสระ/วรรณยุกต์ลอย
  /[\u0E01-\u0E2E][A-Za-z]|[A-Za-z][\u0E01-\u0E2E]/,  // ไทยติดอังกฤษในคำเดียว
];

function shouldUseAI(result, confidence) {
  if (MODE === 'off' || !process.env.ANTHROPIC_API_KEY) return false;
  if (result.documentType !== 'receipt') return false;
  if (MODE === 'always') return true;

  const items = result.items || [];
  if (items.length === 0 && result.total > 0) return true;           // อ่านรายการไม่ออกเลย
  if ((confidence ?? 100) < CONF_THRESHOLD) return true;             // OCR ไม่มั่นใจ
  if (items.some((it) => SUSPICIOUS_NAME.some((re) => re.test(it.name)))) return true;

  const sum = items.reduce((s, it) => s + it.price, 0);
  return result.total > 0 && Math.abs(sum - result.total) > 0.5;     // ผลรวมไม่ตรงยอด
}

function loadImage(input) {
  const buf = input.startsWith('data:')
    ? Buffer.from(input.split(',')[1], 'base64')
    : fs.readFileSync(input);
  let mediaType = 'image/jpeg';
  if (buf[0] === 0x89 && buf[1] === 0x50) mediaType = 'image/png';
  else if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') mediaType = 'image/webp';
  return { mediaType, data: buf.toString('base64') };
}

const PROMPT = `นี่คือใบเสร็จร้านค้าในประเทศไทย อ่านเฉพาะ "รายการสินค้า" ที่มีราคามากกว่า 0
ตอบเป็น JSON เท่านั้น ไม่มีคำอธิบายหรือ markdown:
{"items":[{"name":"ชื่อสินค้าตามที่พิมพ์บนใบเสร็จ","quantity":1,"price":0.00}]}
กติกา:
- price คือราคารวมของบรรทัดนั้น
- ข้ามบรรทัดที่ราคา 0.00 (แต้ม, M-Stamp, ภารกิจ, สิทธิ์แลกซื้อ) ยอดรวม ภาษี เงินสด เงินทอน
- ถ้าตัวอักษรไม่ชัด ให้เลือกคำที่สมเหตุสมผลกับชื่อสินค้าจริงที่สุด แต่ห้ามเดาตัวเลขราคา`;

async function fixItemsWithAI(inputImage, result) {
  try {
    const { mediaType, data } = loadImage(inputImage);
    const res = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1000,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: PROMPT },
        ],
      }],
    });

    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim());

    const items = (parsed.items || [])
      .map((it) => ({
        name: String(it.name || '').trim(),
        quantity: Number(it.quantity) || 1,
        price: Number(it.price),
      }))
      .filter((it) => it.name && Number.isFinite(it.price) && it.price > 0);

    if (items.length === 0) return null;

    // กัน AI เดา: ผลรวมต้องตรงกับยอดรวมที่ parse ได้
    const sum = items.reduce((s, it) => s + it.price, 0);
    if (result.total > 0 && Math.abs(sum - result.total) > 0.5) {
      console.warn(`[ai] ผลรวม ${sum} ไม่ตรงยอด ${result.total} -> ไม่ใช้ผล AI`);
      return null;
    }
    return items;
  } catch (err) {
    console.warn('[ai] fallback ล้มเหลว ใช้ผล Tesseract แทน:', err.message);
    return null;
  }
}

module.exports = { shouldUseAI, fixItemsWithAI };