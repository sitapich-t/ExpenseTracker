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

| Method | Path                | Auth | Description                                                        |
|--------|---------------------|------|--------------------------------------------------------------------|
| POST   | `/register`         | –    | Create account, sends OTP email (10-min expiry)                    |
| POST   | `/login`            | –    | Login with email/password → returns JWT                            |
| POST   | `/verify-otp`       | –    | Confirm account with the emailed OTP                                |

### POST `/api/v1/auth/register`
```json
{ "name": "สมชาย", "email": "somchai@example.com", "password": "password123" }
```
→ `201` `{ "success": true, "message": "...", "email": "..." }`

> Note: Mailtrap demo-sender domains may reject sending to non-owner emails. In that case the OTP is logged to the server console (dev fallback) instead — `authController.js`.

### POST `/api/v1/auth/login`
```json
{ "email": "somchai@example.com", "password": "password123" }
```
→ `{ "success": true, "token": "<JWT>", "user": {...} }`

### POST `/api/v1/auth/verify-otp`
```json
{ "email": "somchai@example.com", "otp": "123456" }
```

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
| `split_data`| object \| string | optional — `{ memberIds: [...], method: 'equal' }`      |
| `slip_url`  | string | optional — URL จาก `POST /:id/slips`                            |
| `slip`      | file   | multipart only — รูปสลิป (jpg/png/webp/heic, สูงสุด 8 MB)       |

SC/VAT คิดเป็น **สตางค์จริง** (ไม่มีเศษจาก float) และยอดรวมจะตรงกับผลบวกเสมอ

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


---

## Test cases (manual)

Preconditions: run `backend/sql/create_group_tables.sql` in Supabase first; server up via `cd backend && npm run dev`.

### Setup
- [ ] Register a user (A) and verify OTP → get JWT token A.
- [ ] Register a second user (B), verify OTP → record its `user.id` (needed for member tests).
- [ ] Put token A in `@authToken` of `backend/api-tests.http`.

### Auth
| # | Case | Expected |
|---|------|----------|
| 1 | `POST /auth/register` with `{name,email,password}` | `201` success; OTP sent (or logged to console fallback) |
| 2 | `POST /auth/verify-otp` with correct OTP | `200`, returns token |
| 3 | `POST /auth/login` with correct credentials | `200`, returns token |
| 4 | `POST /auth/login` wrong password | `400` "อีเมลหรือรหัสผ่านไม่ถูกต้อง" |
| 5 | `POST /auth/register` existing email | `400` (email already used) |
| 6 | `POST /auth/verify-otp` wrong/expired OTP | `400` error |

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
  (`add-group-expense.js`) — the API supports both, the screen does not send them.

---

- Success: `{ "success": true, ...data }`
- Error: `{ "success": false, "error": "<message>" }` with HTTP `4xx`/`5xx`
- Missing/invalid token: `401`