# Student Wallet API

Base URL: `http://localhost:3000`

- Public endpoints don't need a token.
- Protected endpoints require `Authorization: Bearer <token>` (JWT from `POST /api/v1/auth/login`).
- Most endpoints expect `Content-Type: application/json` (exception: `scan-receipt` = `multipart/form-data`).
- Live example requests: see `backend/api-tests.http` (VS Code REST Client).

---

## Health

| Method | Path           | Auth | Description                            |
|--------|----------------|------|----------------------------------------|
| GET    | `/api/health`  | –    | Server + Supabase connectivity check   |

Response: `{ "status": "ok", "supabaseConnected": true }`

---

## Auth — `/api/v1/auth`

| Method | Path                             | Auth | Description                                                        |
|--------|----------------------------------|------|--------------------------------------------------------------------|
| POST   | `/register/request-otp`          | –    | Registration step 1 — checks email free, sends OTP **email**, returns `registration_token` (10 min) |
| POST   | `/register/verify-otp`           | –    | Registration step 2 — verifies OTP, creates user (verified), returns JWT |
| POST   | `/register/resend-otp`           | –    | New OTP + refreshed `registration_token` (cooldown still applies)  |
| POST   | `/reset-password/request-otp`    | –    | Password reset step 1 — sends OTP **email**, returns `password_reset_token` (10 min) |
| POST   | `/reset-password/verify-otp`     | –    | Password reset step 2 — verifies OTP, returns `reset_verified_token` (4 min, single-use) |
| POST   | `/reset-password/confirm`        | –    | Password reset step 3 — sets new password, **revokes all sessions** |
| POST   | `/login`                         | –    | Login with `email` + `password` → returns JWT                      |

> **Migration required:** run `backend/sql/add_token_version.sql` in Supabase SQL Editor first
> (adds `users.token_version`). Without it every protected endpoint returns 500.

**Flow tokens are stateless** — no pending rows in the DB. The short-lived JWT is held by the
mobile app in memory only; killing the app mid-flow orphans nothing.

### Rate limits (in-memory, per server process)

| Control | Key | Limit |
|---|---|---|
| Cooldown between OTP sends | email | 60 s |
| Daily OTP sends | email | 5/day |
| Daily OTP sends | IP | 10/day |
| Failed OTP verifications | per token (`jti`) | 5 then token blocked |
| Failed OTP verifications | per email | 15/day |
| `/reset-password/confirm` | IP | 10/hour |
| All `/auth/*` requests | IP | 60/min |

Exceeding a limit → `429` `{ "success": false, "error": "...", "retry_after": <sec> }` + `Retry-After` header.

### POST `/api/v1/auth/register/request-otp`
```json
{ "email": "somchai@example.com", "password": "password123", "name": "สมชาย ใจดี" }
```
→ `200` `{ "success": true, "message": "ส่งรหัส OTP ไปทางอีเมลแล้ว", "registration_token": "<JWT>", "expires_in": 600 }`

- `400` invalid email, name empty, password < 8
- `409` `{ "error": "อีเมลนี้ถูกลงทะเบียนแล้ว" }`
- `429` cooldown/daily limit (`retry_after`)
- Password is bcrypt-hashed **before** being placed in the token; the OTP is sent via email
  (dev fallback logs it to the server console — `services/emailService.js`).

### POST `/api/v1/auth/register/verify-otp`
```json
{ "registration_token": "<JWT>", "otp": "123456" }
```
→ `200` `{ "success": true, "message": "สมัครสมาชิกสำเร็จ", "token": "<JWT 30d>", "user": { "id", "name", "email" } }`

- `400` OTP not 6 digits | `401` wrong OTP (+ `attempts_remaining`) or invalid/expired token
- `409` email taken meanwhile | `429` token blocked after 5 failed attempts
- New user is inserted **already verified** (`is_verified: true`, `token_version: 0`).

### POST `/api/v1/auth/register/resend-otp`
```json
{ "registration_token": "<JWT>" }
```
→ `200` `{ "success": true, "message": "ส่งรหัส OTP ใหม่แล้ว", "registration_token": "<new JWT>", "expires_in": 600 }`

