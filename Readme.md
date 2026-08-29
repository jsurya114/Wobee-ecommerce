# Woobe E-commerce

"Fashion, by weight" — an Indian apparel storefront (`apps/web`), staff admin (`apps/admin`), and API (`apps/api`) as a TypeScript/Node.js modular monolith, plus shared `packages/*`. See `project_planning/plan.md` for the ADRs and business rules, `project_planning/architecture.md` for module layering, `journal.md` for the day-by-day build log, and `DEVELOPMENT_RULES.md` for the non-negotiable correctness/security rules.

## Fresh-environment setup

```bash
git clone <this repo>
cd Woobe-ecommerce
corepack enable        # pins the exact pnpm version from package.json#packageManager
pnpm install            # also generates the Prisma client (postinstall)
pnpm run bootstrap       # creates .env if missing, checks Postgres/Redis, applies migrations
```

`pnpm run bootstrap` (`scripts/bootstrap.mjs`) is idempotent — safe to re-run any time, including on a machine that's already set up. It does **not** start Postgres/Redis itself (see below for why) — run it once, follow whatever it tells you is missing, then re-run it.

### Postgres / Redis

This repo has been run two different ways on different machines (see `journal.md`, 2026-08-25/26/27 entries) — pick whichever fits yours:

- **Docker** (if installed and its daemon is running): `pnpm run docker:up` — `docker-compose.yml` maps Postgres to host port **5433** and Redis to host port **6380** (not the 5432/6379 defaults — this avoids clashing with an unrelated project's native Postgres/Redis on the original dev machine; harmless to keep even on a clean machine).
- **Native, no Docker**: stand up a second Postgres cluster and a second Redis instance on those same ports, e.g.:
  ```bash
  initdb -D ~/.local/share/woobe-dev/pgdata -U woobe --auth=trust
  pg_ctl -D ~/.local/share/woobe-dev/pgdata -l ~/.local/share/woobe-dev/pg.log -o "-p 5433" start
  # then, once: create the `woobe` role's password + woobe_dev/woobe_shadow/woobe_test databases
  redis-server --port 6380 --daemonize yes --dir ~/.local/share/woobe-dev/redis
  ```

`.env.example` (copied to `.env` by bootstrap) already points at `localhost:5433`/`localhost:6380` — no edits needed for either path above.

### Environment variables

`.env` at the repo root is the single source of truth for every app/package (see `.env.example` for the full annotated list — DB URLs, JWT/cookie secrets, Razorpay keys, per-app API base URLs).

- **`apps/api`** loads it automatically (`src/config/env.ts`, via Node's built-in `process.loadEnvFile`) — just run `pnpm --filter @woobe/api run dev`, no manual `export` needed. An already-exported shell variable always takes precedence over the file (this is also what keeps CI's directly-injected env vars, and `vitest.config.ts`'s test-DB overrides, safe from being clobbered by this file).
- **`pnpm run db:migrate`/`db:migrate:deploy`/`db:seed`/`db:studio`** load it the same way (`scripts/with-root-env.mjs`) — the Prisma CLI has no env-loading of its own.
- **`apps/web`/`apps/admin`** are Next.js apps — they load their own `apps/web/.env.local`/`apps/admin/.env.local` (Next.js only auto-loads `.env*` from an app's own directory, not the monorepo root; see each app's `.env.example`).

### Migrations and seed data

```bash
pnpm run db:migrate:deploy   # apply migrations (bootstrap already does this)
pnpm run db:seed             # optional demo data — NOT run by bootstrap automatically
```

`db:seed` creates 1 warehouse, 5 categories, 2 collections, 10 demo products/variants/inventory, and three dev-only accounts: `admin@woobe.in` / `Admin@12345` (super admin), `orders@woobe.in` / `Staff@12345` (order-processing staff), `catalog@woobe.in` / `Staff@12345` (product-management staff) — all passwords dev-only, never real. **Known gap:** re-running `db:seed` against a non-empty database currently duplicates `PricingSetting`/`ShippingRule`/`GstSlab` rows (they use `.create`, not `.upsert`) — harmless for local testing, not yet fixed (see `journal.md`'s known gaps).

### Running it

```bash
pnpm run dev     # apps/api :4000, apps/web :3000, apps/admin :3001, all together
```

## Everyday commands

```bash
pnpm run lint
pnpm run typecheck
pnpm run test
pnpm run build
pnpm run boundaries:check   # dependency-cruiser — enforces ADR-010's module boundaries
```

These five are exactly what CI (`.github/workflows/ci.yml`) runs — see `Definition of Done` in `project_planning/week2 (1).md` §29 for the full bar (including 375px/768px/1024px/1440px UI verification).

## Repo layout

```text
apps/
  web/      customer storefront (Next.js 15, App Router)
  admin/    staff admin (Next.js 15, App Router)
  api/      Express API — modular monolith, apps/api/src/modules/<name>/{domain,application,infrastructure,interface}
packages/
  database/    Prisma schema, migrations, seed
  types/       shared TS types (Role, etc.)
  validation/  shared Zod schemas (used client + server, ADR-020)
  ui/          shared UI primitives (packages/ui/src/primitives, .../components)
  config/      shared Tailwind preset, etc.
  utils/       pure domain logic with no I/O (money/weight formatting, pricing formula)
```

`apps/web`/`apps/admin` never touch Postgres/Prisma directly — every read/write goes through `apps/api` over HTTP (ADR-019).
