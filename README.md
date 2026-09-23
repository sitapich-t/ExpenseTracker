# Expense Tracker (Mobile Application for Personal and Group Expenses)

แอปพลิเคชันบันทึกและจัดการรายรับรายจ่ายส่วนบุคคลและกลุ่ม พัฒนาด้วย **React Native (Expo SDK 56)** และ **Node.js Express + MySQL**

---

## 📱 หน้าจอทั้งหมด (ตาม Figma Mockups)

1. **หน้าแรก (Home Screen)** — แดชบอร์ดสรุปยอดเงินคงเหลือ, รายการล่าสุด, ปุ่มลัด 4 ฟังก์ชัน
2. **หน้ารายจ่าย (History Screen)** — ประวัติรายรับ-รายจ่าย แยกดูตาม **วัน / สัปดาห์ / เดือน** พร้อมปุ่มลอยเพิ่มรายการ
3. **หน้ากลุ่ม (Group Screen)** — รายการกลุ่มแชร์บิล, สรุปยอดรอรับ/ติดจ่าย, บัตรกลุ่มพร้อมสถานะ
4. **หน้าสร้างกลุ่ม (Create Group)** — กำหนดชื่อ, หมวดหมู่ และธีมสีประจำกลุ่ม
5. **หน้าเข้าร่วมกลุ่ม (Join Group)** — สแกน QR Code หรือกรอกรหัสเชิญ 6 หลัก
6. **หน้ารายละเอียดกลุ่ม (Group Detail)** — ยอดบิลรวม, สมาชิกกลุ่ม, ประวัติค่าใช้จ่ายในกลุ่ม
7. **หน้าเพิ่มค่าใช้จ่ายกลุ่ม (Add Group Expense)** — บันทึกบิลพร้อมระบบคำนวณหารยอดตามจำนวนคน
8. **หน้าเคลียร์บิลกลุ่ม (Group Settle)** — สรุปยอดค้างจ่าย/รอรับ พร้อมปุ่มทวงเงินแจ้งเตือน
9. **หน้าวิเคราะห์ (Report / Analytics)** — สัดส่วนรายจ่าย **SVG Donut Chart** และแนวโน้มรายวัน **Bar Chart**
10. **หน้าโปรไฟล์ (Profile Screen)** — ข้อมูลผู้ใช้, รหัสนักศึกษา, เมนูตั้งค่า, Dark Mode
11. **หน้าแก้ไขโปรไฟล์ (Edit Profile)** — เปลี่ยนรูปโปรไฟล์ และแก้ไขข้อมูลส่วนตัว 5 รายการ
12. **หน้าเพิ่มรายการ (Add Expense)** — บันทึกรายรับ/รายจ่าย พร้อมเลือกหมวดหมู่
13. **หน้าตั้งงบประมาณ (Budget Screen)** — กำหนดงบประมาณรวมและงบประมาณแยกตาม 6 หมวดหมู่
14. **หน้าสแกนใบเสร็จ (Upload Slip)** — ถ่ายรูปหรือเลือกใบเสร็จจากอัลบั้ม
15. **หน้ายืนยันข้อมูลใบเสร็จ (Scan Result)** — ตรวจสอบและแก้ไขข้อมูล OCR ก่อนบันทึก
16. **ระบบยืนยันตัวตน (Auth)** — Login, Register และ OTPScreen

---

## 🚀 วิธีการรันโปรเจกต์ (Quick Start)

### 1. รัน Backend API (Terminal 1)
```bash
cd backend-mysql
npm install
node server.js
```
> เซิร์ฟเวอร์จะเริ่มทำงานที่ `http://localhost:3000` เชื่อมต่อกับ MySQL (Database: `expense_tracker`) โดยไม่ต้องใช้ API Key ภายนอก

### 2. รัน Frontend App (Terminal 2)
```bash
npm install
npm run android
```
> ระบบจะเปิด Expo Go บน Android Studio Emulator ให้อัตโนมัติ (หรือกดแป้นพิมพ์ `a` ใน Terminal)

---

## 📂 โครงสร้างโฟลเดอร์

- `project/` — ซอร์สโค้ดหน้าจอ UI ทั้งหมด (Screens, Components, Theme, Context)
- `backend-mysql/` — Backend API (Express + MySQL) พร้อมไฟล์ schema.sql
- `assets/` — ไอคอนและรูปภาพประกอบของแอป
- `backend/` — Backend เดิม (Supabase + OCR Service)
- `frontend/` — โฟลเดอร์ Frontend เดิม (expo-router)