Token is signature-verified (never bare-decoded); cooldown + daily limits apply.

### POST `/api/v1/auth/reset-password/request-otp`
```json
{ "email": "somchai@example.com" }
```
→ `200` `{ "success": true, "message": "ส่งรหัส OTP ไปทางอีเมลแล้ว", "password_reset_token": "<JWT>", "expires_in": 600 }`

- `404` email not found | `403` account not yet verified | `429` cooldown/daily limit

### POST `/api/v1/auth/reset-password/verify-otp`
```json
{ "password_reset_token": "<JWT>", "otp": "123456" }
```
→ `200` `{ "success": true, "message": "ยืนยันตัวตนสำเร็จ", "reset_verified_token": "<JWT>", "expires_in": 240 }`

- `401` wrong OTP (+ `attempts_remaining`) / expired | `429` blocked after 5 failed attempts

### POST `/api/v1/auth/reset-password/confirm`
```json
{ "reset_verified_token": "<JWT>", "newPassword": "newsecret456" }
```
→ `200` `{ "success": true, "message": "เปลี่ยนรหัสผ่านสำเร็จ กรุณาเข้าสู่ระบบใหม่" }`

- `400` password < 8 | `401` invalid/expired/already-used token | `404` user gone | `429` IP limit
- Increments `users.token_version` → **every outstanding access token is rejected**
  (force logout on all devices).

### POST `/api/v1/auth/login`
```json
{ "email": "somchai@example.com", "password": "password123" }
```
→ `{ "success": true, "token": "<JWT>", "user": {...} }`

### Access-token rules (`authenticate` middleware)
- `type` claim must be `access` (flow tokens are rejected as login tokens)
- `ver` claim is required and must equal `users.token_version`
- ⚠️ Tokens issued before this deploy have no `ver` → **all users re-login once** after deploy

> Note: Mailtrap demo-sender domains may reject sending to non-owner emails. In that case the OTP is logged to the server console (dev fallback) instead — `services/emailService.js`.

---

## Personal — `/api/v1/personal` (JWT required)

### Budgets

| Method | Path                     | Description              |
|--------|--------------------------|--------------------------|
| GET    | `/budgets`               | List budgets (`?month=&year=` filter) |
| POST   | `/budgets`               | Create/update (upsert by month+year+category) |
| PUT    | `/budgets/:id`           | Update `monthly_limit` and/or `category_id` |
| DELETE | `/budgets/:id`           | Delete a budget          |

#### POST `/api/v1/personal/budgets`
```json
{ "category_id": 3, "monthly_limit": 5000, "month": 9, "year": 2026 }
```
Omit `category_id` for a global (uncategorized) budget.

#### PUT `/api/v1/personal/budgets/:id`
```json
{ "monthly_limit": 6500, "category_id": 5 }
```
Only fields present in the body are written (`category_id: null` clears it back to global).

### Transactions

| Method | Path                             | Description                          |
|--------|----------------------------------|--------------------------------------|
| GET    | `/transactions`                  | List (`?month=&year=&category_id=&type=`) |
| POST   | `/transactions`                  | Create transaction (persists to DB)  |
| POST   | `/transactions/scan-receipt`     | Mock OCR — parses merchant/amount from filename, no DB write |
| PUT    | `/transactions/:id`              | Update transaction                   |
| DELETE | `/transactions/:id`              | Delete transaction                   |

#### POST `/api/v1/personal/transactions`
```json
{
  "title": "Starbucks",
  "amount": 5.50,
  "type": "expense",
  "category_id": 3,
  "transaction_date": "2026-09-07"
}
```
`type` ∈ `income | expense`. Date defaults to today.

#### POST `/api/v1/personal/transactions/scan-receipt`
`multipart/form-data`, field name `receipt` (the image file). No auth.

Filename encoding decides the result: `<merchant>__total-<amount>.png`
e.g. `starbucks__total-5.50.png` → `{ "merchant": "starbucks", "total": 5.5 }`.

