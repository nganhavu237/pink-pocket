# Deploy Toki: Vercel + Render + Supabase

This guide is for **later deployment**. No cloud resources have been created and no
production database has been touched. Start with a fresh Supabase project; local
data does not need to be exported. Keep the existing application authentication.
Supabase Auth, Storage buckets and browser API keys are not needed.

## How it works

```text
Mac / iPhone → HTTPS Vercel frontend
                 /api/* → HTTPS Render Express API → TLS Supabase PostgreSQL
```

The browser always calls `/api` on the Vercel website, including photo requests.
Vercel proxies those requests to Render. This keeps login cookies first-party,
which avoids cross-site cookie restrictions in iPhone Safari. Keep the cookie
HttpOnly, Secure in production, SameSite=Lax, host-only, and scoped to `/api`.
CSRF checks and the exact-origin allowlist remain enabled. Do not switch to
cross-site cookies, put JWTs in localStorage, or set a cookie Domain.

My Space photos are already validated, resized, stripped of metadata, and saved
as private bytes in PostgreSQL. They survive Render restarts and deploys. No files
are saved on Render's temporary filesystem. Photos count toward Supabase's database
quota; each account has one photo, up to 5 MB before/after processing.

## 1. Save this prepared version when ready

The hosting providers must receive these local changes before deploying them.
Nothing has been committed or pushed for this preparation task. When you decide
to deploy, review and publish this version to your own GitHub repository first.
Never publish `.env`, `.env.production`, database credentials, or downloaded TLS
certificate files. The example env file and deployment config contain placeholders.

Use current Node.js **24.x** for both services. The package files and `.node-version`
files pin that major version. No Docker is used.

## 2. Create a free Supabase database

