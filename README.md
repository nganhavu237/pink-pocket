# Toki

A simple expense tracker and daily planner with secure accounts, transaction tracking,
monthly budgets, and clear financial summaries. Built for local testing with native
PostgreSQL on macOS; Docker is not required.

## Features

- Registration, login, logout, and protected pages.
- Income/expense CRUD with default categories, optional descriptions, and dates.
- Month, category, and type filters; description search and pagination.
- Monthly repeats with month-end handling, catch-up, and edit/stop controls in Transactions.
- One overall budget per month, remaining amount, usage, and overspending alerts.
- Dashboard with all-time balance, monthly totals, previous-month expense comparison, recent transactions, and category spending.
- Private My Space photo widget below Budget Progress, with upload/replace/remove controls.
- Six-month income/expense charts and category breakdowns.
- Account name/email, starting balance, VND and custom 3-letter display currency settings.
- Custom income/expense categories with safe rename/delete controls.
- Responsive pink/white interface with loading, error, and empty states.
- Planner checklist with optional due dates/times, completion, editing, and deletion.

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

| Variable           | Purpose                                                                       |
| ------------------ | ----------------------------------------------------------------------------- |
| `DATABASE_URL`     | PostgreSQL URL; development DB `pink_pocket`, test DB `pink_pocket_test`      |
| `JWT_SECRET`       | Random signing secret, at least 32 characters (`openssl rand -hex 48`)        |
| `FRONTEND_ORIGINS` | Comma-separated exact browser origins; local examples include ports 5173/5174 |
| `HOST`, `PORT`     | API listener; defaults `127.0.0.1`, `3001`                                    |
| `NODE_ENV`         | `development`, `test`, or `production`                                        |

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

| Method      | Endpoint                                | Purpose                                                   |
| ----------- | --------------------------------------- | --------------------------------------------------------- |
| GET         | `/api/health`                           | Database readiness                                        |
| POST        | `/api/auth/register`, `/api/auth/login` | Start session                                             |
| GET         | `/api/auth/me`                          | Current user and CSRF token                               |
| POST        | `/api/auth/logout`                      | Revoke session                                            |
| GET, POST   | `/api/categories`                       | List categories or create an owned custom category        |
| PUT, DELETE | `/api/categories/:id`                   | Rename or safely delete a custom category                 |
| GET, POST   | `/api/tasks`                            | List or create Planner tasks                              |
| PUT, DELETE | `/api/tasks/:id`                        | Update task fields/completion or delete                   |
| GET, POST   | `/api/transactions`                     | List or create (`recurring: true` enables monthly repeat) |
| GET         | `/api/recurring`                        | Active monthly repeats                                    |
| PUT, DELETE | `/api/recurring/:id`                    | Update future schedule or stop it                         |
| PUT, DELETE | `/api/transactions/:id`                 | Update or delete                                          |
| GET, PUT    | `/api/budgets`                          | Read or upsert monthly budget                             |
| GET         | `/api/dashboard/summary`                | Balance, totals, budget, recent records, breakdown        |
| GET         | `/api/analytics`                        | Six monthly income/expense totals                         |
| PUT         | `/api/settings`                         | Update account/display currency                           |

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
- Current balance is starting balance + all recorded income − all recorded expenses.
  Starting balance is not an income transaction and never enters income analytics.
  Other dashboard figures use the selected month.
- Schema updates use additive migrations; no database reset is part of setup.

## Scope and limitations

Ready for local testing; public hosting has not been deployed or verified. For
hosting, serve frontend and API under one HTTPS origin, forward `/api` to Express,
and rewrite application routes to `index.html`. `npm start` runs the built API;
Vite preview is for local build inspection.

Currency changes are display preferences and do not convert amounts. Password
reset, email verification, account deletion, and bank connections are outside this
version.
The local authentication limiter is in memory and should be shared across instances
before scaling. Homebrew's local trust authentication is
for development; use least-privilege credentials and appropriate database access
controls before hosting.

No changes are committed or pushed automatically.

## Verification results

Verified locally with native PostgreSQL:

- Frontend and backend production builds pass.
- Source and test TypeScript checks pass; frontend ESLint and Prettier checks pass.
- 17 isolated API/environment tests and 128 PostgreSQL/API integration tests pass.
- Desktop and mobile Chrome workflows pass: registration, route protection,
  transaction CRUD, budget progress, dashboard/chart values, settings, logout,
  session persistence, and login errors. Additional desktop/mobile workflows cover
  repeat editing/stopping, starting-balance persistence, and month comparisons.
  Captured layouts were visually reviewed.
- Live website/API proxy and database health checks pass; logged-out session access
  correctly returns 401. All six migrations are applied without resetting data.

The frontend dependency installation still reports 10 moderate advisories through
development tooling inherited from the initial ESLint setup. No forced package
upgrades or downgrades were applied. Browser coverage currently uses Chromium;
Safari and Firefox have not been verified.

## Monthly repeats and balances

Check **Repeat monthly** when adding or editing a transaction. Edit a repeating
entry to update that entry and future repeats; other historical entries are kept.
Uncheck it to stop the schedule. The **Monthly repeats** section on Transactions
also supports editing future repeats or stopping a schedule, even if its original
transaction was deleted. Deleting an individual transaction does not stop its rule.