> Mock only — sends nothing to the DB, but multer saves the upload under `backend/uploads/`.

---

## Groups — `/api/v1/groups` (JWT required)

> **ต้องรัน migration ก่อน** ไม่งั้น SC/VAT, ผู้จ่าย, สัดส่วน และสลิปจะบันทึกไม่ได้
> รัน `backend/sql/add_group_bill_split_columns.sql` ใน Supabase SQL Editor (รันซ้ำได้)

| Method | Path                  | Auth | Description                  |
|--------|-----------------------|------|------------------------------|
| GET    | `/my`                 | ✔    | List my groups               |
| GET    | `/invite/:code`       | ✔    | Look up a group by invite code |
| POST   | `/create`             | ✔    | Create a group               |
| POST   | `/join`               | ✔    | Join with own token (QR)     |
| DELETE | `/:id`                | ✔    | Delete group (owner only; also removes members/transactions) |
| PATCH  | `/:id/status`         | ✔    | Set `status_type` = settled \| pending \| split |
| GET    | `/:id/transactions`   | ✔    | Group transactions (members only) |
| POST   | `/:id/transactions`   | ✔    | Create group transaction (members only) |
| POST   | `/:id/slips`          | ✔    | Upload a slip image (members only) |
| GET    | `/:id/settlement`     | ✔    | Net balances + transfer list from stored `split_data` (members only) |
| GET    | `/:id/members`        | ✔    | List members                 |
| POST   | `/:id/members`        | ✔    | Add a member                 |

### POST `/api/v1/groups/:id/transactions`

`application/json` **หรือ** `multipart/form-data` (แนบรูปสลิปใน field `slip` ได้เลย)

| Field       | Type   | Notes                                                          |
|-------------|--------|----------------------------------------------------------------|
| `title`     | string | required                                                       |
| `amount`    | number | required — **ราคาก่อน SC/VAT** (ยอดสุทธิจะถูกคำนวณให้)        |
| `subtotal`  | number | optional — ถ้าส่งมาจะใช้แทน `amount`                            |
| `sc_rate`   | number | optional, **เปอร์เซ็นต์** เช่น `10` = 10% (0-100)                |
| `vat_rate`  | number | optional, **เปอร์เซ็นต์** เช่น `7` = 7% (0-100)                 |
| `vat_base`  | string | optional — `itemPlusSC` (default, มาตรฐานไทย) \| `itemOnly`     |
| `type`      | string | optional — `expense` (default) \| `income`                     |
| `merchant`  | string | optional, default `General`                                     |
| `category`  | string | optional, default `General`                                     |
| `date`      | string | optional, default now                                           |
| `paid_by`   | uuid   | optional, default = ผู้สร้าง                                    |
| `split_data`| object \| string | optional — วิธีแจกบิล (equal/percent/item/amount) ดูด้านล่าง |
| `slip_url`  | string | optional — URL จาก `POST /:id/slips`                            |
| `slip`      | file   | multipart only — รูปสลิป (jpg/png/webp/heic, สูงสุด 8 MB)       |

SC/VAT คิดเป็น **สตางค์จริง** (ไม่มีเศษจาก float) และยอดรวมจะตรงกับผลบวกเสมอ

### `split_data` — วิธีแจกบิล (3 กรณีหลัก)

```jsonc
// 1) equal — หารเท่ากันสมาชิกที่ระบุ (fraction ตัดออกจากคนสุดท้ายใน list)
{ "method": "equal", "memberIds": ["<uid-A>", "<uid-B>", "<uid-C>"] }
// 2) percent — แจกตามเปอร์เซ็นต์ ต้องรวม = 100 พอดี
{ "method": "percent", "shares": { "<uid-A>": 70, "<uid-B>": 30 } }
// 3) sub-group แบบ item (ใครกินอะไร): แจกเฉพาะคนที่ sharedBy item นั้น ๆ
//    รวมราคา items ต้องเท่ากับ subtotal พอดี
{ "method": "item", "items": [
    { "id": "กุ้ง",  "price": 300, "sharedBy": ["<uid-A>"] },
    { "id": "หมู",  "price": 200, "sharedBy": ["<uid-B>", "<uid-C>"] }
] }
// 4) sub-group แบบ amount (ยอดตายตัวต่อคน): รวมกันต้องเท่ากับยอดรวม (รวม SC/VAT แล้ว)
{ "method": "amount", "amounts": { "<uid-A>": 120, "<uid-B>": 80, "<uid-C>": 200 } }
```

