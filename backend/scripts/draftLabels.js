#!/usr/bin/env node
/* eslint-disable no-console */
// backend/scripts/draftLabels.js
//
// ร่าง labels.json จากผล OCR + parseText เพื่อให้คุณ "ตรวจแก้" แทนพิมพ์เอง
//
// วิธีใช้ (รันจากโฟลเดอร์ backend/):
//   node scripts/draftLabels.js                        # ใช้ scale=2 psm=6 threshold=none
//   node scripts/draftLabels.js --scale=3 --psm=6
//   node scripts/draftLabels.js --dir=test-data/slips
//
// ผลลัพธ์ (ในโฟลเดอร์ข้อมูล):
//   labels.draft.json  ร่าง label เฉพาะรูปที่ยังไม่มีใน labels.json (ไม่ทับของเดิม)
//   review.html        เปิดดูภาพคู่กับค่าที่ร่างไว้ ช่องที่น่าสงสัยไฮไลต์สีเหลือง
//
// ขั้นตอนต่อ: ตรวจ/แก้ใน labels.draft.json ให้ตรงกับ "ภาพจริง" แล้วลบฟิลด์ที่ขึ้นต้นด้วย _
// (ไม่ลบก็ได้ evalOcr.js ไม่สนใจ) จากนั้นเปลี่ยนชื่อ/รวมเข้า labels.json

const fs = require('fs');
const path = require('path');
const engine = require('../services/ocrEngine');
const ocr = require('../services/ocrService');

const args = {};
for (const a of process.argv.slice(2)) {
  const [k, v = 'true'] = a.replace(/^--/, '').split('=');
  args[k] = v;
}

const DIR = path.resolve(args.dir || 'test-data/slips');
const cfg = {
  scale: Number(args.scale || 2),
  psm: String(args.psm || '6'),
  threshold: String(args.threshold || 'none'),
};
const tag = `s${cfg.scale}_p${cfg.psm}_t${cfg.threshold}`;
const CACHE_DIR = path.join(DIR, '.ocr-cache', tag); // ใช้ร่วมกับ evalOcr.js ได้
const LABELS_FILE = path.join(DIR, 'labels.json');

// แปลง ISO (UTC) -> YYYY-MM-DD ตามเวลาไทย เหมือน bkkDate ใน evalOcr.js
const bkkDate = (iso) =>
  iso ? new Date(new Date(iso).getTime() + 7 * 3600e3).toISOString().slice(0, 10) : null;

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

(async () => {
  const existing = fs.existsSync(LABELS_FILE) ? JSON.parse(fs.readFileSync(LABELS_FILE, 'utf8')) : {};
  const images = fs
    .readdirSync(DIR)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f))
    .sort();

  fs.mkdirSync(CACHE_DIR, { recursive: true });
  const draft = {};
  let ocrRuns = 0;

  for (const file of images) {
    if (existing[file]) continue; // ไม่ทับ label ที่ยืนยันแล้ว

    const cacheFile = path.join(CACHE_DIR, `${file}.txt`);
    let rawText;
    if (fs.existsSync(cacheFile)) {
      rawText = fs.readFileSync(cacheFile, 'utf8');
    } else {
      process.stdout.write(`OCR ${file} ... `);
      ({ rawText } = await engine.recognizeText(path.join(DIR, file), cfg));
      fs.writeFileSync(cacheFile, rawText);
      ocrRuns++;
      console.log('ok');
    }

    let p;
    try {
      p = ocr.parseText(rawText);
    } catch (e) {
      draft[file] = { total: null, date: null, transactionId: null, bankName: null, merchant: null,
        documentType: null, _check: ['all'], _note: `parse error: ${e.message}` };
      continue;
    }

    const entry = {
      total: p.total || null,
      date: bkkDate(p.date),
      transactionId: p.transactionId || null,
      bankName: p.bankName || null,
      merchant: p.merchant || null,
      documentType: p.documentType || null,
    };

    // ฟิลด์ที่ต้องดูภาพเป็นพิเศษ
    const check = [];
    if (!entry.total) check.push('total');
    if (!entry.date) check.push('date');
    if (!entry.merchant) check.push('merchant');
    if (!entry.bankName) check.push('bankName');
    // สลิปควรมีเลขอ้างอิง; ใบเสร็จมักไม่มี
    if (entry.documentType === 'slip' && !entry.transactionId) check.push('transactionId');
    // เลขเงินที่ขึ้นต้นด้วย 8 และไม่มี comma: อาจเป็น ฿ ที่ OCR อ่านผิด (หรือเป็นเลขจริง)
    if (entry.total && /^8\d{2,}(\.\d+)?$/.test(String(entry.total)) && entry.total >= 800) check.push('total(8xx)');

    draft[file] = { ...entry, _check: check, _ocr: rawText.slice(0, 400) };
  }

  await engine.shutdown();

  fs.writeFileSync(path.join(DIR, 'labels.draft.json'), JSON.stringify(draft, null, 2));

  // ---------- review.html ----------
  const rows = Object.entries(draft)
    .map(([file, d]) => {
      const cell = (k) => {
        const flagged = (d._check || []).some((c) => c === 'all' || c.startsWith(k));
        return `<tr${flagged ? ' style="background:#fff3b0"' : ''}><td>${k}</td><td>${esc(d[k])}</td></tr>`;
      };
      const fields = ['total', 'date', 'transactionId', 'bankName', 'merchant', 'documentType'].map(cell).join('');
      return `<section><h3>${esc(file)}</h3>
<div style="display:flex;gap:16px;align-items:flex-start">
<img src="${encodeURI(file)}" style="max-height:520px;max-width:320px;border:1px solid #ccc">
<table border="1" cellpadding="4" style="border-collapse:collapse;font-family:sans-serif">${fields}</table>
</div></section><hr>`;
    })
    .join('\n');

  fs.writeFileSync(
    path.join(DIR, 'review.html'),
    `<!doctype html><meta charset="utf-8"><title>Label review</title>
<body style="font-family:sans-serif;margin:24px"><h2>ตรวจร่าง label (${Object.keys(draft).length} ใบ)</h2>
<p>แถวสีเหลือง = ค่าว่างหรือน่าสงสัย ดูภาพแล้วแก้ใน labels.draft.json</p>${rows}</body>`
  );

  const flagged = Object.values(draft).filter((d) => (d._check || []).length).length;
  console.log(`\nร่างแล้ว ${Object.keys(draft).length} ใบ (OCR ใหม่ ${ocrRuns} ใบ, ข้ามที่มี label แล้ว ${images.length - Object.keys(draft).length} ใบ)`);
  console.log(`มีฟิลด์น่าสงสัย ${flagged} ใบ`);
  console.log(`-> ${path.join(DIR, 'labels.draft.json')}`);
  console.log(`-> เปิด ${path.join(DIR, 'review.html')} ในเบราว์เซอร์เพื่อตรวจ`);
})().catch(async (e) => {
  console.error(e);
  await engine.shutdown().catch(() => {});
  process.exit(1);
});