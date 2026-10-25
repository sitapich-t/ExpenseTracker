// tests/ocrAccuracy.js
// ติดตั้ง: npm i -D fastest-levenshtein
//
// โครงสร้าง fixtures:  tests/fixtures/slips/001.jpg + 001.json
// 001.json:
// { "bank": "ธนาคารกสิกรไทย", "total": 8500.00, "date": "2026-08-29",
//   "transactionId": "016242082205CPM12337", "merchant": "สปาร์ค อีวี",
//   "text": "(ไม่บังคับ) ข้อความจริงทั้งใบ ไว้วัด CER ของ OCR ดิบ" }
//
// วิธีใช้:
//   node tests/ocrAccuracy.js dev                      # grid search บน dev set (70%)
//   node tests/ocrAccuracy.js test '{"psmModes":[6],"scale":2,"preprocess":"gray"}'
//                                                      # รายงานผลสุดท้ายบน test set (30%) ครั้งเดียว
//   node tests/ocrAccuracy.js parse                    # ทดสอบเฉพาะ regex จาก "text" ใน json (ไม่รัน OCR)

const fs = require('fs');
const path = require('path');
const { distance } = require('fastest-levenshtein');
const { scanReceipt, parseText, shutdown } = require('../services/ocrService');

const dir = path.join(__dirname, 'fixtures/slips');
const IMG_EXT = /\.(jpe?g|png|webp)$/i;
if (!fs.existsSync(dir)) {
  console.error(`ไม่พบโฟลเดอร์ ${dir}\nสร้างโฟลเดอร์แล้วใส่ภาพ + json ก่อน`);
  process.exit(1);
}

function readJson(p) {
  const buf = fs.readFileSync(p);
  // รองรับ UTF-8 (มี/ไม่มี BOM) และ UTF-16LE ที่ PowerShell บางเวอร์ชันสร้างให้
  let text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf8');
  // ตัดอักขระที่ซ่อนอยู่หน้าปีกกาแรกทิ้งทั้งหมด
  text = text.slice(Math.max(0, text.search(/[{[]/)));
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`อ่าน JSON ไม่ได้: ${p}\n${e.message}`);
  }
}
// อ่านภาพ + เฉลยจากโฟลเดอร์ย่อย: slips/dev และ slips/test
function loadSplit(split) {
  const d = path.join(dir, split);
  if (!fs.existsSync(d)) return [];
  return fs
    .readdirSync(d)
    .filter((f) => IMG_EXT.test(f))
    .sort()
    .map((f) => {
      const jsonPath = path.join(d, f.replace(IMG_EXT, '.json'));
      return {
        name: f,
        file: path.join(d, f),
        truth: fs.existsSync(jsonPath) ? readJson(jsonPath) : null,
      };
    })
    .filter((c) => c.truth);
}

const devSet = loadSplit('dev');
const testSet = loadSplit('test');

// โหมด detail / raw / parse ใช้ allCases ให้เห็นเฉพาะ dev กันเผลอดูผล test แล้วแก้ parser ตาม
const allCases = devSet;

const norm = (s) => (s || '').normalize('NFC').replace(/\s+/g, '');
const cer = (ref, hyp) => {
  const r = norm(ref);
  return r.length ? distance(r, norm(hyp)) / r.length : 0;
};

// ตาราง normalize ชื่อธนาคาร: ชื่อเรียกหลายแบบของธนาคารเดียวกัน -> ชื่อมาตรฐาน
// เขียนจากชื่อธนาคารจริง ไม่ดูผลของ parser
const BANK_ALIASES = [
  [/kbank|kasikorn|กสิกร/i, 'ธนาคารกสิกรไทย'],
  [/scb|ไทยพาณิชย์/i, 'ธนาคารไทยพาณิชย์'],
  [/bbl|bangkok\s*bank|กรุงเทพ/i, 'ธนาคารกรุงเทพ'],
  [/krungthai|ktb|กรุงไทย/i, 'ธนาคารกรุงไทย'],
  [/ttb|ทหารไทยธนชาต|tmbthanachart/i, 'ธนาคารทีทีบี'],
  [/krungsri|bay|กรุงศรี/i, 'ธนาคารกรุงศรีอยุธยา'],
  [/gsb|ออมสิน/i, 'ธนาคารออมสิน'],
];
const normBank = (s) => {
  if (!s) return null;
  const hit = BANK_ALIASES.find(([re]) => re.test(s));
  return hit ? hit[1] : String(s).trim();
};

function scoreFields(r, truth) {
  return {
    total: Math.abs((r.total || 0) - truth.total) < 0.005,
    date: (r.date || '').slice(0, 10) === truth.date,
    txid: r.transactionId === truth.transactionId,
    bank: normBank(r.bankName) === normBank(truth.bank),
    merchantCER: cer(truth.merchant, r.merchant),
    textCER: truth.text ? cer(truth.text, r.parsedText) : null,
  };
}

