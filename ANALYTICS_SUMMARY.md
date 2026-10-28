# สรุปการทำงานของระบบวิเคราะห์การใช้จ่าย (Analytics)

## 1. ภาพรวม
ระบบวิเคราะห์การใช้จ่ายแยกการคำนวณออกเป็น 2 ส่วนหลัก:
- **ฝั่ง Backend** มี `analyticsService.js` ที่คำนวณและรวมข้อมูลให้อยู่ในรูปแบบพร้อมใช้งาน
- **ฝั่ง Frontend** มี `analyticsUtils.js` ที่ใช้ดึงข้อมูลจาก API แล้วคำนวณใหม่ทั้งหมดเพื่อแสดงผลบนหน้าจอ `analytics.js` (ซึ่งเป็นรูปแบบที่หน้าแอปใช้งานในปัจจุบัน)

## 2. แหล่งข้อมูลที่ใช้
หน้าจอ Analytics (`frontend/src/app/(main)/analytics.js`) จะดึงข้อมูลพร้อมกัน 2 รายการเมื่อหน้าโฟกัส:

| API Endpoint | วัตถุประสงค์ | ข้อมูลที่ได้ |
| --- | --- | --- |
| `GET /api/v1/personal/transactions` | ดึงรายการธุรกรรมทั้งหมดของผู้ใช้ | `transaction_date`, `amount`, `type`, `category_id`, `categories` (id, name, icon_type) |
| `GET /api/v1/personal/budgets?month={m}&year={y}` | ดึงงบประมาณประจำเดือน | `category_id`, `monthly_limit` (ใช้เฉพาะงบประมาณแบบรวม `category_id = null`) |

## 3. การทำงานฝั่ง Backend

### 3.1 Repository
- `backend/repositories/transactionRepository.js::listForAnalytics(userId, { from, to })`
  - ดึงเฉพาะฟิลด์ `transaction_date`, `amount`, `type`, `categories(id, name, icon_type)`
  - กรองตามช่วงวันที่ โดยแปลงเป็น ISO ในโซนเวลา `+07:00` (`00:00:00+07:00` ถึง `23:59:59.999+07:00`)
  - เรียงตาม `transaction_date` จากน้อยไปมาก

### 3.2 Service
`backend/services/analyticsService.js` ทำหน้าที่คำนวณข้อมูลสถิติ:

| ฟังก์ชัน | รายละเอียด |
| --- | --- |
| `toDateStr(t)` | แปลง `transaction_date` ให้เป็น `YYYY-MM-DD` โดยบวก +7 ชั่วโมง (เนื่องจาก Supabase อาจเก็บเป็น UTC) เพื่อให้จัดกลุ่มตามวันที่ในประเทศไทยถูกต้อง |
| `filterByRange(items, from, to)` | กรองรายการตามช่วงวันที่ที่ผู้ใช้ส่งมา |
| `onlyExpenses(items)` | กรองเฉพาะรายการที่เป็นรายจ่าย (`type !== 'income'`) ถ้าไม่มี `type` จะถือเป็นรายจ่าย |
| `groupSum(items, keyFn)` | รวมยอด `amount` ตาม key ที่กำหนด (เช่น หมวดหมู่หรือเดือน) |
| `byCategory(items)` | รวมรายจ่ายตามชื่อหมวดหมู่ (`categories.name` หรือ "ไม่ระบุหมวดหมู่"), เรียงจากมากไปน้อย |
| `byMonth(items)` | รวมรายจ่ายตามเดือน (`YYYY-MM`), เติมเดือนที่ขาดหายระหว่างเดือนแรก-สุดท้ายเพื่อให้กราฟต่อเนื่อง |
| `getSummary(items)` | คำนวณ `total`, `count`, `average`, `max` จากรายการรายจ่าย |
| `getIncomeExpense(items)` | แยกยอดรายรับ (`income`) และรายจ่าย (`expense`), คำนวณ `balance = income - expense` |
| `buildAnalytics(items, { from, to })` | รวบรวมผลลัพธ์ทั้งหมดส่งกลับในรูปแบบ `summary`, `incomeExpense`, `byCategory`, `byMonth` |

Endpoint ที่ใช้งาน: `GET /api/v1/personal/analytics` ใน `personalController.js::getAnalytics` จะเรียก `transactionRepository.listForAnalytics` แล้วส่งต่อให้ `analyticsService.buildAnalytics`

## 4. การทำงานฝั่ง Frontend

### 4.1 การดึงและเตรียมข้อมูล
ใน `frontend/src/app/(main)/analytics.js`:
1. ดึง `transactions` ทั้งหมดจาก `/personal/transactions` และ `budgets` ของเดือนปัจจุบันจาก `/personal/budgets`
2. หา `overall` budget โดยดูที่ `category_id === null` หรือ `undefined` เพื่อใช้เป็น "งบประมาณรวม"
3. คำนวณ `weeklyBudget = monthlyBudget / 4` (ใช้ประมาณการสำหรับแท็บสัปดาห์)
4. สร้างข้อมูลสำหรับ 2 แท็บ: `week` และ `month` ผ่าน `buildPeriod()` จาก `analyticsUtils.js`

### 4.2 ฟังก์ชันหลักใน `analyticsUtils.js`

