// เก็บ keyword -> category_id ตรงกับตาราง categories จริงใน Supabase (ยืนยันแล้ว 9 หมวด)
// 1=Food, 2=Shopping, 3=Travel, 4=Transport, 5=Study, 6=Entertainment, 7=Health, 8=Bills, 9=Other
const CATEGORY_KEYWORD_MAP = [
  { categoryId: 1, keywords: [
    '7-eleven', 'เซเว่น', 'โลตัส', 'ร้านอาหาร', 'restaurant', 'cafe', 'ข้าว', 'ก๋วยเตี๋ยว',
    'soup', 'ซุป', 'อาหาร', 'food', 'ก๋วยจั๊บ', 'ผัด', 'ต้ม', 'แกง', 'ยำ',
    'เมนู', 'จาน', 'กับข้าว', 'อร่อย', 'เสิร์ฟ', 'เสริฟ', 'บุฟเฟต์', 'ชาบู', 'หมูกระทะ',
    'กาแฟ', 'ชา', 'ชานม', 'ขนม', 'เบเกอรี่', 'เครื่องดื่ม', 'กิน', 'กินข้าว', 'สเต็ก',
  ] }, // Food
  { categoryId: 2, keywords: [
    'lazada', 'shopee', 'central', 'robinson', 'ช้อปปิ้ง', 'ช็อปปิ้ง', 'ช้อป', 'ช็อป',
    'ซื้อของ', 'เสื้อผ้า', 'กางเกง', 'กระเป๋า', 'รองเท้า', 'ห้าง', 'เครื่องสำอาง', 'ของใช้',
    'mall', 'outlet', 'ซูเปอร์มาร์เก็ต', 'supermarket',
  ] }, // Shopping
  { categoryId: 3, keywords: [
    'booking.com', 'agoda', 'airline', 'โรงแรม', 'ท่องเที่ยว', 'เที่ยว', 'ทริป', 'ตั๋วเครื่องบิน',
    'บิน', 'รีสอร์ท', 'โฮสเทล', 'ห้องพัก', 'hotel', 'resort', 'flight', 'ทัวร์',
  ] }, // Travel
  { categoryId: 4, keywords: [
    'grab', 'bts', 'mrt', 'ปตท', 'taxi', 'บางจาก', 'เดินทาง', 'ค่าน้ำมัน', 'น้ำมัน',
    'รถเมล์', 'วิน', 'แท็กซี่', 'รถไฟ', 'ทางด่วน', 'ค่ารถ', 'ตั๋วรถ', 'มอไซค์', 'มอเตอร์ไซค์',
    'gas', 'fuel', 'ปั๊มน้ำมัน',
  ] }, // Transport
  { categoryId: 5, keywords: [
    'ศึกษาภัณฑ์', 'se-ed', 'bookstore', 'มหาวิทยาลัย', 'การศึกษา', 'ค่าเทอม', 'เรียน',
    'หนังสือ', 'เครื่องเขียน', 'อบรม', 'คอร์ส', 'ติว', 'university', 'school', 'โรงเรียน',
  ] }, // Study
  { categoryId: 6, keywords: [
    'netflix', 'spotify', 'โรงหนัง', 'major cineplex', 'บันเทิง', 'เกม', 'เติมเกม',
    'ดูหนัง', 'คอนเสิร์ต', 'คาราโอเกะ', 'disney', 'youtube', 'สตรีมมิ่ง', 'cinema', 'game',
  ] }, // Entertainment
  { categoryId: 7, keywords: [
    'โรงพยาบาล', 'คลินิก', 'pharmacy', 'boots', 'watsons', 'สุขภาพ', 'ค่ายา', 'ยา',
    'หาหมอ', 'ทำฟัน', 'ตรวจสุขภาพ', 'วิตามิน', 'วัคซีน', 'hospital', 'clinic', 'ฟิตเนส',
  ] }, // Health
  { categoryId: 8, keywords: [
    'ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต', 'true', 'ais', 'dtac', 'บิล', 'ค่าโทรศัพท์',
    'ค่าห้อง', 'ค่าเช่า', 'ค่าคอนโด', 'ค่าส่วนกลาง', 'ค่าบ้าน', 'ค่าแก๊ส', 'utility', 'bills',
  ] }, // Bills
];

exports.classifyCategory = (merchant = '', rawText = '') => {
  const haystack = `${merchant} ${rawText}`.normalize('NFC').toLowerCase();

  for (const { categoryId, keywords } of CATEGORY_KEYWORD_MAP) {
    const matched = keywords.some((kw) => haystack.includes(kw.normalize('NFC').toLowerCase()));
    if (matched) {
      const inMerchant = keywords.some((kw) => merchant.normalize('NFC').toLowerCase().includes(kw.normalize('NFC').toLowerCase()));
      return { categoryId, confidence: inMerchant ? 0.85 : 0.5 };
    }
  }
  return { categoryId: 9, confidence: 0 }; // ไม่แมตช์อะไรเลย → fallback เป็น "Other" (id 9)
};

exports.classifyCategoryName = (merchant = '', rawText = '') => {
  const { categoryId, confidence } = exports.classifyCategory(merchant, rawText);
  const CATEGORY_ID_TO_NAME = {
    1: 'Food', 2: 'Shopping', 3: 'Travel', 4: 'Transport',
    5: 'Study', 6: 'Entertainment', 7: 'Health', 8: 'Bills', 9: 'Other',
  };
  return { categoryName: CATEGORY_ID_TO_NAME[categoryId] || 'Other', confidence };
};