#!/usr/bin/env node
/* eslint-disable no-console */
// backend/scripts/evalOcr.js
//
// โครงสร้างข้อมูล:
//   backend/test-data/slips/
//     001.png, 002.jpg, ...
//     001.gt.txt              (ไม่บังคับ: ข้อความที่พิมพ์ตามภาพเอง ใช้คำนวณ CER)
//     labels.json             { "001.png": { "total": 100, "date": "2026-08-29",
//                                "transactionId": "016242082205CPM12337",
//                                "bankName": "ธนาคารกสิกรไทย",
//                                "merchant": "สปาร์ค อีวี", "documentType": "slip" } }
//
// วิธีใช้:
//   node scripts/evalOcr.js --stage=ocr   --scale=2 --psm=6        # รัน OCR แล้ว cache ข้อความดิบ
//   node scripts/evalOcr.js --stage=parse --scale=2 --psm=6        # จูน regex: ใช้ cache ไม่ต้อง OCR ใหม่ (วินาที)
//   node scripts/evalOcr.js --scale=1.5,2,3 --psm=4,6,11 --threshold=none,150   # grid search
//   เพิ่ม --verbose เพื่อดู failure ทั้งหมด

const fs = require('fs');
const path = require('path');
const engine = require('../services/ocrEngine');
const ocr = require('../services/ocrService'); // ต้อง export parseText ด้วย

// ---------- args ----------
const args = {};
for (const a of process.argv.slice(2)) {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  args[k] = v;
}
const list = (v, fallback) => String(v ?? fallback).split(',').map((s) => s.trim());

const DIR = path.resolve(args.dir || 'test-data/slips');
const STAGE = args.stage || 'all'; // ocr | parse | all
const RAW_LABELS = JSON.parse(fs.readFileSync(path.join(DIR, 'labels.json'), 'utf8'));
const LABELS = Object.fromEntries(
  Object.entries(RAW_LABELS).filter(([, v]) => !args.split || v.split === args.split)
);
const CACHE_ROOT = path.join(DIR, '.ocr-cache');

const grid = [];
for (const scale of list(args.scale, '1'))
  for (const psm of list(args.psm, '6'))
    for (const threshold of list(args.threshold, 'none'))
      grid.push({ scale: Number(scale), psm, threshold });

// ---------- helpers ----------
const PIPELINE_VERSION = 'v1'; // เพิ่มเลขทุกครั้งที่แก้ ocrPreprocess.js / ocrEngine.js
const tagOf = (c) => `${PIPELINE_VERSION}_s${c.scale}_p${c.psm}_t${c.threshold}`;
// psm แบบ "6+11" = รวมผลหลาย psm (ใช้แคชของแต่ละ psm ร่วมกัน)
const subCfgs = (c) => String(c.psm).split('+').map((p) => ({ ...c, psm: p }));
const collapse = (s) => String(s ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const norm = (s) => collapse(s).replace(/\s/g, '').toLowerCase();
const pct = (ok, n) => (n ? `${((ok / n) * 100).toFixed(1)}% (${ok}/${n})` : 'n/a');

function lev(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}
const similarity = (a, b) => {
  a = norm(a); b = norm(b);
  const m = Math.max(a.length, b.length);
  return m ? 1 - lev(a, b) / m : 1;
};
const cer = (pred, gt) => lev(pred, gt) / Math.max(gt.length, 1);
// เทียบวันที่ตามเวลาไทย (UTC+7) เพราะแอปแสดงผลเป็นเวลาไทย
const bkkDate = (iso) => (iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10) : null);

// ฟิลด์ที่ต้องแม่น 100% = exact / ชื่อใช้ fuzzy >= 0.85
const COMPARE = {
  total: (p, g) => Math.abs((p ?? 0) - g) < 0.005,
  date: (p, g) => bkkDate(p) === g,
  transactionId: (p, g) => norm(p) === norm(g),
  bankName: (p, g) => norm(p) === norm(g),
  documentType: (p, g) => p === g,
  merchant: (p, g) => similarity(p, g) >= 0.85,
};

// ---------- stage 1: OCR (ช้า) -> cache ข้อความดิบ ----------
async function runOcr(cfg) {
  const dir = path.join(CACHE_ROOT, tagOf(cfg));
  fs.mkdirSync(dir, { recursive: true });
  const cers = [];
  let confSum = 0, n = 0, ms = 0;

  for (const file of Object.keys(LABELS)) {
    const imgPath = path.join(DIR, file);
    if (!fs.existsSync(imgPath)) {
      console.warn(`  ⚠ ข้าม ${file} (ไม่พบไฟล์ภาพ)`);
      continue;
    }
    const t0 = Date.now();
    const { rawText, confidence } = await engine.recognizeText(imgPath, cfg);
    ms += Date.now() - t0;
    confSum += confidence ?? 0;
    n++;
    fs.writeFileSync(path.join(dir, `${file}.txt`), rawText);

    const gtFile = path.join(DIR, `${file.replace(/\.[^.]+$/, '')}.gt.txt`);
    if (fs.existsSync(gtFile)) {
      cers.push(cer(collapse(rawText), collapse(fs.readFileSync(gtFile, 'utf8'))));
    }
  }
  return {
    avgConfidence: n ? confSum / n : 0,
    avgMs: n ? ms / n : 0,
    avgCER: cers.length ? cers.reduce((a, b) => a + b, 0) / cers.length : null,
  };
}