The first selected date is recorded immediately, like any transaction; subsequent
occurrences are generated only when their UTC date is due. A rule for the 31st
uses February's last day and returns to the 31st in March. Editing an unchanged
clipped date preserves its original anchor. A stopped repeat does not backfill
its inactive period when re-enabled; it resumes on its next scheduled day.

While the backend is running, a worker checks at startup and every minute without
requiring an open browser. Missed months are caught up after downtime; financial
API reads also catch up the current user's schedules before returning. Very old
backlogs are processed in bounded batches (50 rules, 120 months per rule per pass).
The Mac cannot create entries while powered off; they are generated on resumption.
Keep `npm run dev` (or the built API) running for unattended processing.

For an independent scheduled invocation, run from `server/`:

```bash
npm run recurring:process
```

An OS scheduler can invoke that command without a browser. Do not run migrations
or reset the database as part of a scheduler. Concurrent workers are safe: schedule
row locks, a persistent rule/month occurrence ledger, and transaction uniqueness
prevent duplicate generation. Deleting a transaction retains its occurrence marker.
Stopping or editing a schedule uses the same locks as generation.

The expense comparison uses the selected month's actual expenses against the
preceding calendar month (including year boundaries). A zero previous total shows
**No previous data**; equal totals show **Same as last month**. Percentages use
Decimal calculations, rounded to two decimal places.

**Starting Balance** in Settings accepts a signed two-decimal amount, defaults to
zero, and can be changed later. Clearing the field resets it to zero. It affects
only the all-time balance, not income, expense, budget, or category totals.

## Planner

Open **Planner** in the sidebar. **Add Task** opens a short inline form: task name
is required, and due date/time are optional. Check a task to complete it or uncheck
to reopen it. Incomplete tasks appear first, followed by completed tasks; within
each group, dated tasks are ordered by date/time and undated tasks follow.

Tasks are persisted in PostgreSQL and scoped to the signed-in user for every
read/write. The task API uses the existing session, Origin, and CSRF protections.
Due dates are stored as date-only values; due times are local wall-clock `HH:mm`
values, so they display as entered without timezone shifts. A time can be supplied
without a date. This is a checklist, without notifications or reminders.

The Planner migration only adds a new table/index/constraints; existing financial
data is not changed. Browser tests cover creation, completion order, editing,
clearing optional fields, deletion, refresh, and logout/login persistence on
desktop and mobile. Completion animations respect reduced-motion preferences.

## Currencies and custom categories

Settings offers USD, EUR, GBP, CAD, AUD, VND and **Other / Custom Currency**. Enter
an ISO 4217 code (for example JPY or CHF); codes are uppercased and validated
against Node's `Intl.supportedValuesOf('currency')` list. The account stores the
selected code. Amounts keep their existing values and two-decimal precision;
there are no exchange-rate calculations or automatic conversions.

In Add/Edit Transaction, choose **+ Add Category** from the Category dropdown.
The short inline form creates a category for the current income/expense type and
selects it without clearing the transaction draft. Rename/delete custom categories
in Settings. Names are unique per user and type, ignoring case. Default categories
remain read-only. A custom category with transactions or monthly repeats cannot be
deleted; rename it instead so financial history and schedules remain intact.

New accounts receive Salary as their sole default income category. The migration
retires existing Other Income categories from new transaction choices without
deleting their IDs, transactions, or schedules. Existing entries using them remain
viewable, filterable, and editable. They are hidden from Settings category controls
and new selections; all expense defaults remain available.

## My Space photo

Overview includes a personal photo card below Budget Progress. Select the upload
placeholder to choose a photo; the pencil icon replaces it and the trash icon
removes it. The photo is saved to the account and persists across refresh/login.

Accepted inputs are still JPEG, PNG, and WebP, up to **5 MB** and **20 megapixels**.
The backend verifies file signatures and fully decodes the image, applies its
orientation, resizes it within 1600 × 1600 without enlargement, and re-encodes it
as WebP without embedded metadata. Invalid uploads leave the previous photo intact.
Sharp is used only on the backend; there is no new frontend dependency.

One image per user is stored in PostgreSQL. Metadata, image reads, replacement,
and removal use authenticated owner-scoped endpoints; no public file directory or
user-supplied file path exists. Image responses are private/no-store and marked
nosniff/same-origin. Upload/removal use the existing Origin and CSRF protection.
Uploads are limited to 20 per IP per 15 minutes. Include the database in backups
if personal photos should be retained when moving the local setup.

| Method | Endpoint              | Purpose                                             |
| ------ | --------------------- | --------------------------------------------------- |
| GET    | `/api/my-space`       | Current photo metadata or null                      |
| GET    | `/api/my-space/photo` | Private WebP image, or 404                          |
| PUT    | `/api/my-space/photo` | Raw JPEG/PNG/WebP bytes, with matching Content-Type |
| DELETE | `/api/my-space/photo` | Remove the current user's photo                     |

The additive migration creates a separate MySpacePhoto table without changing
financial records. The photo widget respects reduced-motion preferences.