- `split_data` เป็น JSON string ใน multipart ได้ (server แปลงให้เป็น object)
- SC/VAT แจกตามน้ำหนักของแต่ละวิธี; ผลรวมต่อคน = `price + sc + vat` ตรงเสมอ
- อ้าง `user_id` ที่ **ไม่ใช่สมาชิกกลุ่ม** → `400`
- วิธีไม่ถูกต้อง / percent รวม ไม่ใช่ 100 / item รวม ≠ subtotal / amount รวม ≠ ยอดรวม → `400` พร้อมข้อความเหตุผล (**ไม่เกิด normalization แบบเงียบ ๆ**)

```jsonc
// subtotal 1000, sc 10%, vat 7% (คิด VAT จาก ราคา+SC)
{ "title": "Dinner", "amount": 1000, "sc_rate": 10, "vat_rate": 7 }
// -> subtotal 1000, sc_amount 100, vat_amount 77, amount 1177
```

→ `200`
```json
{
  "success": true,
  "message": "บันทึกรายการสำเร็จ",
  "split_saved": true,
  "dropped_fields": [],
  "slip_url": "/uploads/slips/fd6b5293-....png",
  "transaction": { "...": "..." }
}
```

> ถ้ายังไม่รัน migration: `split_saved` จะเป็น `false` และ `dropped_fields`
> จะระบุชื่อคอลัมน์ที่บันทึกไม่ได้ (เช่น `["sc_amount","paid_by"]`) — บิลยังถูกบันทึก
> แต่ข้อมูลส่วนนั้นหาย ต้องรัน migration แล้วลองใหม่

### POST `/api/v1/groups/:id/slips`

`multipart/form-data`, field `slip` (ไฟล์รูป) → คืน URL สัมพัทธ์ไว้แนบกับบิล

→ `200` `{ "success": true, "slip_url": "/uploads/slips/<uuid>.png" }`

- รับเฉพาะรูปภาพ (jpg/png/webp/heic) สูงสุด 8 MB — ชนิดอื่นได้ `400`
- ชื่อไฟล์ถูกสร้างโดย server (UUID) ไม่รับชื่อจาก client
- เสิร์ฟกลับที่ `GET /uploads/slips/<uuid>.png` (static)
- ไม่ใช่สมาชิกกลุ่ม → `403` (ไฟล์ที่อัปโหลดถูกลบทิ้งให้อัตโนมัติ)

### GET `/api/v1/groups/:id/settlement`

คำนวณยอดสุทธิรายคนจาก `split_data` ของบิลทั้งหมดในกลุ่ม (เฉพาะสมาชิก) — `income` ถูกข้าม, บิลที่ missing
`paid_by` หรือ `split_data` เสียจะไปอยู่ใน `skipped`

→ `200`
```jsonc
{
  "success": true,
  "balances": [ // net balance ต่อคน (บวก = ต้องได้รับ, ลบ = ต้องจ่าย)
    { "user_id": "<uid-B>", "amount": -280, "name": "..." },
    { "user_id": "<uid-A>", "amount": 480 }
  ],
  "transactions": [ // จำนวนโอนที่น้อยที่สุดที่ทำให้ยอดกลับเป็น 0 (debt simplifier)
    { "from": "<uid>", "to": "<uid>", "amount": 200 }
  ],
  "per_bill": { "<billId>": { "<uid>": { "share": 1177, "sc": 77, "vat": 0, "total": 1254 } } },
  "skipped": [ { "id": "...", "reason": "missing paid_by" } ]
}
```
ผลรวม `balances` = 0 เสมอ และไม่มีเงื่อนไขทั้ง 3 กรณี (เท่ากัน/เปอร์เซ็นต์/กลุ่มย่อย) ก็คำนวณได้

