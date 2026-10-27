# AGENTS.md

## Repo layout
Two independent subprojects; there is no root `package.json`, so run all commands from the subproject directory:
- `backend/` — Express 5 REST API (CommonJS), entrypoint is `server.js` (ignore `main: "index.js"` in package.json — no such file exists)
- `frontend/` — Expo SDK 57 / React Native app with expo-router; screens live in `src/app/`, alias `@/*` → `src/*`

## Commands
Backend (`cd backend`):
- `npm run dev` — nodemon hot-reload (default port 3000)
- `npm test` — jest (installed); auth/security tests: `tests/{jwtUtils,memoryStore,authMiddleware,rateLimitMiddleware}.test.js`
- Requires `backend/.env` (gitignored): `SUPABASE_URL`, `SUPABASE_KEY`, `JWT_SECRET` (any of which missing → boot exits via `config/env.js`), plus `GMAIL_USER`/`GMAIL_PASS` for real OTP emails (optional; else OTP logs to console)
- `TZ` is forced to `Asia/Bangkok` in `server.js`, so run with cwd = `backend/` or dotenv won't find `.env`

Frontend (`cd frontend`):
- `npm start` / `npm run android` / `npm run web`
- `npm run lint` — `expo lint`; ESLint config now exists. Baseline: 0 errors, 15 pre-existing `react-hooks/exhaustive-deps` / `no-unused-vars` / `import/no-named-as-default-member` warnings
- Do not write Expo code without checking https://docs.expo.dev/versions/v57.0.0/ (see `frontend/AGENTS.md`)

## Gotchas & conventions
- UI strings and code comments are in Thai throughout
- Frontend API base defaults to `http://10.0.2.2:3000` (Android Emulator), overridable at runtime via `global.__API_URL__` (all screens use it). `src/lib/api.js` stores the token under AsyncStorage key `userToken`; auth screens also store it under key `token` — prefer the `lib/api.js` helpers
- Backend domains: `/api/v1/personal/*` (budgets + transactions incl. `POST /personal/transactions/scan-receipt`, which uses real OCR via `tesseract.js` in `services/ocrService.js` and returns `vat` / `serviceCharge` / `netAmount` / `items`), `/api/v1/groups/*` (groups, members, transactions; group slip upload `POST /groups/:id/slips` and multipart `POST /groups/:id/transactions` also run the same OCR and return the reading in `ocr` — non-fatal if it fails) and `/api/v1/bill-split/*` (all three routes are JWT-protected via `authenticate`)
- Group settlement math lives in `utils/` and is dependency-ordered: `allocationUtils` (`distributeSCVAT`, `allocateToMembers`) → `balanceCalculator` (net balance per person) → `debtSimplifier` (`simplifyDebts`, fixes satang residual so sums land exactly on 0). `services/billSplitService.js` composes all three and is what the group screens call.
- `group_members` has no display-name column, so the frontend derives labels from `user_id`; group transactions do not persist per-member shares, so settlement currently splits equally across all members
- There is no backend profile-update endpoint; `src/app/edit-profile.js` persists to AsyncStorage only
- **Auth (stateless, email-only):** `POST /auth/register/{request-otp,verify-otp,resend-otp}` and `POST /auth/reset-password/{request-otp,verify-otp,confirm}` — OTP via **email** (`services/emailService.js`; dev fallback logs OTP to console). No phone/SMS anywhere. Short-lived JWTs (`registration_token` 10m, `password_reset_token` 10m, `reset_verified_token` 4m single-use) carry the bcrypt-hashed password/OTP and are held only in app memory — no pending rows in DB. Rate limiting is via the store abstraction `utils/store/` (in-memory `memoryStore` by default; `redisStore` used automatically when `REDIS_URL` is set): 60 s cooldown, 5/day per email, 10/day per IP, 5 failed OTP tries per token. Access tokens carry `ver` = `users.token_version`; password reset bumps it → force logout all devices (`authenticate` rejects flow tokens and tokens without `ver`, so pre-migration tokens die). **Requires migration `backend/sql/add_token_version.sql`** (without it every protected endpoint 500s). Legacy endpoints (`POST /register`, `/verify-otp`) are **deleted**; login is `email` + `password` only.
- `JWT_SECRET` is **required** — no hardcoded fallback; boot exits if missing (along with `SUPABASE_URL`/`SUPABASE_KEY` in `config/env.js`). Test env is set in `tests/setupEnv.js` via jest `setupFiles`. Gmail creds for OTP emails come from `.env` (`GMAIL_USER`/`GMAIL_PASS`, no source fallback); if absent, email is skipped and OTP is logged to console. CORS is whitelisted from `ALLOWED_ORIGINS` (comma-separated; default `http://localhost:5173,http://localhost:8081`).
- Supabase access lives only in `repositories/` (+ `config/supabase.js`); `server.js` uses `repositories/groupRepository.js`'s RPC-based `groups.updateSpend` to update `total_spend` atomically (**requires migration `backend/sql/update_group_spend.sql`**). OpenAPI docs: annotations in `routes/*.js` + `server.js`, spec built in `config/swagger.js`, served at `/api-docs` and `/api-docs.json`. `POST /personal/transactions/scan-receipt` is JWT-protected; `POST /groups/:id/members` allows only the owner or existing members to invite.