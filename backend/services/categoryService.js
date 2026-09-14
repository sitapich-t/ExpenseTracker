// เก็บ keyword -> category_id ตรงกับตาราง categories จริงใน Supabase (ยืนยันแล้ว 9 หมวด)
// 1=Food, 2=Shopping, 3=Travel, 4=Transport, 5=Study, 6=Entertainment, 7=Health, 8=Bills, 9=Other
const CATEGORY_KEYWORD_MAP = [
  { categoryId: 1, keywords: ['7-eleven', 'เซเว่น', 'โลตัส', 'ร้านอาหาร', 'restaurant', 'cafe', 'ข้าว', 'ก๋วยเตี๋ยว'] }, // Food
  { categoryId: 2, keywords: ['lazada', 'shopee', 'central', 'robinson'] },                                            // Shopping
  { categoryId: 3, keywords: ['booking.com', 'agoda', 'airline', 'โรงแรม'] },                                          // Travel
  { categoryId: 4, keywords: ['grab', 'bts', 'mrt', 'ปตท', 'taxi', 'บางจาก'] },                                        // Transport
  { categoryId: 5, keywords: ['ศึกษาภัณฑ์', 'se-ed', 'bookstore', 'มหาวิทยาลัย'] },                                    // Study
  { categoryId: 6, keywords: ['netflix', 'spotify', 'โรงหนัง', 'major cineplex'] },                                    // Entertainment
  { categoryId: 7, keywords: ['โรงพยาบาล', 'คลินิก', 'pharmacy', 'boots', 'watsons'] },                                // Health
  { categoryId: 8, keywords: ['ค่าไฟ', 'ค่าน้ำ', 'ค่าเน็ต', 'true', 'ais', 'dtac'] },                                   // Bills
];

exports.classifyCategory = (merchant = '', rawText = '') => {
  const haystack = `${merchant} ${rawText}`.toLowerCase();

  for (const { categoryId, keywords } of CATEGORY_KEYWORD_MAP) {
    const matched = keywords.some((kw) => haystack.includes(kw.toLowerCase()));
    if (matched) {
      const inMerchant = keywords.some((kw) => merchant.toLowerCase().includes(kw.toLowerCase()));
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