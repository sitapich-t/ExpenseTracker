/**
 * evalOcr.js - วัดความแม่นยำ OCR เทียบกับ ground truth
 *
 * วางที่: backend/tests/evalOcr.js
 * รัน (จากโฟลเดอร์ backend):
 *   node tests/evalOcr.js dev              # ชุด dev (ปรับจูน)
 *   node tests/evalOcr.js test             # ชุด test (วัดผลสุดท้าย)
 *   node tests/evalOcr.js dev --limit=5    # ลองแค่ 5 ใบ
 *   node tests/evalOcr.js dev --debug      # พิมพ์ผลดิบของใบแรก (ใช้ตอนฟิลด์ว่างหมด)
 *
 * ground truth: NNN.json คู่กับ NNN.png|jpg ในโฟลเดอร์เดียวกัน
 * ฟิลด์ที่วัด: total, date, merchant, bank, transactionId
 */
const fs = require('fs');
const path = require('path');
const ocr = require('../services/ocrService');

// ---------- args ----------
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith('--')) || 'dev';
const DEBUG = args.includes('--debug');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const onlyArg = args.find((a) => a.startsWith('--only='));
const ONLY = onlyArg ? onlyArg.split('=')[1].split(',').map((s) => s.trim()) : null;

// ทดลองพารามิเตอร์ OCR โดยไม่ต้องแก้โค้ด เช่น "--preprocess=gray" "--scale=3" "--psm=6"
const optArg = (name) => {
  const a = args.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : null;
};
const OCR_OPTS = {};
if (optArg('scale')) OCR_OPTS.scale = parseFloat(optArg('scale'));
if (optArg('preprocess')) OCR_OPTS.preprocess = optArg('preprocess');
if (optArg('psm')) OCR_OPTS.psmModes = optArg('psm').split(',').map(Number);
if (Object.keys(OCR_OPTS).length) console.log('OCR options:', JSON.stringify(OCR_OPTS));

const FIELDS = ['total', 'date', 'merchant', 'bank', 'transactionId'];
const IMG_EXT = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

function resolveDir(t) {
  if (path.isAbsolute(t) && fs.existsSync(t)) return t;
  if (fs.existsSync(t)) return path.resolve(t);
  return path.join(__dirname, 'fixtures', 'slips', t);
}

// ---------- normalization ----------
const isEmpty = (v) => v === null || v === undefined || String(v).trim() === '';