function summarize(rows, ms) {
  const n = rows.length || 1;
  const avg = (k) => rows.reduce((s, r) => s + (r.s[k] ? 1 : 0), 0) / n;
  const avgNum = (k) => {
    const v = rows.map((r) => r.s[k]).filter((x) => x !== null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  return {
    n: rows.length,
    totalAcc: +avg('total').toFixed(3),
    dateAcc: +avg('date').toFixed(3),
    txidAcc: +avg('txid').toFixed(3),
    bankAcc: +avg('bank').toFixed(3),
    merchantCER: +(avgNum('merchantCER') ?? 0).toFixed(3),
    textCER: avgNum('textCER') === null ? null : +avgNum('textCER').toFixed(3),
    msPerImg: Math.round(ms / n),
  };
}

async function evaluate(cases, options) {
  const rows = [];
  let ms = 0;
  for (const c of cases) {
    const t0 = Date.now();
    try {
      const r = await scanReceipt({ file: { path: c.file }, options });
      ms += Date.now() - t0;
      rows.push({ name: c.name, bank: c.truth.bank, s: scoreFields(r, c.truth), got: r });
    } catch (err) {
      ms += Date.now() - t0;
      rows.push({
        name: c.name,
        bank: c.truth.bank,
        s: { total: false, date: false, txid: false, bank: false, merchantCER: 1, textCER: c.truth.text ? 1 : null },
        error: err.message,
      });
    }
  }
  return { rows, summary: summarize(rows, ms) };
}

function perBank(rows) {
  const groups = {};
  for (const r of rows) (groups[r.bank] ||= []).push(r);
  return Object.entries(groups).map(([bank, rs]) => ({ bank, ...summarize(rs, 0) }));
}

async function main() {
  // quiet: ปิด console.log ของ service ระหว่างรัน grid
  const origLog = console.log;
  const origWarn = console.warn;
  const quiet = () => { console.log = () => {}; console.warn = () => {}; };
  const loud = () => { console.log = origLog; console.warn = origWarn; };

  const mode = process.argv[2] || 'dev';

  if (mode === 'parse') {
    // ทดสอบเฉพาะชั้น regex จากข้อความจริง ไม่รัน OCR
    const rows = allCases
      .filter((c) => c.truth.text)
      .map((c) => ({ name: c.name, bank: c.truth.bank, s: scoreFields(parseText(c.truth.text), c.truth) }));
    console.table([summarize(rows, 0)]);
    console.log('พลาดที่ยอดเงิน:', rows.filter((r) => !r.s.total).map((r) => r.name));
    return;
  }

  if (mode === 'test') {
    const options = process.argv[3] ? JSON.parse(process.argv[3]) : {};
    quiet();
    const { rows, summary } = await evaluate(testSet, options);
    loud();
    console.log('== TEST SET (รายงานครั้งเดียว อย่าจูนซ้ำ) ==', options);
    console.table([summary]);
    console.log('แยกตามธนาคาร'); console.table(perBank(rows));
    console.log('ภาพที่ยอดเงินผิด:');
    console.table(rows.filter((r) => !r.s.total).map((r) => ({ file: r.name, error: r.error || '', got: r.got?.total })));
    return;
  }
if (mode === 'detail') {
    const options = process.argv[3]
      ? JSON.parse(process.argv[3])
      : { psmModes: [11], scale: 2, preprocess: 'threshold' };
    quiet();
    const { rows } = await evaluate(allCases, options);
    loud();
    const show = (ok, exp, got) => (ok ? '✓' : `✗ ได้ ${JSON.stringify(got)} / ควรเป็น ${JSON.stringify(exp)}`);
    console.table(
      rows.map((r, i) => {
        const t = allCases[i].truth;
        return {
          file: r.name,
          total: show(r.s.total, t.total, r.got?.total),
          date: show(r.s.date, t.date, r.got?.date?.slice(0, 10)),
          txid: show(r.s.txid, t.transactionId, r.got?.transactionId),
          bank: show(r.s.bank, t.bank, r.got?.bankName),
          merchant: `${r.got?.merchant ?? r.error ?? ''} (CER ${r.s.merchantCER.toFixed(2)})`,
        };
      })
    );
    return;
  }

  if (mode === 'raw') {
    const target = allCases.find((c) => c.name === process.argv[3]);
    if (!target) { console.error('ไม่พบไฟล์', process.argv[3]); return; }
    quiet();
    const r = await scanReceipt({
      file: { path: target.file },
      options: process.argv[4]
        ? JSON.parse(process.argv[4])
        : { psmModes: [11], scale: 2, preprocess: 'threshold' },
    });
    loud();
    console.log(r.parsedText.split('\n').map((l, i) => `${i}: ${l}`).join('\n'));
    return;
  }
  // dev: grid search
  const grid = [];
  for (const psmModes of [[6], [4], [11], [6, 4, 11]])
    for (const scale of [1, 1.5, 2, 3])
      for (const preprocess of ['none', 'gray', 'threshold'])
        grid.push({ psmModes, scale, preprocess });

  console.log(`dev=${devSet.length} test=${testSet.length} ภาพ, grid=${grid.length} ชุด`);
  const results = [];
  for (const [i, options] of grid.entries()) {
    quiet();
    const { summary } = await evaluate(devSet, options);
    loud();
    results.push({
      psm: options.psmModes.join('+'),
      scale: options.scale,
      pre: options.preprocess,
      ...summary,
    });
    console.log(`  [${i + 1}/${grid.length}] psm=${options.psmModes.join('+')} scale=${options.scale} pre=${options.preprocess} totalAcc=${summary.totalAcc}`);
  }

  results.sort((a, b) => b.totalAcc - a.totalAcc || a.merchantCER - b.merchantCER || a.msPerImg - b.msPerImg);
  console.log('\nTop 8 บน dev set');
  console.table(results.slice(0, 8));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => shutdown());