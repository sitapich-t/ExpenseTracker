# Student Wallet — Design Document

This document explains **why** the system is designed the way it is. For endpoint/reference details see `API.md`; for repo conventions see `AGENTS.md`.

---

## 1. Overview

Two independent subprojects sharing no build tooling:

- `backend/` — Express 5 REST API (CommonJS, entrypoint `server.js`), thin controllers over a Supabase client.
- `frontend/` — Expo SDK 57 / React Native app (expo-router), screens in `src/app/`.

Core idea: **feature-versioned REST** (`/api/v1/{auth,personal,groups}`), **custom auth** (own `users` table + OTP + own JWT), and **app-level data scoping** (every query filtered by user id) instead of Supabase RLS.

```
Mobile App ──(JWT Bearer)──> Express (/api/v1/*) ──> Supabase PostgREST
Brüno/REST Client ──────────────────────┘
```

---

## 2. Project layout

Why two independent subprojects, no root `package.json`?

- **Dependency isolation.** Expo/Metro tooling and Express/node_modules are incompatible; installing both in one tree causes collisions and slow installs.
- **Independent deploys.** Either side can be replaced/deleted without touching the other.
- **Independent workflows.** Backend = `cd backend && npm run dev`; frontend = `cd frontend && npm start`.

The frontend reaches the backend at runtime through `global.__API_URL__` (default `http://192.168.1.45:3000`), because the same JS bundle must hit `localhost` (emulator) or a LAN IP (physical phone) interchangeably.

---

## 3. API design

### Versioned domain prefixes: `/api/v1/{auth,personal,groups}`

- **Versioning** (`/v1`): a stable contract; future breaking changes move to `/v2` without breaking installed clients.
- **Domain grouping**: mirrors product areas (auth → personal → groups) rather than DB tables, so app screens and test files map 1:1 to a feature.

### Response envelope

- Success: `{ "success": true, ...data }`
- Error: `{ "success": false, "error": "<message>" }` with `4xx`/`5xx`
- Missing/invalid token: `401`

A consistent envelope means the frontend can treat every response the same (`if (!res.data.success) throw`).

### Public vs protected

Auth is applied **per-route** via `authenticate` middleware, never globally — so a glance at the routes file shows exactly which endpoints are public (`register`, `login`, `verify-otp`, `scan-receipt`) and which require a JWT.

---

## 4. Layering: routes → middleware → controllers → services

### Routes (`routes/*.js`)
Declarative tables: `method + path + middleware + handler`. They don't contain logic; they make the surface area inspectable and let middleware be attached selectively.

### Middleware (`middlewares/authMiddleware.js`)
The only cross-cutting concern so far: reads `Authorization: Bearer <token>`, verifies the JWT, sets `req.user` (the decoded payload `{id, email, name}`), or short-circuits with `401`.

### Controllers (`controllers/*.js`)
Request-level concern only:
1. validate input
2. call Supabase (scoped by user id)
3. shape the JSON

No math, no parsing conventions, no frontend-compat shims — those live in services.

### Services (`services/*.js`)
Pure, unit-testable logic, independent of Express and Supabase:
- `transactionService` — `normalizeTitle`, `parseAmount`, `parseCategoryId`, `resolveDate`.
- `ocrService` — filename → `{merchant, total}`.

**Why services exist:** the frontend has historically sent inconsistent fields (e.g. `date` vs `transaction_date`). Centralizing parsing means one fix corrects every caller, and the functions test without a database.

---

## 5. Auth design (the main decision)

### Custom auth, not Supabase Auth

- `users` table owned by the app: `id (uuid)`, `email`, `password_hash (bcrypt, cost 10)`, `name`, `is_verified`, `otp_code`, `otp_expires_at`.
- Registration requires **email OTP** (6 digits, 10-minute expiry) before the account can log in.
- Login issues a **stateless JWT** (`expiresIn: '30d'`, payload `{id, email, name}`); the client stores it in AsyncStorage and sends it as `Authorization: Bearer`.

### Why

- **Full control of the required flow**: OTP expiry window, `is_verified` gating before login, camelCase API surface.
- **Simple mental model** for a student/dev project — no Supabase Auth wiring, no refresh-token machinery.

### Consequence

Supabase RLS keyed on `auth.uid()` reads *Supabase Auth* tokens — not ours — so `auth.uid()` can never match the app's `user_id` (which is the `users.id` uuid). Therefore:

