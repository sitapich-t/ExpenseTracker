// ==========================================
// เก็บรูปใบเสร็จที่สแกนไว้ชั่วคราวใน memory (ไม่ผ่าน router params)
//
// เหตุผล: การส่ง imageUri เป็น file:// หรือ content:// URI ผ่าน router params
// แล้วให้ <Image> อ่านจาก path บน disk เจอ bug ของ Expo Go (โหมด anonymous)
// ที่ path ของ ExperienceData folder มีอักขระ %40 / %2F เป็นส่วนหนึ่งของชื่อ
// โฟลเดอร์จริง แล้ว Android Uri parser ไป decode ซ้ำเป็น path ซ้อนโฟลเดอร์ผิดๆ
// ทำให้โหลดไฟล์ไม่เจอ (ENOENT) เสมอ ไม่ว่าจะใช้ URI รูปแบบไหนก็ตาม
//
// ทางแก้: เก็บรูปเป็น base64 data URI ไว้ใน memory ธรรมดา (ไม่ต้องอ่านจาก disk
// อีกครั้ง จึงไม่โดน bug การ parse path) แล้วให้หน้า confirm-receipt ดึงมาใช้ตรงๆ
// ==========================================

let scannedImageDataUri = null;

export function setScannedImage(dataUri) {
  scannedImageDataUri = dataUri;
}

export function getScannedImage() {
  return scannedImageDataUri;
}

export function clearScannedImage() {
  scannedImageDataUri = null;
}