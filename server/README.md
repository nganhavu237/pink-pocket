# Pink Pocket API

Express 5 + TypeScript, Prisma 7, PostgreSQL, Zod, Vitest, and Supertest.
Authentication, transaction CRUD, monthly budgets, dashboard, analytics, and account
settings are implemented. See the [project README](../README.md) for API details.

## Run locally

Requires Node.js 22.12+ (Node 24 LTS recommended), npm, and native PostgreSQL.
Docker is not required. On macOS, install and start PostgreSQL with Homebrew:

```bash
brew install postgresql@17
# On this Mac, port 5432 belongs to another installation.
# Configure the Homebrew cluster once before starting it:
printf "port = 5433\n" >> "$(brew --prefix)/var/postgresql@17/postgresql.auto.conf"
brew services start postgresql@17
export PGPORT=5433
export PATH="$(brew --prefix postgresql@17)/bin:$PATH"
```

The cluster on this Mac is already configured for port 5433; skip the one-time
configuration command above if repeating setup. Keep `PGPORT=5433` in terminal
sessions when running `psql`, `createdb`, or `createuser`.

The version is pinned to PostgreSQL 17 to match the initial schema setup. Add the
PATH export to your shell configuration if you want the PostgreSQL tools available
in future terminal sessions.

Create the local application role and databases once:

```bash
createuser --pwprompt --createdb pink_pocket
createdb --owner=pink_pocket pink_pocket
createdb --owner=pink_pocket pink_pocket_test
psql -d postgres -c "ALTER DATABASE pink_pocket SET timezone TO 'UTC'"
psql -d postgres -c "ALTER DATABASE pink_pocket_test SET timezone TO 'UTC'"
```

Choose a password at the prompt. The local development role has CREATEDB so
Prisma can create its shadow database for `migrate dev`. Production application
roles should not have that permission. These commands use your macOS user's
local PostgreSQL administrative role. Do not recreate roles/databases that already
exist. Homebrew initializes a local development cluster; its default local
connection authentication is not a production security configuration.

```bash
cd /Users/havu/pink-pocket/server
npm ci
# First-time setup only; do not overwrite existing configuration:
cp .env.example .env
```

Replace the password placeholder in `.env` with the role password. URL-encode
special characters inside DATABASE_URL. The existing local `.env` and `.env.test`
were updated to native PostgreSQL port 5433, preserving their generated password.
Environment files remain ignored by Git. Set JWT_SECRET to a random value of at
least 32 characters (`openssl rand -hex 48`). Local ignored configuration already
contains a generated signing secret.

```bash
# From server/:
npm run db:generate
npm run db:deploy
npm run db:check
npm run dev
```

PostgreSQL uses **127.0.0.1:5433**; the API uses **http://127.0.0.1:3001**.
`db:deploy` applies checked-in migrations without resetting data. For future schema
changes use `npm run db:migrate -- --name descriptive_change_name`. Never edit an
already-applied migration.

```bash
curl http://127.0.0.1:3001/api/health
```

Successful response (HTTP 200):

```json
{ "data": { "status": "ok", "database": "connected" } }
```

The health endpoint runs a real `SELECT 1`. Database failure returns HTTP 503:

```json
{
  "error": {
    "code": "DATABASE_UNAVAILABLE",
    "message": "Database is unavailable"
  }
}
```

Startup checks the database before opening the HTTP listener. SIGINT/SIGTERM
close the HTTP server and database pool. Unknown routes and request errors use
`{ "error": { "code": "...", "message": "..." } }` JSON responses.

## Checks and production build

```bash
npm run db:validate
npm run typecheck
npm run build
npm test
# After building and applying migrations:
npm start
```

`npm test` runs isolated API/environment tests without a database. Supertest opens
temporary local sockets. It covers health success/failure, error redaction, CORS,
preflights, 404s, malformed JSON, body-size limits, and environment validation.

### Optional PostgreSQL integration tests

Use a **dedicated** database, never the development database:

```bash
# If the dedicated test database does not already exist:
createdb --owner=pink_pocket pink_pocket_test
# First-time configuration only:
cp .env.test.example .env.test
```