- **Security moved into controllers**: every query is scoped with `.eq('user_id', userId)`.
- **RLS is effectively disabled/irrelevant** for this project (see `backend/sql/create_group_tables.sql` header for the commented-out RLS rationale).

> Tradeoff: fine for dev/student scale. A production app would adopt Supabase Auth for row-level security and social logins.

---

## 6. Data access

- **Supabase-js as a server-side client only.** Controllers call PostgREST directly (`select`, `eq`, `insert`, `maybeSingle`…). No ORM, no schema migrations in the repo (DDL lives in `backend/sql/`).
- **Constraints live in app code** because PostgREST gives no easy per-row rules under custom auth. Examples:
  - `setBudget` is an **upsert**: one budget per `(user_id, month, year, category_id-or-null)` so repeated saves never duplicate rows. `category_id: null` is the sentinel for a global budget.
  - `updateBudget` does a **partial patch**: only fields present in the body are written (`monthly_limit`, `category_id`), so UI edits don't wipe unsent fields; `category_id: null` clears back to global.
  - Group member uniqueness is a DDL `unique(group_id, user_id)` constraint.
- **Server timezone pinned**: `TZ=Asia/Bangkok` before app start so `month/year` date windows are consistent for all users/callers.

---

## 7. Pragmatic dev-mode tradeoffs

Deliberate degradations to keep development unblocked:

- **Mock OCR from filename** (`ocrService`): no ML dependency, deterministic results, and it exercises the real scan → confirm → submit UX. Swapping in real OCR later touches only the service, not routes or screens.
  - `scan-receipt` is intentionally **public**: it reads no user data and writes nothing to the DB (multer only saves the upload under `backend/uploads/`).
- **OTP console fallback**: Mailtrap demo-sender domains only send to the account owner; on send failure the OTP is logged to the server console so registration still succeeds in local dev (`authController.sendOtpEmail`).
- **Hardcoded dev `JWT_SECRET`** fallback: accepted for local development, same spirit as the OTP console fallback.
- **Featured-out group feature**: partial implementation driven by UI mockups — `create-group` claims "Invite via QR / Link" but no join-by-code exists yet; the owner is now auto-added to `group_members` on create (recent fix) so members/count stay consistent.

---

## 8. Frontend conventions

- **API base**: `global.__API_URL__ || 'http://192.168.1.45:3000'` + `/api/v1` on every screen.
- **Token**: AsyncStorage keys — prefer `src/lib/api.js` helpers (canonical); legacy screens may store `token`.
- **expo-router**: file paths mirror API domains (`(main)/dashboard.js`, `scan-receipt.js`, `create-group.js`, …).
- Comments and UI strings are **Thai** throughout, matching the target users; mirrors the backend's Thai error messages.

---

## 9. Known design debt (gaps)

Current state of the group feature, flagged for future work:

1. `POST /groups/:id/members` has **no owner/member authorization** — any logged-in user can add anyone to any group.
2. `GET /groups/my` returns only groups the user **created** — groups they only joined (via `group_members`) are invisible on the list.
3. Group transactions do **not** recompute `groups.total_spend` / `amount`.
4. No invite-code / QR join endpoint (`/groups/join`) — the frontend UI implies one.
5. No `group-detail` screen in the frontend (`create-group.js` and `group-split.js` navigate to `/group-detail`, which doesn't exist).
6. Custom auth prevents Supabase RLS; if a future requirement needs per-row DB security, adopting Supabase Auth is the path.

---

## 10. Decision map (quick reference)

| Decision | Location | Reason |
|---|---|---|
| Two subprojects | repo root | dependency/toolchain isolation |
| `/api/v1/<domain>` | `server.js` mounts | versionable, feature-grouped contract |
| Route-level auth | `routes/*.js` | visibility of public vs protected |
| Custom JWT + OTP | `authController.js` | control of registration flow; simple model |
| Security in controllers | all controllers | custom auth ⇒ no RLS |
| Services for parsing | `transactionService` | single source of truth; unit-testable |
| Budget upsert/partial patch | `personalController` | avoid duplicate rows / wiping fields |
| Mock OCR by filename | `ocrService` | deterministic, swappable, no ML |
| OTP console fallback | `authController` | Mailtrap demo-domain restriction |
| `TZ=Asia/Bangkok` | `server.js` | consistent date windows |
| `global.__API_URL__` | frontend | emulator vs physical device at runtime |