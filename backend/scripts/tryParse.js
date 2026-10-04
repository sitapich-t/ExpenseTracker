const ocr = require('../services/ocrService');
const text = `1 ขหขหนมรีบกั้ง (ผสมเนื้อ                42.00
1 ชิกเก้นแฟรงค์พริก                  42.00
1 ช็อกโกแลตครีมษีสลา                29.00
1 M-Stamp(uvan)                      0.00N
ยอดสูทธิ     3 ชั้น          113.00`;
console.log(ocr.parseText(text).items);