---

## Bill Split — `/api/v1/bill-split` (JWT required)

| Method | Path       | Auth | Description                                             |
|--------|------------|------|---------------------------------------------------------|
| POST   | `/split`   | ✔    | แจกบิลด้วยวิธีใดวิธีหนึ่งโดยไม่ต้องผูกกับ group (สมาชิกระบุอิสระ) |

### POST `/api/v1/bill-split/split`

| Field       | Type   | Notes                                                        |
|-------------|--------|--------------------------------------------------------------|
| `title`     | string | required                                                     |
| `amount`    | number | required — ราคาก่อน SC/VAT                                   |
| `subtotal`  | number | optional — ถ้าส่งมาใช้แทน `amount`                           |
| `sc_rate`   | number | optional, เปอร์เซ็นต์ (0-100)                                  |
| `vat_rate`  | number | optional, เปอร์เซ็นต์ (0-100)                                  |
| `vat_base`  | string | optional — `itemPlusSC` (default) \| `itemOnly`               |
| `paid_by`   | uuid   | required — ผู้จ่ายจริง (มีสิทธิ์จดจาก user อื่นได้)            |
| `split_data`| object | same rules as `split_data` ด้านบน (`equal`/`percent`/`item`/`amount`) |

```json
{ "title": "Dinner", "amount": 1177, "paid_by": "<uid-A>",
  "split_data": { "method": "percent", "shares": { "<uid-A>": 60, "<uid-B>": 40 } } }
```
→ `200` `{ "members": { "<uid-A>": { "total": 706.2, "sc": 70.62, "vat": 49.43 }, "<uid-B>": {...} }, "total": 1177 }`

- วิธีไม่ถูกต้อง / percent รวม ≠ 100 / item รวม ≠ subtotal / amount รวม ≠ ยอดรวม → `400`

---

## Test cases (manual)

Preconditions: run `backend/sql/create_group_tables.sql` and `backend/sql/add_token_version.sql` in Supabase first; server up via `cd backend && npm run dev`.

### Setup
- [ ] Register a user (A) via the stateless flow below → get JWT token A.
- [ ] Register a second user (B) the same way → record its `user.id` (needed for member tests).
- [ ] Put token A in `@authToken` of `backend/api-tests.http`.

### Auth
| # | Case | Expected |
|---|------|----------|
| 1 | `POST /auth/register/request-otp` with `{name,email,password}` | `200` + `registration_token`; OTP emailed (console fallback) |
| 2 | `POST /auth/register/verify-otp` with correct OTP | `200`, returns token |
| 3 | `POST /auth/login` with correct credentials | `200`, returns token |
| 4 | `POST /auth/login` wrong password | `400` "อีเมลหรือรหัสผ่านไม่ถูกต้อง" |
| 5 | `POST /auth/register/request-otp` existing email | `409` (email already used) |
| 6 | `POST /auth/register/verify-otp` wrong/expired OTP | `401`/`400` error |

### Registration + password reset (stateless flow, OTP ทางอีเมล)
| # | Case | Expected |
|---|------|----------|
| A1 | `POST /auth/register/request-otp` valid `{email,password,name}` | `200` + `registration_token`; OTP emailed (console fallback) |
| A2 | same request twice within 60 s | `429` + `retry_after` |
| A3 | `request-otp` with existing email | `409` "อีเมลนี้ถูกลงทะเบียนแล้ว" |
| A4 | `request-otp` with malformed email / short password | `400` |
| A5 | `POST /auth/register/verify-otp` correct OTP | `200`, creates user (already verified), returns JWT with `ver:0` |
| A6 | `verify-otp` wrong OTP ×5 | `401` with `attempts_remaining` 4→0, then `429` (token blocked) |
| A7 | `POST /auth/register/resend-otp` with valid token | `200` new `registration_token` (respects 60 s cooldown) |
| A8 | any flow endpoint with tampered/expired/forged token | `401` |
| A9 | `POST /auth/reset-password/request-otp` unknown email | `404` |
| A10 | `request-otp` known email | `200` + `password_reset_token`; OTP emailed (console fallback) |
| A11 | `POST /auth/reset-password/verify-otp` correct OTP | `200` + `reset_verified_token` (4 min) |
| A12 | `POST /auth/reset-password/confirm` weak password | `400` |
| A13 | `confirm` valid | `200`; old access token now `401` on any protected route (force logout); `confirm` reuse of same token → `401` |
| A14 | `POST /auth/login` with `{email, password}` of the reset account | `200` returns token with new `ver` |
| A15 | protected route with a flow token (e.g. `registration_token`) as Bearer | `401` |

