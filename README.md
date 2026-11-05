# Pink Pocket

A lightweight personal expense tracker with secure accounts, transaction tracking,
monthly budgets, and clear financial summaries. Built for local testing with native
PostgreSQL on macOS; Docker is not required.

## Features

- Registration, login, logout, and protected pages.
- Income/expense CRUD with default categories, optional descriptions, and dates.
- Month, category, and type filters; description search and pagination.
- One overall budget per month, remaining amount, usage, and overspending alerts.
- Dashboard with all-time balance, monthly totals, recent transactions, and category spending.
- Six-month income/expense charts and category breakdowns.
- Account name/email and preferred display currency settings.
- Responsive pink/white interface with loading, error, and empty states.

## Stack and structure

- `client/`: React, TypeScript, Vite, Tailwind CSS, React Router, Recharts, Lucide.
- `server/`: Node.js, Express, TypeScript, Prisma, PostgreSQL, Zod, bcrypt, JWT.
- Tests: Vitest, Supertest, and Playwright (desktop/mobile Chrome).

Backend routing, validation, business services, middleware, and database access
are separated under `server/src/`. Frontend components, pages, hooks, contexts,
services, and types are under `client/src/`.

## Local setup

Requires Node.js 22.12+ (Node 24 LTS recommended), npm, and PostgreSQL 17.
On the current Mac, PostgreSQL and the databases are already configured on port
**5433**. A separate existing instance on port 5432 is left untouched.

```bash
brew services start postgresql@17
cd /Users/havu/pink-pocket/server
npm ci
npm run db:generate
npm run db:deploy
npm run db:check
npm run dev
```

In another terminal:

```bash
cd /Users/havu/pink-pocket/client
npm ci
npm run dev -- --port 5174 --strictPort
```

Open **http://localhost:5174** and create an account. Backend health:
**http://127.0.0.1:3001/api/health**. There are no seeded accounts or financial data.
If a server is already running on the chosen port, use its existing terminal or
stop that project server before starting another. Do not stop unrelated services.

See [server/README.md](server/README.md) for first-time native PostgreSQL installation,
role/database creation, and troubleshooting on another Mac.

### Environment variables

Existing ignored `server/.env` and `.env.test` files were configured locally.
For a fresh checkout, copy the corresponding example files and supply your own
PostgreSQL password and random JWT secret. Do not overwrite existing configuration.

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL URL; development DB `pink_pocket`, test DB `pink_pocket_test` |
| `JWT_SECRET` | Random signing secret, at least 32 characters (`openssl rand -hex 48`) |
| `FRONTEND_ORIGINS` | Comma-separated exact browser origins; local examples include ports 5173/5174 |
| `HOST`, `PORT` | API listener; defaults `127.0.0.1`, `3001` |
| `NODE_ENV` | `development`, `test`, or `production` |

The frontend calls `/api` through Vite's proxy; no frontend secrets or environment
file are needed. Optional `API_PROXY_TARGET` changes the proxy target for isolated
tests. If you change the browser port, update `FRONTEND_ORIGINS` too.

## Testing

From `server/`:

```bash
npm run db:validate
npm run typecheck
npm run build
npm test
# Apply migrations only to the dedicated test database:
node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
npm run test:db
```

From `client/`:

```bash
npm run build
npm run lint
npm run format:check
npm run test:e2e
```

Playwright starts isolated API/frontend servers on ports 3002/5180 and uses
`server/.env.test`. It uses installed Google Chrome on macOS; without Chrome,
run `npx playwright install chromium` once. Tests refuse a database name not ending
in `_test`. API/browser test accounts use unique IDs and only their own records
are removed during cleanup. Schema tests roll back their fixtures.

## API

Successful responses use `{ "data": ... }`; errors use
`{ "error": { "code": "...", "message": "..." } }`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Database readiness |
| POST | `/api/auth/register`, `/api/auth/login` | Start session |
| GET | `/api/auth/me` | Current user and CSRF token |
| POST | `/api/auth/logout` | Revoke session |
| GET | `/api/categories` | Current user's default categories |
| GET, POST | `/api/transactions` | List or create |
| PUT, DELETE | `/api/transactions/:id` | Update or delete |
| GET, PUT | `/api/budgets` | Read or upsert monthly budget |
| GET | `/api/dashboard/summary` | Balance, totals, budget, recent records, breakdown |
| GET | `/api/analytics` | Six monthly income/expense totals |
| PUT | `/api/settings` | Update account/display currency |

Monthly endpoints accept `month` and `year`. Transaction lists additionally accept
`categoryId`, `type`, `search`, `page`, and `pageSize` (maximum 100). Supply both
month/year or neither. Amounts are positive decimal **strings** with up to two
decimal places; dates are `YYYY-MM-DD`. Types are `INCOME` or `EXPENSE`.

## Security and data conventions

- bcrypt hashes; JWT in an HttpOnly, SameSite=Lax cookie, Secure in production.
- Sessions are stored in PostgreSQL, expire after seven days, and are revoked on logout.
- Writes require an allowed Origin; authenticated writes also require the session's
  `X-CSRF-Token`. Tokens stay in memory, never localStorage.
- Authentication is rate-limited; all financial queries enforce ownership.
- Category ownership/type and monthly budget uniqueness are enforced in PostgreSQL.
- Monetary calculations use Prisma Decimal and fixed two-decimal response strings.
  Chart geometry uses numeric approximations; displayed amounts retain exact cents.
- Transaction dates are date-only; monthly API boundaries and omitted dates use UTC.
  The browser defaults forms to the user's local calendar date.
- Current balance spans all recorded dates. Other dashboard figures use the selected month.
- Schema updates use additive migrations; no database reset is part of setup.

## Scope and limitations

Ready for local testing; public hosting has not been deployed or verified. For
hosting, serve frontend and API under one HTTPS origin, forward `/api` to Express,
and rewrite application routes to `index.html`. `npm start` runs the built API;
Vite preview is for local build inspection.

Currency changes are display preferences and do not convert amounts. Categories
are the supplied defaults; custom category management, password reset, email
verification, account deletion, bank connections, and recurring transactions are
outside this version. The local authentication limiter is in memory and should be
shared across instances before scaling. Homebrew's local trust authentication is
for development; use least-privilege credentials and appropriate database access
controls before hosting.

No changes are committed or pushed automatically.

## Verification results

Verified locally with native PostgreSQL:

- Frontend and backend production builds pass.
- Source and test TypeScript checks pass; frontend ESLint and Prettier checks pass.
- 17 isolated API/environment tests and 44 PostgreSQL/API integration tests pass.
- Desktop and mobile Chrome workflows pass: registration, route protection,
  transaction CRUD, budget progress, dashboard/chart values, settings, logout,
  session persistence, and login errors. Captured layouts were visually reviewed.
- Live website/API proxy and database health checks pass; logged-out session access
  correctly returns 401. Both migrations are applied without resetting data.

The frontend dependency installation still reports 10 moderate advisories through
development tooling inherited from the initial ESLint setup. No forced package
upgrades or downgrades were applied. Browser coverage currently uses Chromium;
Safari and Firefox have not been verified.