1. Create a **new Free project** at [Supabase](https://supabase.com/dashboard).
   Choose a region close to the Render service you will create. Save the database
   password privately.
2. Turn **off the Data API** in the project's API settings. Toki accesses PostgreSQL
   through the Express backend and Prisma, not the public REST/GraphQL API.
3. In **Connect → Session pooler**, copy the PostgreSQL connection string with
   port **5432**. Keep its exact host and `postgres.PROJECT_REF` username. This works
   on IPv4 and supports Prisma migrations and transactions. Do not use the
   transaction-pooler URL on port 6543 for these instructions.
4. Replace the password placeholder with the **URL-encoded** database password.
   Keep the URL server-side. Do not paste it into Vercel or any `VITE_*` variable.
5. Download the database **root certificate** from Supabase's database settings.
   Use `sslmode=verify-full` with that certificate; never use `sslmode=no-verify`,
   `NODE_TLS_REJECT_UNAUTHORIZED=0`, or `rejectUnauthorized: false`.

Use the database's `postgres` owner account for this small private backend. The
migrations enable RLS without browser policies on all application tables and the
Prisma migration table. The owner still accesses the tables; public Data API roles
cannot. If you later introduce a dedicated Prisma role, it must own the app tables
or have `BYPASSRLS`, and must never be used in a browser.

## 3. Apply the production migrations safely

On your Mac, from the repository:

```bash
cd server
npm ci --include=dev
cp -n .env.production.example .env.production
```

Edit the ignored `.env.production` with the **new Supabase** URL. For this local
migration command, use the absolute local path to your downloaded certificate,
not the `/etc/secrets/` path used on Render:

```dotenv
DATABASE_URL="postgresql://postgres.PROJECT_REF:URL_ENCODED_PASSWORD@YOUR_SESSION_POOLER_HOST:5432/postgres?sslmode=verify-full&sslrootcert=/absolute/path/to/supabase-ca.crt"
```

First check the destination **without printing credentials**:

```bash
node --env-file=.env.production -e "const u=new URL(process.env.DATABASE_URL); console.log('Migration target:', u.hostname, u.port, u.pathname)"
```

It must show your new Supabase session-pooler host, port 5432 and `/postgres`.
If it shows localhost, stop and correct the configuration. An exported shell
`DATABASE_URL` takes precedence over env-file values: clear it in that terminal
before continuing if the destination is wrong.

Then run:

```bash
node --env-file=.env.production node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.production node_modules/prisma/build/index.js migrate status
```

`migrate deploy` applies the checked-in migration history in order. It does not seed
financial data or reset the database. The new privacy migration enables RLS only;
it does not delete or rewrite records. A fresh database contains no Toki users;
register through Toki after deployment.

**Production rules:** use `migrate deploy`, not `migrate dev`, `migrate reset`, or
`db push`. Never edit an already-applied migration. For later schema changes,
create and test a new additive migration locally and back up production first.
If a migration fails, inspect its logs and fix the cause before redeploying; do not
reset the database or mark migrations applied without investigating.

## 4. Configure the free Render backend

In Render choose **New → Web Service**, connect the repository, and use:

| Setting        | Value                                   |
| -------------- | --------------------------------------- |
| Runtime        | Node                                    |
| Root directory | `server`                                |
| Instance       | Free                                    |
| Region         | Close to your Supabase project          |
| Build command  | `npm ci --include=dev && npm run build` |
| Start command  | `npm run start:render`                  |
| Health check   | `/api/health`                           |
| Auto deploy    | Off while setting up                    |

The root `render.yaml` also records these settings for an optional Blueprint.
Creating/syncing a Blueprint can initiate deployment; it is not necessary for this
manual setup. On the free plan there is no paid pre-deploy hook: `start:render`
runs `prisma migrate deploy` before starting the compiled Express server. It is
safe to rerun with all migrations already applied. A migration failure stops
startup instead of serving an incompatible schema. Builds generate Prisma but do
not migrate the database. Keep development dependencies available because the
migration CLI runs at startup.

Before starting the service, upload the Supabase certificate in **Environment →
Secret Files** with the filename **`supabase-ca.crt`**. Render makes it available
at `/etc/secrets/supabase-ca.crt`.

Set these Render environment variables (no surrounding quotes in dashboard fields):

| Variable            | Value                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------- |
| `NODE_ENV`          | `production`                                                                            |
| `HOST`              | `0.0.0.0`                                                                               |
| `DATABASE_URL`      | Session-pooler URL with `?sslmode=verify-full&sslrootcert=/etc/secrets/supabase-ca.crt` |
| `JWT_SECRET`        | Unique random secret; generate with `openssl rand -hex 48`                              |
| `FRONTEND_ORIGINS`  | Your exact eventual Vercel origin, e.g. `https://your-toki-project.vercel.app`          |
| `TRUST_PROXY_HOPS`  | `1` for the Render edge proxy; never `true`                                             |
| `DATABASE_POOL_MAX` | `5`                                                                                     |

Render supplies `PORT`; leave it alone. Node 24.x is selected by the checked-in
version files/package engines. Do not change `JWT_SECRET` on every deploy: keeping
it stable preserves sessions; rotating it intentionally signs users out.

You may reserve the Vercel project name first, without deploying, to determine its
production origin. If that name changes, update `FRONTEND_ORIGINS` in Render before
using the site. Do not add `*`, all of `vercel.app`, or arbitrary preview domains.

When you are ready to actually deploy, create the service with those settings and
note the assigned URL, e.g. `https://toki-api-ABCD.onrender.com`. Verify:

```bash
curl --fail https://YOUR-ACTUAL-RENDER-SERVICE.onrender.com/api/health
```

Expected JSON: `{"data":{"status":"ok","database":"connected"}}`.
Wait for startup if the free instance is waking up.

## 5. Configure the free Vercel frontend

1. In **`client/vercel.json`**, replace
   `https://replace-with-your-toki-api.onrender.com` with the **actual Render URL**
   from step 4. Keep `/api/:path*` on the destination. Save/publish that change
   when ready to deploy. Environment variables are not substituted into that JSON
   destination; editing this one public URL is required.
2. Import the repository into Vercel using **Hobby**, **Vite**, and **Root Directory
   `client`**. Use Node 24.x. Configuration in `client/vercel.json` supplies:

   | Setting          | Value                  |
   | ---------------- | ---------------------- |
   | Install command  | `npm ci --include=dev` |
   | Build command    | `npm run build`        |
   | Output directory | `dist`                 |

3. **No frontend environment variables are required.** In particular, do not add
   `DATABASE_URL`, `JWT_SECRET`, Supabase service keys, or a direct Render API base
   URL. `/api` rewrites handle fetch calls and private photo URLs together.
4. Deploy when you are ready. Check that the assigned **production domain** exactly
   matches Render's `FRONTEND_ORIGINS`. If needed, update Render and redeploy it.
5. Verify `https://YOUR-TOKI-DOMAIN.vercel.app/api/health` returns JSON, and refresh
   `/dashboard`, `/transactions`, `/planner`, and `/budgets` directly. The SPA rewrite
   serves the app on those routes; API requests must never return `index.html`.

Use the stable **production URL** daily, not a changing preview URL. Preview sites
are intentionally not allowed to mutate production data unless their exact origin
has been added deliberately. A future custom frontend domain requires updating
the Render allowlist; no cookie Domain change is needed.

## 6. Verify on your Mac and iPhone

Use the production Vercel URL in desktop Chrome/Safari and iPhone Safari:

- Register a fresh account, log out, log in, refresh and reopen the site.
- Add/edit/delete income and expenses, including custom categories and repeats.
- Check Overview totals, previous-month comparisons and Analytics.
- Set an overall monthly budget and category limits; change months and check
  overages. Category limits must not change the overall limit.
- Add and complete a Planner task; verify it in the Overview To-do view.
- Upload, replace and remove a My Space photo. After a Render restart/redeploy,
  the saved photo and all other data should still be present.
- Check Settings and currency display. Check the layout for horizontal overflow.
- Create a second test account and verify that financial data, tasks and photos
  are private to their owners. Do not run automated test suites on production.

If login does not persist, inspect the browser Network panel: registration/login
must return `Set-Cookie` with `HttpOnly; Secure; SameSite=Lax; Path=/api`, no Domain,
and subsequent `/api/auth/me` must return 200. Calls should target the **Vercel
origin**, not `onrender.com`. Check exact CORS origins and Origin/CSRF errors before
changing authentication settings. A 502/HTML response instead of JSON often means
the proxy target is wrong or Render is still waking up.

The prepared code and local tests do not prove hosted TLS, Vercel forwarding, or
physical iPhone Safari behavior. These cloud checks must be completed after the
first deployment; no deployment was performed during preparation.

## Free-tier limitations and backups

- Render sleeps after **15 minutes without inbound traffic**; waking can take about
  a minute. The first request may need a retry. Free services are not always-on.
- The repeat worker runs while Render is awake and catches up on startup/financial
  reads after sleep. Records remain deduplicated. Exact unattended execution at
  midnight requires always-on compute or a separate scheduler, outside this setup.
- Supabase Free includes **500 MB of database space** and may pause after a week
  of low activity. Restore a paused project from its dashboard if necessary.
- Free quotas can change. No paid disk, storage bucket, cron job or custom domain
  is required here. Monitor provider dashboards and avoid paid upgrades unless wanted.
- Supabase Free does not include automatic database backups. Periodically export
  an encrypted/private backup with a compatible PostgreSQL client:

  ```bash
  cd server
  node --env-file=.env.production --input-type=module -e 'import { spawnSync } from "node:child_process"; const r=spawnSync("pg_dump", ["--format=custom", "--schema=public", "--no-owner", "--no-acl", "--file=toki-backup.dump"], { stdio: "inherit", env: { ...process.env, PGDATABASE: process.env.DATABASE_URL } }); process.exit(r.status ?? 1)'
  ```

  The example keeps the URL out of command arguments/history. Backups contain
  account hashes, sessions, transactions and photos: store them privately, never
  in Git. Use the production env file's **local** certificate path for this command.

## Preparation test results

- Frontend production build and backend build passed.
- Frontend/backend source and test TypeScript checks, ESLint, Prettier and Prisma
  schema validation passed.
- 28 isolated API/environment tests and 143 PostgreSQL/API integration tests passed.
- All 16 desktop/mobile browser workflows passed against the built frontend.
- The RLS migration was applied only to the dedicated local test database; existing
  owner access and application data workflows still passed.
- Hosted credentials, cloud routing/TLS, and physical Safari remain unverified until
  deployment. The browser tests emulate an iPhone viewport in Chromium, not Safari.

## Local validation

No hosted credentials are needed for these checks:

```bash
cd server
npm run db:validate
npm run typecheck
npm run build
npm test
# Only the existing dedicated LOCAL test database:
node --env-file=.env.test node_modules/prisma/build/index.js migrate deploy
npm run test:db
cd ../client
npm run typecheck
npm run lint
npm run format:check
npm run test:e2e:production
```

The production browser command builds Vite and serves `dist` with the local API
proxy, using a dedicated test database and separate desktop/mobile browser runs.
It does not upload or deploy anything. Local development commands remain unchanged.
For local development, apply pending additive migrations with `npm run db:deploy`
from `server/` when ready; your development database/data was not reset.

## Official references

- [Vercel external rewrites](https://vercel.com/docs/routing/rewrites)
- [Vercel Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions)
- [Render Express deployment](https://render.com/docs/deploy-node-express-app)
- [Render free-service limits](https://render.com/docs/free)
- [Render deployment lifecycle](https://render.com/docs/deploys)
- [Supabase Prisma connection guide](https://supabase.com/docs/guides/database/prisma)
- [Supabase TLS certificates](https://supabase.com/docs/guides/database/psql)
- [Supabase data security](https://supabase.com/docs/guides/database/secure-data)
- [Supabase free-plan limits](https://supabase.com/pricing)