### Personal — budgets
| # | Case | Expected |
|---|------|----------|
| 7 | `POST /personal/budgets` `{monthly_limit, month, year, category_id:null}` | upsert global budget; `200` |
| 8 | `POST /personal/budgets` with same month/year/category again | updates `monthly_limit`, no duplicate row |
| 9 | `POST /personal/budgets` missing `monthly_limit`/`month`/`year` | `400` |
| 10 | `GET /personal/budgets?month=9&year=2026` | filtered list |
| 11 | `PUT /personal/budgets/:id` `{monthly_limit:6500, category_id:5}` | both fields update |
| 12 | `PUT /personal/budgets/:id` `{category_id:null}` | clears to global budget |
| 13 | `PUT /personal/budgets/:id` empty body | `400` (needs at least one field) |
| 14 | `DELETE /personal/budgets/:id` | `200` removed |

### Personal — transactions
| # | Case | Expected |
|---|------|----------|
| 15 | `POST /personal/transactions` `{title, amount, type, category_id, date}` | `200`, persisted |
| 16 | Any request with missing/invalid token | `401` |
| 17 | `GET /personal/transactions?month=9&year=2026&type=expense` | filtered list newest first |
| 18 | `PUT /personal/transactions/:id` | `200` updated |
| 19 | `DELETE /personal/transactions/:id` | `200` removed |
| 20 | `POST /personal/transactions/scan-receipt` (multipart `receipt` = `starbucks__total-5.50.png`) | `merchant:"starbucks"`, `total:5.5`; **no DB write** |
| 21 | `POST /personal/transactions/scan-receipt` filename without pattern | fallback data (`comico`, `285`) |

