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

## Groups — `/api/v1/groups` (JWT required, feature in progress)

| Method | Path                  | Description                  |
|--------|-----------------------|------------------------------|
| GET    | `/my`                 | List my groups               |
| POST   | `/create`             | Create a group               |
| DELETE | `/:id`                | Delete group (owner only; also removes members/transactions) |
| GET    | `/:id/transactions`   | Group transactions           |
| POST   | `/:id/transactions`   | Create group transaction     |
| GET    | `/:id/members`        | List members                 |
| POST   | `/:id/members`        | Add a member                 |

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
| 25 | `GET /groups/my` | only groups you created, newest first |
| 26 | `GET /groups/:id/transactions` with none | `transactions: []` |
| 27 | `POST /groups/:id/transactions` missing `title` or `amount` | `400` |
| 28 | `POST /groups/:id/transactions` valid body | `200`; then appears in `GET /groups/:id/transactions` (newest first) |
| 29 | `POST /groups/:id/transactions` with `type:"income"` and `paid_by` = other member's uuid | `200` persists as-is |
| 30 | `POST /groups/:id/members` missing `user_id` | `400` "กรุณาระบุ user_id ของสมาชิก" |
| 31 | `POST /groups/:id/members` valid user B | `200`; `members_count` increments (1→2) |
| 32 | `POST /groups/:id/members` same member twice | `400` "ผู้ใช้นี้เป็นสมาชิกกลุ่มอยู่แล้ว" |
| 33 | `GET /groups/:id/members` | members list incl. owner after create |
| 34 | `DELETE /groups/:id` as **non-owner** | `404` "ไม่พบกลุ่มหรือคุณไม่มีสิทธิ์ลบกลุ่มนี้" |
| 35 | `DELETE /groups/:id` as owner | `200`; members + transactions of that group removed |
| 36 | All 6 group routes with no token | `401` |

### Known gaps (test accordingly / not yet implemented)
- `GET /groups/my` does **not** include groups the user only joined (via `group_members`) — only `created_by`.
- `POST /groups/:id/members` has **no owner/member authorization** — any logged-in user can add anyone to any group.
- Group transactions do **not** update `groups.total_spend` / `amount`.
- Join via invite code / QR does not exist yet; frontend `group-detail` screen is missing (`create-group.js` navigates to it).

---

- Success: `{ "success": true, ...data }`
- Error: `{ "success": false, "error": "<message>" }` with HTTP `4xx`/`5xx`
- Missing/invalid token: `401`