Set the password in `.env.test` to match your local PostgreSQL password. Keep the
database name `pink_pocket_test` and `NODE_ENV=test`.

```bash
# Apply the same migrations to the dedicated test database:
node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
npm run test:db
```

The suite refuses database names not ending in `_test`. Schema fixtures are rolled
back; API fixtures use unique accounts and delete only those accounts on cleanup. Tests cover a live
health query, exact Decimal storage, date-only values, monthly budget uniqueness,
category ownership/type, positive amounts, and month/year constraints.

## Database and architecture

- `src/app.ts`: app factory; middleware and routes, no listening side effects.
- `src/index.ts`: database startup check, HTTP listener, shutdown.
- `src/routes/`, `src/controllers/`, `src/services/`: HTTP wiring, responses, and
  database health query respectively. New feature logic belongs in services.
- `src/lib/`: validated environment, Prisma adapter/client, connection-check CLI.
- `src/validators/env.ts`: required PostgreSQL URL, exact frontend origins, port.
- `src/middleware/error-handler.ts`: consistent JSON errors with no stack traces
  or connection strings in responses.
- `prisma/schema.prisma`: User, Session, Category, Transaction, Budget, transaction enum.
- `prisma/migrations/`: initial schema, indexes, FKs, and SQL CHECK constraints.
- `prisma.config.ts`: Prisma 7 CLI datasource and migration configuration.

Prisma 7 uses the official PostgreSQL driver adapter. Generated TypeScript is
written to `src/generated/prisma/`, ignored by Git, and compiled into `dist/`.
Regenerate after installing dependencies or changing the schema.

Amounts use `Decimal(19,2)`, never float storage. Endpoints validate
positive two-decimal inputs and serialize money as fixed two-decimal strings.
Transaction dates use PostgreSQL DATE (no timezone); map them to UTC midnight in
Prisma and use UTC month boundaries in services. Creation timestamps use
TIMESTAMPTZ. The local database timezone is explicitly UTC.

The category composite FK `(categoryId, userId, type)` prevents cross-user category
assignment and type mismatches at the database layer. Services also filter
by the authenticated owner. Database checks enforce positive
amounts and valid budget month/year; user/year/month is unique. Budgets have no
category relation in this initial version.

CORS permits exact `FRONTEND_ORIGINS`, including credentials. Writes require an
approved Origin and authenticated mutations require a session CSRF token. JWTs
are stored in HttpOnly cookies (Secure in production); session rows allow logout
revocation. The signing secret is required in every environment. No authentication
tokens are stored in localStorage. Passwords use bcrypt with cost 12. Login and
registration share an IP-based limit of 30 attempts per 15 minutes.

The frontend uses a same-origin `/api` proxy in development. See the root README
for browser tests, API request/response conventions, and hosting limitations.

## Troubleshooting

- **No space left / ENOENT during generation:** free disk space and retry.
  PostgreSQL also needs free space to start reliably.
- **PostgreSQL not running:** use `brew services start postgresql@17`. Check
  status with `brew services list` and `pg_isready -h 127.0.0.1 -p 5433`.
- **Database connection failed:** check the role password, database name, and port
  in `.env`. Use `psql -h 127.0.0.1 -U pink_pocket -d pink_pocket -W` to test access.
- **Role/database already exists:** skip its creation. Use the existing role's
  password, or change only that project's role password intentionally with psql.
- **Port conflict:** inspect the existing PostgreSQL installation before starting
  another one. Keep DATABASE_URL and the PostgreSQL listener port consistent.
- **Missing tables:** run `npm run db:deploy`.
- **Invalid environment:** fix the named field in `.env`; values are never logged.

`brew services stop postgresql@17` stops PostgreSQL while retaining data.
The old Docker configuration was removed from the project. Existing Docker images
and volumes have not been deleted; no data was automatically transferred from them.

Official references: [Homebrew PostgreSQL 17](https://formulae.brew.sh/formula/postgresql@17), [Prisma 7 PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql),
[Express 5 error handling](https://expressjs.com/en/5x/guide/error-handling/).

## Verification

Build/type checks, isolated API tests, real PostgreSQL integration tests, and
browser workflow tests are documented in the project README and latest task
report. Both migrations are additive; the existing data is retained.