// ---------- stage 2: parse + เทียบ label (เร็ว) ----------
function evaluateParse(cfg) {
  const tag = tagOf(cfg);
  const perField = {};
  let e2eOk = 0, e2eN = 0;
  const failures = [];
  const perBank = {};

  for (const [file, gt] of Object.entries(LABELS)) {
    const texts = [];
    for (const s of subCfgs(cfg)) {
      const f = path.join(CACHE_ROOT, tagOf(s), `${file}.txt`);
      if (fs.existsSync(f)) texts.push(fs.readFileSync(f, 'utf8'));
    }
    if (!texts.length) continue;

    let parsed;
    try {
      parsed = texts.length > 1 ? ocr.parseBest(texts) : ocr.parseText(texts[0]);
    } catch (e) {
      failures.push({ file, field: '(parse error)', expected: '', got: e.message });
      e2eN++;
      continue;
    }

    let allOk = true;
    for (const [field, cmp] of Object.entries(COMPARE)) {
      if (gt[field] === undefined) continue;
      const ok = cmp(parsed[field], gt[field]);
      perField[field] ||= { ok: 0, n: 0 };
      perField[field].n++;
      if (ok) perField[field].ok++;
      else {
        allOk = false;
        failures.push({ file, field, expected: gt[field], got: parsed[field] });
      }
    }
    e2eN++;
    if (allOk) e2eOk++;
    const bank = gt.bankName || 'unknown';
    perBank[bank] ||= { ok: 0, n: 0 };
    perBank[bank].n++;
    if (allOk) perBank[bank].ok++;
  }
  return { tag, cfg, perField, e2e: { ok: e2eOk, n: e2eN }, failures, perBank };
}

// ---------- main ----------
(async () => {
  const results = [];

  for (const cfg of grid) {
    const tag = tagOf(cfg);
    let ocrStats = null;

    if (STAGE !== 'parse') {
      for (const sub of subCfgs(cfg)) {
        console.log(`\n▶ OCR  ${tagOf(sub)} ...`);
        ocrStats = await runOcr(sub);
        console.log(
          `  avg confidence ${ocrStats.avgConfidence.toFixed(1)} | ${Math.round(ocrStats.avgMs)} ms/ภาพ` +
          (ocrStats.avgCER !== null ? ` | CER ${(ocrStats.avgCER * 100).toFixed(2)}%` : '')
        );
      }
    }

    if (STAGE !== 'ocr') {
      const r = evaluateParse(cfg);
      r.ocrStats = ocrStats;
      results.push(r);

      console.log(`\n=== ${tag} — end-to-end ${pct(r.e2e.ok, r.e2e.n)} ===`);

      for (const [field, s] of Object.entries(r.perField)) {
        console.log(`  ${field.padEnd(14)} ${pct(s.ok, s.n)}`);
      }

      for (const [bank, s] of Object.entries(r.perBank)) {
        console.log(`  [${bank}] ${pct(s.ok, s.n)}`);
      }

      if (grid.length === 1 || args.verbose) {
        const shown = args.verbose ? r.failures : r.failures.slice(0, 15);
        for (const f of shown) {
          console.log(`  ✗ ${f.file} [${f.field}] expected=${JSON.stringify(f.expected)} got=${JSON.stringify(f.got)}`);
        }
        if (!args.verbose && r.failures.length > 15) {
          console.log(`  ... อีก ${r.failures.length - 15} รายการ (ใช้ --verbose)`);
        }
      }
    }
  }

  await engine.shutdown();

  if (results.length > 1) {
    console.log('\n===== สรุป grid (เรียงตาม end-to-end) =====');
    [...results]
      .sort((a, b) => b.e2e.ok / (b.e2e.n || 1) - a.e2e.ok / (a.e2e.n || 1))
      .forEach((r) => console.log(`${r.tag.padEnd(22)} ${pct(r.e2e.ok, r.e2e.n)}`));
  }

  if (results.length) {
    const out = path.join(DIR, `report-${Date.now()}.json`);
    fs.writeFileSync(out, JSON.stringify(results, null, 2));
    console.log(`\nบันทึกรายงาน: ${out}`);
  }
})().catch(async (e) => {
  console.error(e);
  await engine.shutdown().catch(() => {});
  process.exit(1);
});