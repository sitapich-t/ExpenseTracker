# AGENTS.md

## Repo layout
Two independent subprojects; there is no root `package.json`, so run all commands from the subproject directory:
- `backend/` — Express 5 REST API (CommonJS), entrypoint is `server.js` (ignore `main: "index.js"` in package.json — no such file exists)
- `frontend/` — Expo SDK 57 / React Native app with expo-router; screens live in `src/app/`, alias `@/*` → `src/*`

## Commands
Backend (`cd backend`):
- `npm run dev` — nodemon hot-reload (default port 3000)
- `npm test` — placeholder stub that exits 1; real tests live in `tests/` but Jest is **not** installed (add it to run them)
- Requires `backend/.env` (gitignored): `SUPABASE_URL`, `SUPABASE_KEY`, `MAILTRAP_*`; missing Supabase vars log a startup error
- `TZ` is forced to `Asia/Bangkok` in `server.js`, so run with cwd = `backend/` or dotenv won't find `.env`

Frontend (`cd frontend`):
- `npm start` / `npm run android` / `npm run web`
- `npm run lint` — `expo lint`; ESLint config now exists. Baseline: 0 errors, 7 pre-existing `react-hooks/exhaustive-deps` / `no-unused-vars` / `import/no-named-as-default-member` warnings
- Do not write Expo code without checking https://docs.expo.dev/versions/v57.0.0/ (see `frontend/AGENTS.md`)

## Gotchas & conventions
- UI strings and code comments are in Thai throughout
- Frontend API base defaults to `http://10.0.2.2:3000` (Android Emulator), overridable at runtime via `global.__API_URL__` (all screens use it). `src/lib/api.js` stores the token under AsyncStorage key `userToken`; auth screens also store it under key `token` — prefer the `lib/api.js` helpers
- Backend domains: `/api/v1/personal/*` (budgets + transactions incl. `POST /personal/transactions/scan-receipt`, which uses real OCR via `tesseract.js` in `services/ocrService.js` and returns `vat` / `serviceCharge` / `netAmount` / `items`), `/api/v1/groups/*` (groups, members, transactions) and `/api/v1/bill-split/*` (all three routes are JWT-protected via `authenticate`)
- Group settlement math lives in `utils/` and is dependency-ordered: `allocationUtils` (`distributeSCVAT`, `allocateToMembers`) → `balanceCalculator` (net balance per person) → `debtSimplifier` (`simplifyDebts`, fixes satang residual so sums land exactly on 0). `services/billSplitService.js` composes all three and is what the group screens call.
- `group_members` has no display-name column, so the frontend derives labels from `user_id`; group transactions do not persist per-member shares, so settlement currently splits equally across all members
- There is no backend profile-update endpoint; `src/app/edit-profile.js` persists to AsyncStorage only
- Registration requires email OTP (10-min expiry) before login; `JWT_SECRET` falls back to a hardcoded dev secret
- Server enforces `TZ=Asia/Bangkok`; `.vscode/settings.json` organizes imports and sorts members on save