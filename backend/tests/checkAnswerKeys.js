const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'fixtures', 'slips', 'final');
const KEYS = ['total', 'date', 'merchant', 'bank', 'transactionId'];
const files = fs.readdirSync(dir);
const jsons = files.filter((f) => f.endsWith('.json'));
let errors = 0;
const err = (f, m) => { errors++; console.log(`✗ ${f}: ${m}`); };

for (const j of jsons) {
  const id = path.basename(j, '.json');
  if (!files.some((f) => f.startsWith(id + '.') && !f.endsWith('.json'))) {
    err(j, 'ไม่มีไฟล์ภาพคู่กัน');
  }
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(dir, j), 'utf8')); }
  catch { err(j, 'JSON ไม่ถูกต้อง'); continue; }

  for (const k of KEYS) if (!(k in d)) err(j, `ขาดฟิลด์ ${k}`);
  for (const k of Object.keys(d)) if (!KEYS.includes(k)) err(j, `ฟิลด์เกิน ${k}`);

  if (typeof d.total !== 'number' || !(d.total > 0)) err(j, 'total ต้องเป็นตัวเลข > 0');
  if (d.date !== null) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date || '')) err(j, 'date ต้องเป็น YYYY-MM-DD หรือ null');
    else if (+d.date.slice(0, 4) > 2100) err(j, 'date ดูเหมือนเป็น พ.ศ. ต้องแปลงเป็น ค.ศ.');
  }  
  for (const k of ['merchant', 'bank', 'transactionId']) {
    if (d[k] === '') err(j, `${k} เป็นข้อความว่าง ต้องใช้ null`);
    if (d[k] !== null && typeof d[k] !== 'string') err(j, `${k} ต้องเป็นสตริงหรือ null`);
  }
  if (d.transactionId && /\s/.test(d.transactionId)) err(j, 'transactionId มีช่องว่าง');
}
console.log(errors ? `\nพบ ${errors} ปัญหา` : `\nเฉลย ${jsons.length} ไฟล์ ผ่านการตรวจรูปแบบ`);
process.exit(errors ? 1 : 0);