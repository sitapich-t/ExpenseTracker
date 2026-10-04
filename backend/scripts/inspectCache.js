const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..', 'test-data', 'slips', '.ocr-cache', 's1_p3_tnone');

function walk(p) {
  const st = fs.statSync(p);
  if (st.isDirectory()) return fs.readdirSync(p).flatMap(n => walk(path.join(p, n)));
  return [p];
}

for (const f of walk(root)) {
  const raw = fs.readFileSync(f, 'utf8');
  if (!/SANOOK|Ksher|ไปยัง|เติมเงิน/i.test(raw)) continue;
  console.log('\n===== ' + path.relative(root, f) + ' =====');
  console.log(raw);
  const line = raw.split('\n').find(l => /เติมเงินพร้อมเพย์/.test(l));
  if (line) {
    console.log('\n--- code points ของบรรทัดที่มี "เติมเงินพร้อมเพย์" ---');
    console.log(JSON.stringify(line));
    console.log([...line.slice(0, 12)].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase()).join(' '));
  }
}