| ฟังก์ชัน | รายละเอียด |
| ---tag( |
| `startOfWeek(d)` | กำหนดจุดเริ่มสัปดาห์เป็นวันจันทร์ (คำนวณจาก `getDay()` ปรับให้นับจันทร์เป็นวันแรก) และตั้งเวลาเป็น 00:00:00 |
| `expensesBetween(transactions, start, end)` | กรองเฉพาะรายการรายจ่าย (`type !== 'income'`) ที่มีวันที่อยู่ในช่วง `[start, end)` |
| `totalExpenseBetween(...)` | รวมยอดรายจ่ายในช่วงเวลาที่กำหนด |
| `buildCategoryBreakdown(...) | แตกยอดรายจ่ายตามหมวดหมู่, จัดเรียงจากมากไปน้อย, คำนวณเปอร์เซ็นต์ และจัดสีกับ `CATEGORY_COLORS` |
| `buildDailyTrends(...) | สร้างแท่งกราฟรายวันสำหรับ 7 วัน (จันทร์–อาทิตย์) |
| `buildWeeklyTrends(...) | แบ่งวันที่ในเดือนเป็น 5 สัปดาห์ (`Math.floor((date-1)/7)`, จำกัดสูงสุดที่สัปดาห์ที่ 5), บวกยอดในแต่ละสัปดาห์ และตัดสัปดาห์ที่ว่างออก |
| `comparisonText(current, previous)` | คำนวณเปรียบเทียบกับช่วงก่อนหน้าเป็นเปอร์เซ็นต์ (+x% / -x%) ถ้าไม่มีข้อมูลช่วงก่อนหน้าจะส่งข้อความพิเศษ |
| `comparisonDirection(current, previous)` | คืนค่า `up` / `down` / `flat` เพื่อกำหนดสีของ badge |
| `buildPeriod({...}) | สร้างอ็อบเจกต์ข้อมูลพร้อมใช้งานสำหรับ UI ทั้งหมด ได้แก่ `totalExpense, comparison, comparisonDirection, budgetRemaining, budgetGoal, budgetProgress, donutCenter, categories, trends, maxTrendVal` |
| `buildYearPeriod(analytics, year)` | ใช้ข้อมูลจาก API `/analytics` (รูปแบบ `byMonth`/`byCategory`) มาสร้างข้อมูลรายปีสำหรับกราฟ (ฟังก์ชันนี้มีใช้ในบางบริบท) |
| `emptyPeriod` | ค่าตั้งต้นเมื่อไม่มีข้อมูลหรือเกิดข้อผิดพลาด |

### 4.3 การแสดงผลกราฟบน UI
`analytics.js` แปลงข้อมูลจาก `buildPeriod()` มาแสดงผลดังนี้:

| ส่วนของ UI | ข้อมูลที่ใช้ | วิธีแสดงผล |
| --- | --- | --- |
| การ์ดยอดรวม | `totalExpense`, `comparison`, `comparisonDirection` | แสดงยอดรวมรายจ่ายในช่วงที่เลือก พร้อม badge เปรียบเทียบ (สีแดงเมื่อ `up`, สีเขียวเมื่อ `down`) |
| ส่วนงบประมาณ | `budgetLimit`, `budgetProgress`, `budgetRemaining`, `budgetGoal` | แสดงแถบความคืบหน้า `budgetProgress * 100%` (จำกัดไม่เกิน 100%), แสดงงบประมาณที่เหลือ (`budgetLimit - totalExpense`) |
| กราฟโดนัท (แยกตามหมวดหมู่) | `categories[]` (name, amount, percent, color) | วาดด้วย `react-native-svg` คำนวณ `strokeDashoffset` จากเปอร์เซ็นต์ของแต่ละส่วน วงกลมกลางแสดง `donutCenter` (รูปแบบย่อ เช่น `1.2K`) |
| กราฟแท่ง (แนวโน้ม) | `trends[]`, `maxTrendVal` | ความสูงของแท่ง = `(val / maxTrendVal) * 100%` (อย่างน้อย 8%) แสดงยอดแบบย่อ (`formatShortBaht`) และป้ายกำกับตามช่วงเวลา |
| แท็บสัปดาห์/เดือน | `weekData` vs `monthData` | สลับข้อมูลได้ทันทีโดยไม่ต้องเรียก API ใหม่ซ้ำ เนื่องจากคำนวณไว้ทั้งหมดตั้งแต่เริ่ม |

## 5. สรุปการทำงานโดยย่อ
1. **ดึงข้อมูล**: Frontend ดึง `transactions` + `budgets` ทั้งหมดมาเก็บในตัวแปร
2. **กรอง**: กรองเฉพาะรายการ `type !== 'income'` และอยู่ในช่วงเวลาที่เลือก
3. **รวมยอด**: รวมตามหมวดหมู่/วัน/สัปดาห์/เดือน
4. **เปรียบเทียบ**: เทียบกับช่วงเวลาเดียวกันของช่วงก่อนหน้าเพื่อคำนวณเปอร์เซ็นต์
5. **แสดงผล**: ส่งต่อข้อมูลที่ผ่านการประมวลผลให้ UI วาดกราฟและการ์ดต่างๆ

**หมายเหตุสำคัญ:** ในแอปปัจจุบัน `frontend/src/app/(main)/analytics.js` **ไม่ได้เรียกใช้** `GET /api/v1/personal/analytics` โดยตรง แต่เลือกที่จะ **คำนวณทั้งหมดบน Frontend** จากข้อมูล `transactions` ที่ดึงมาทั้งหมดมากกว่า ซึ่งช่วยให้สามารถสลับช่วงเวลา (สัปดาห์/เดือน) และเปลี่ยนเดือนได้อย่างรวดเร็วโดยไม่ต้องยิง API ซ้ำหลายครั้ง