### Groups
| # | Case | Expected |
|---|------|----------|
| 22 | `POST /groups/create` valid `{name, category:"Trip"}` | `200`, returns `group.id`; owner auto-added as member (`members_count:1`) |
| 23 | `POST /groups/create` empty/whitespace `name` | `400` "กรุณาระบุชื่อกลุ่ม" |
| 24 | `POST /groups/create` with `category` Trip/Food/Event/General | correct icon + color mapping |
| 25 | `GET /groups/my` | groups you created **or joined**, with `members` + `bills` |
| 26 | `GET /groups/:id/transactions` with none | `transactions: []` |
| 27 | `POST /groups/:id/transactions` missing `title` or `amount` | `400` |
| 28 | `POST /groups/:id/transactions` valid body | `200`; appears in `GET /groups/:id/transactions` (newest first) |
| 29 | `POST /groups/:id/transactions` `{amount:1000, sc_rate:10, vat_rate:7}` | `subtotal:1000`, `sc_amount:100`, `vat_amount:77`, `amount:1177` |
| 30 | same + `vat_base:"itemOnly"` | `vat_amount:70`, `amount:1170` |
| 31 | `POST /groups/:id/transactions` `sc_rate:500` | `400` "อัตรา SC/VAT ต้องไม่เกิน 100" |
| 32 | `POST /groups/:id/transactions` `type:"income"` | `groups.total_spend` **ลด**ลง |
| 33 | `POST /groups/:id/transactions` multipart + `split_data` as JSON string | stored as a real object, not a string |
| 34 | `POST /groups/:id/transactions` with `paid_by` = other member's uuid | `200` persists as-is |
| 35 | `POST /groups/:id/slips` multipart `slip` = png | `200` `{ slip_url: "/uploads/slips/<uuid>.png" }`; `GET` that URL → `200 image/*` |
| 36 | `POST /groups/:id/slips` with a `.html` file | `400` "รองรับเฉพาะไฟล์รูปภาพ" |
| 37 | `POST /groups/:id/slips` with no file | `400` "กรุณาแนบไฟล์รูปสลิป" |
| 38 | `POST /groups/:id/transactions` as a **non-member** | `403` "คุณไม่ได้เป็นสมาชิกของกลุ่มนี้" |
| 39 | `GET /groups/:id/transactions` as a **non-member** | `403` |
| 40 | `POST /groups/:id/members` missing `user_id` | `400` "กรุณาระบุ user_id ของสมาชิก" |
| 41 | `POST /groups/:id/members` valid user B | `200`; `members_count` increments (1→2) |
| 42 | `POST /groups/:id/members` same member twice | `400` "ผู้ใช้นี้เป็นสมาชิกกลุ่มอยู่แล้ว" |
| 43 | `GET /groups/:id/members` | members list incl. owner after create |
| 44 | `DELETE /groups/:id` as **non-owner** | `404` "ไม่พบกลุ่มหรือคุณไม่มีสิทธิ์ลบกลุ่มนี้" |
| 45 | `DELETE /groups/:id` as owner | `200`; members + transactions of that group removed |
| 46 | All group routes with no/invalid token | `401` |
| 47 | `POST /groups/:id/transactions` `{split_data:{method:"percent",shares:{A:70,B:30}}, paid_by:A}` | `200`; `GET /groups/:id/settlement` shows B = −amount×30% |
| 48 | `POST /groups/:id/transactions` `{method:"item", items:[{price,sharedBy:[...]}]}` where Σ items ≠ `subtotal` | `400` "รวมราคา items ... ไม่เท่ากับยอด subtotal" |
| 49 | `POST /groups/:id/transactions` `{method:"amount", amounts:{A:100,B:100}}` where Σ ≠ `amount` | `400` |
| 50 | `POST /groups/:id/transactions` `{method:"equal", memberIds:[non-member uuid]}` | `400` (member outside group) |
| 51 | `POST /groups/:id/transactions` `{method:"magic"}` | `400` "ไม่รู้จักวิธีแจกบิล" |
| 52 | `GET /groups/:id/settlement` with bills from cases 34 + 47 | `balances` sum to `0`; `transactions` shortest transfer list; `skipped` lists broken bills |
| 53 | `POST /bill-split/split` percent `{amount:1177, paid_by:A, shares:{A:60,B:40}}` | `200`; A total `706.2`, B `470.8`; NOT persisted |
| 54 | `POST /bill-split/split` `{amount:500, shares:{A:30,B:50}}` (sum≠100) | `400`

### Known gaps (test accordingly / not yet implemented)
- `GET /groups/my` includes groups the user **joined** (via `group_members`), not only ones they created.
- `POST /groups/:id/members` has **no owner/member authorization** — any logged-in user can add anyone to any group.
  (`/:id/transactions` and `/:id/slips` **are** member-only.)
- `POST /:id/transactions` updates `groups.total_spend`/`amount`, but the read-modify-write is not
  atomic — two bills added at the exact same moment can race and lose one update.
- `split-bill` and `preview` under `/api/v1/bill-split` only **compute**; they never persist
  anything. Persisted group bills go through `POST /groups/:id/transactions`.
- Uploads are stored on the API server's local disk (`backend/uploads/slips/`) — they are lost on
  redeploy and are not shared across instances. Move to Supabase Storage for production.
- The frontend has no UI yet for entering SC/VAT or attaching a slip to a group bill
  (`add-group-expense.js`) — the API supports both, the screen does not send them
  (it now does send the 4 split methods via `split_data`).

---

- Success: `{ "success": true, ...data }`
- Error: `{ "success": false, "error": "<message>" }` with HTTP `4xx`/`5xx`
- Missing/invalid token: `401`