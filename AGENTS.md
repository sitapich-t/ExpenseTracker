# AGENTS.md

## Repo layout
Two independent subprojects; there is no root `package.json`, so run all commands from the subproject directory:
- `backend/` — Express 5 REST API (CommonJS), entrypoint is `server.js` (ignore `main: "index.js"` in package.json — no such file exists)
- `frontend/` — Expo SDK 57 / React Native app with expo-router; screens live in `src/app/`, alias `@/*` → `src/*`

## Commands
Backend (`cd backend`):
- `npm run dev` — nodemon hot-reload (default port 3000)
- `npm test` — placeholder stub, no tests exist anywhere in the repo
- Requires `backend/.env` (gitignored): `SUPABASE_URL`, `SUPABASE_KEY`, `MAILTRAP_*`; missing Supabase vars log a startup error

Frontend (`cd frontend`):
- `npm start` / `npm run android` / `npm run web`
- `npm run lint` — `expo lint`; no ESLint config exists yet (first run scaffolds one)
- Do not write Expo code without checking https://docs.expo.dev/versions/v57.0.0/ (see `frontend/AGENTS.md`)

## Gotchas & conventions
- UI strings and code comments are in Thai throughout
- Frontend API base defaults to `http://192.168.1.45:3000`, overridden at runtime via `global.__API_URL__` (all screens use it). `src/lib/api.js` stores the token under AsyncStorage key `userToken`; auth screens also store it under key `token` — prefer the `lib/api.js` helpers
- Backend domains: `/api/v1/personal/*` (budgets + transactions incl. `POST /personal/transactions/scan-receipt`, a mock OCR that parses merchant/amount from the uploaded filename — no real OCR, see `services/ocrService.js`). `/api/v1/groups/*` is the upcoming group feature: `groups`, `group_transactions`, `group_members` tables assumed
- Registration requires email OTP (10-min expiry) before login; `JWT_SECRET` falls back to a hardcoded dev secret
- Server enforces `TZ=Asia/Bangkok`; `.vscode/settings.json` organizes imports and sorts members on save