function normMoney(v) {
  if (isEmpty(v)) return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function normDate(v) {
  if (isEmpty(v)) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : String(v).trim();
}

function normText(v) {
  if (isEmpty(v)) return null;
  return String(v).toLowerCase().replace(/[\s\-_.,()'"/\\]+/g, '');
}

function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

const similarity = (a, b) =>
  a === b ? 1 : 1 - levenshtein(a, b) / Math.max(a.length, b.length, 1);

// ---------- OCR call ----------
function pickFields(res) {
  const r = (res && (res.data || res.result || res.receipt)) || res || {};
  return {
    total: r.total ?? r.amount ?? r.totalAmount ?? null,
    date: r.date ?? r.transactionDate ?? null,
    merchant: r.merchant ?? r.merchantName ?? r.shop ?? r.store ?? null,
    bank: r.bankName ?? r.bank ?? null,
    transactionId: r.transactionId ?? r.refNo ?? r.reference ?? null,
    confidence: typeof r.ocrConfidence === 'number' ? r.ocrConfidence : null,
    needsReview: typeof r.needsReview === 'boolean' ? r.needsReview : null,
    reviewReasons: Array.isArray(r.reviewReasons) ? r.reviewReasons : null,
  };
}

async function callOcr(imgPath) {
  const buffer = fs.readFileSync(imgPath);
  const file = {
    path: imgPath,
    buffer,
    originalname: path.basename(imgPath),
    mimetype: IMG_EXT[path.extname(imgPath).toLowerCase()],
    size: buffer.length,
  };
  const attempts = [
    { file, options: OCR_OPTS },
    { image: buffer, options: OCR_OPTS },
    { image: imgPath, options: OCR_OPTS },
  ];
  let lastErr = null;
  for (const a of attempts) {
    try {
      const res = await ocr.scanReceipt(a);
      if (res) return res;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('scanReceipt returned nothing');
}

// แปลงชื่อธนาคารหลายรูปแบบ (ไทย/อังกฤษ/ตัวย่อ) เป็นรหัสเดียวก่อนเทียบ
function normBank(v) {
  if (isEmpty(v)) return null;
  const s = String(v).toLowerCase();
  const table = [
    ['KBANK', /kbank|k\+|kasikorn|กสิกร/],
    ['SCB', /\bscb\b|ไทยพาณิชย์/],
    ['BBL', /\bbbl\b|bangkok\s*bank|กรุงเทพ/],
    ['KTB', /\bktb\b|krungthai|กรุงไทย/],
    ['TTB', /\bttb\b|\btmb\b|ทีทีบี|ทหารไทย/],
    ['BAY', /\bbay\b|krungsri|กรุงศรี/],
    ['GSB', /\bgsb\b|ออมสิน/],
    ['PROMPTPAY', /promptpay|พร้อมเพย์/],
  ];
  for (const [code, re] of table) if (re.test(s)) return code;
  return String(v).trim();
}

// ปิด console.log ของ ocrService ระหว่างรัน (เปิดคืนเมื่อใช้ --debug)
async function quiet(fn) {
  if (DEBUG) return fn();
  const orig = console.log;
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.log = orig;
  }
}

// ---------- compare ----------
// status: ok | wrong | missing (มีเฉลยแต่ไม่ได้ค่า) | extra (เฉลย null แต่ดึงค่ามา)
function compareField(field, expected, got) {
  if (field === 'total') {
    const e = normMoney(expected);
    const g = normMoney(got);
    if (e === null) return g === null ? { status: 'ok' } : { status: 'extra' };
    if (g === null) return { status: 'missing' };
    if (g <= 0) return { status: 'missing' }; // total = 0 ถือว่าอ่านไม่ได้
    return Math.abs(e - g) < 0.005
      ? { status: 'ok' }
      : { status: 'wrong', diff: Math.abs(e - g) };
  }
  if (field === 'date') {
    const e = normDate(expected);
    const g = normDate(got);
    if (e === null) return g === null ? { status: 'ok' } : { status: 'extra' };
    if (g === null) return { status: 'missing' };
    return e === g ? { status: 'ok' } : { status: 'wrong' };
  }
  if (field === 'bank') {
    const eb = normBank(expected);
    const gb = normBank(got);
    if (eb === null) return gb === null ? { status: 'ok' } : { status: 'extra' };
    if (gb === null) return { status: 'missing' };
    return eb === gb ? { status: 'ok' } : { status: 'wrong' };
  }
  const e = normText(expected);
  const g = normText(got);
  if (e === null) return g === null ? { status: 'ok' } : { status: 'extra' };
  if (g === null) return { status: 'missing' };
  if (e === g) return { status: 'ok', sim: 1 };
  if (field === 'merchant') {
    const raw = String(expected);
    // เฉลยบางใบมีวงเล็บต่อท้าย (ชื่อบริษัท/สาขา) ให้เทียบทั้งชื่อหลักและข้อความในวงเล็บ
    const core = normText(raw.replace(/\(.*?\)/g, ''));
    const inner = normText((raw.match(/\((.*?)\)/) || [])[1]);
    if (core && core === g) return { status: 'ok', sim: 1 };

    const sim = Math.max(similarity(e, g), core ? similarity(core, g) : 0);
    if (sim >= 0.85) return { status: 'partial', sim };

    // ชื่อหลักตรง: ชื่อหลัก/ข้อความในวงเล็บของเฉลยอยู่ในข้อความที่อ่านได้
    // หรือข้อความที่อ่านได้เป็นส่วนหนึ่งของชื่อหลักและยาวพอ (>= 4 ตัว และ >= 40% ของชื่อหลัก)
    const contains = (needle) => needle && needle.length >= 3 && g.includes(needle);
    const containedInCore =
      core && g.length >= 4 && core.includes(g) && g.length / core.length >= 0.4;
    if (contains(core) || contains(inner) || containedInCore) {
      return { status: 'partial', sim, via: 'core' };
    }
    return { status: 'wrong', sim };
  }
  const sim = similarity(e, g);
  return { status: 'wrong', sim };
}

// ---------- main ----------
(async () => {
  const dir = resolveDir(target);
  if (!fs.existsSync(dir)) {
    console.error(`ไม่พบโฟลเดอร์: ${dir}`);
    process.exit(1);
  }

  const cases = fs
    .readdirSync(dir)
    .filter((f) => IMG_EXT[path.extname(f).toLowerCase()])
    .map((f) => ({
      name: path.parse(f).name,
      img: path.join(dir, f),
      json: path.join(dir, path.parse(f).name + '.json'),
    }))
    .filter((c) => fs.existsSync(c.json))
    .filter((c) => !ONLY || ONLY.includes(c.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, LIMIT);

  if (cases.length === 0) {
    console.error(`ไม่พบคู่รูป+json ใน ${dir}`);
    process.exit(1);
  }

  console.log(`ประเมิน ${cases.length} ใบจาก ${dir}\n`);

  const stats = {};
  FIELDS.forEach((f) => (stats[f] = { ok: 0, partial: 0, wrong: 0, missing: 0, extra: 0 }));
  let totalAbsError = 0; // ผลต่างยอดเงินเมื่ออ่านผิด (บาท)
  let totalMissingAmount = 0; // ยอดเงินของใบที่อ่านยอดไม่ได้
  let totalGroundTruth = 0;
  let allFieldsOk = 0;
  const nn = {}; // recall เฉพาะใบที่เฉลยมีค่า (ไม่นับ null=null)
  FIELDS.forEach((f) => (nn[f] = { n: 0, ok: 0 }));
  let merchantCore = 0; // ใบที่ merchant ผ่านด้วยเกณฑ์ "ชื่อหลักตรง" เท่านั้น
  let errors = 0;
  const failures = [];
  const details = [];

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    const expected = JSON.parse(fs.readFileSync(c.json, 'utf8').replace(/^\uFEFF/, ''));
    let got;
    let raw = null;
    try {
      raw = await quiet(() => callOcr(c.img));
      got = pickFields(raw);
    } catch (e) {
      errors++;
      got = {};
      failures.push({ name: c.name, field: '(error)', expected: '-', got: e.message });
    }

    if (DEBUG && i === 0) {
      console.log('--- DEBUG ผลดิบของใบแรก ---');
      console.log(JSON.stringify(raw, null, 2));
      console.log('--- หลัง pickFields ---');
      console.log(JSON.stringify(got, null, 2));
      console.log('---------------------------\n');
    }

    const result = {};
    let allOk = true;
    for (const f of FIELDS) {
      const r = compareField(f, expected[f], got[f]);
      result[f] = r.status;
      stats[f][r.status]++;
      if (f === 'merchant' && r.via === 'core') merchantCore++;
      if (!isEmpty(expected[f])) {
        nn[f].n++;
        if (r.status === 'ok') nn[f].ok++;
      }
      if (r.status !== 'ok') {
        allOk = false;
        failures.push({
          name: c.name,
          field: f,
          status: r.status,
          expected: expected[f],
          got: got[f] ?? null,
          ...(r.sim !== undefined ? { similarity: +r.sim.toFixed(2) } : {}),
        });
      }
      if (f === 'total') {
        const e = normMoney(expected.total);
        if (e !== null) totalGroundTruth += e;
        if (r.status === 'wrong') totalAbsError += r.diff;
        if (r.status === 'missing' && e !== null) totalMissingAmount += e;
      }
    }
    if (allOk) allFieldsOk++;
    details.push({ name: c.name, expected, got, result });
    process.stdout.write(`\r  ${i + 1}/${cases.length}`);
  }
  console.log('\n');

  // ---------- report ----------
  const pct = (n, d) => (d === 0 ? '-' : ((n / d) * 100).toFixed(1) + '%');
  const n = cases.length;

  console.log('=== ความแม่นยำรายฟิลด์ (exact match) ===');
  console.log(
    'ฟิลด์'.padEnd(16) +
      'ถูก'.padEnd(18) +
      'ใกล้เคียง'.padEnd(12) +
      'ผิด'.padEnd(6) +
      'อ่านไม่ได้'.padEnd(12) +
      'ดึงเกิน'
  );
  for (const f of FIELDS) {
    const s = stats[f];
    console.log(
      f.padEnd(16) +
        `${s.ok}/${n} (${pct(s.ok, n)})`.padEnd(18) +
        String(s.partial).padEnd(12) +
        String(s.wrong).padEnd(6) +
        String(s.missing).padEnd(12) +
        s.extra
    );
  }

console.log('\n=== Recall เฉพาะใบที่เฉลยมีค่า (ไม่นับ null=null) ===');
  for (const f of FIELDS) {
    console.log(f.padEnd(16) + `${nn[f].ok}/${nn[f].n} (${pct(nn[f].ok, nn[f].n)})`);
  }

  const m = stats.merchant;
  console.log(
    `\nmerchant แยกเกณฑ์: exact ${m.ok}/${n} | ใกล้เคียง (คล้าย >= 0.85) ${m.partial - merchantCore} | ชื่อหลักตรง ${merchantCore} | ผิด ${m.wrong}`
  );

  console.log('\n=== ผลต่อใบ ===');
  console.log(`ถูกครบทุกฟิลด์: ${allFieldsOk}/${n} (${pct(allFieldsOk, n)})`);
  if (errors) console.log(`เรียก OCR ไม่สำเร็จ (error): ${errors} ใบ`);

  console.log('\n=== ผลกระทบด้านเงิน (ฟิลด์ total) ===');
  console.log(`ยอดรวมตามเฉลย:                ${totalGroundTruth.toFixed(2)} บาท`);
  console.log(`ผลต่างสะสมเมื่ออ่านผิด:        ${totalAbsError.toFixed(2)} บาท`);
  console.log(`ยอดของใบที่อ่านยอดไม่ได้:      ${totalMissingAmount.toFixed(2)} บาท`);

  const confOf = (d) => (d.got && typeof d.got.confidence === 'number' ? d.got.confidence : null);
  const avg = (xs) => (xs.length ? (xs.reduce((s, v) => s + v, 0) / xs.length).toFixed(1) : '-');
  const okConf = details.filter((d) => d.result.total === 'ok').map(confOf).filter((v) => v !== null);
  const badConf = details.filter((d) => d.result.total !== 'ok').map(confOf).filter((v) => v !== null);
  console.log('\n=== ความสัมพันธ์ confidence กับยอดรวม ===');
  console.log(`confidence เฉลี่ยของใบที่ยอดถูก:          ${avg(okConf)} (${okConf.length} ใบ)`);
  console.log(`confidence เฉลี่ยของใบที่ยอดผิด/อ่านไม่ได้: ${avg(badConf)} (${badConf.length} ใบ)`);
  if (badConf.length) console.log(`ค่า confidence ของใบที่ยอดผิดแต่ละใบ: ${badConf.join(', ')}`);
  if (okConf.length) {
    const sortedOk = [...okConf].sort((a, b) => a - b);
    console.log(`ค่า confidence ต่ำสุด 5 ใบของใบที่ยอดถูก: ${sortedOk.slice(0, 5).join(', ')}`);
  }
  if (okConf.length && badConf.length) {
    console.log('\nถ้าตั้งเกณฑ์ "confidence < X ส่งคนตรวจ":');
    for (const x of [55, 60, 65, 70, 75, 80, 85]) {
      const caught = badConf.filter((v) => v < x).length;
      const flaggedOk = okConf.filter((v) => v < x).length;
      console.log(
        `  X=${x}: จับยอดผิดได้ ${caught}/${badConf.length} | ส่งคนตรวจโดยไม่จำเป็น ${flaggedOk}/${okConf.length}`
      );
    }
  }

  const flagged = (d) => d.got && d.got.needsReview === true;
  if (details.some((d) => d.got && typeof d.got.needsReview === 'boolean')) {
    const badTotal = details.filter((d) => d.result.total !== 'ok');
    const okTotal = details.filter((d) => d.result.total === 'ok');
    console.log('\n=== ด่านตรวจ needsReview ===');
    console.log(`ยอดผิด/อ่านไม่ได้ที่ถูก flag:            ${badTotal.filter(flagged).length}/${badTotal.length}`);
    console.log(`ยอดถูกแต่ถูก flag (ส่งตรวจเกินจำเป็น): ${okTotal.filter(flagged).length}/${okTotal.length}`);
    const reasonCount = {};
    okTotal.filter(flagged).forEach((d) => {
      (d.got.reviewReasons || []).forEach((r) => (reasonCount[r] = (reasonCount[r] || 0) + 1));
    });
    console.log('เหตุผลที่ flag ใบที่ยอดถูก:', JSON.stringify(reasonCount));
    // ใบในชุดทดสอบเป็นใบเก่า กฎ date_out_of_range จึงทำให้อัตราส่งตรวจสูงเกินจริง
    const flaggedNoDate = (d) =>
      d.got &&
      Array.isArray(d.got.reviewReasons) &&
      d.got.reviewReasons.some((r) => r !== 'date_out_of_range');
    console.log(`(ไม่นับกฎวันที่) ยอดผิด/อ่านไม่ได้ที่ถูก flag: ${badTotal.filter(flaggedNoDate).length}/${badTotal.length}`);
    console.log(`(ไม่นับกฎวันที่) ยอดถูกแต่ถูก flag:           ${okTotal.filter(flaggedNoDate).length}/${okTotal.length}`);
  }

  if (failures.length) {
    console.log(`\n=== รายการที่ผิด (${failures.length}) ===`);
    for (const f of failures) {
      console.log(
        `[${f.name}] ${f.field}: ${f.status || ''} | เฉลย=${JSON.stringify(f.expected)} | อ่านได้=${JSON.stringify(f.got)}` +
          (f.similarity !== undefined ? ` | คล้าย ${f.similarity}` : '')
      );
    }
  }

  const reportPath = path.join(__dirname, `ocr_eval_report_${path.basename(dir)}.json`);
  fs.writeFileSync(
    reportPath,
    JSON.stringify({ dir, count: n, stats, totalAbsError, totalMissingAmount, failures, details }, null, 2)
  );
  console.log(`\nบันทึกรายงานละเอียดที่: ${reportPath}`);

  try {
    await ocr.shutdown();
  } catch (_) {}
  process.exit(0);
})();