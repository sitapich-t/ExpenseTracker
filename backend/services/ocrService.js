// ==========================================
// OCR & Receipt Scanning Service
// NOTE: Mock implementation — parses merchant/amount from the uploaded
// filename only; no real OCR yet.
// ==========================================

exports.scanReceipt = ({ file, image } = {}) => {
  let merchant = 'comico (NHN THAILAND)';
  let total = 285.0;
  let parsedText = '';

  if (file && file.originalname) {
    parsedText = file.originalname;
    const match = file.originalname.match(/([^_]+)__?.*?(?:total|amt|amount)[_\-]?(\d+(?:[\.,]\d+)?)/i);
    if (match) {
      merchant = match[1].replace(/[-_]/g, ' ');
      total = parseFloat(match[2].replace(',', '.'));
    }
  } else if (image) {
    parsedText = 'Base64 Receipt Image Processed Successfully';
  }

  return { merchant, total, parsedText };
};