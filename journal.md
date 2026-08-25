# Woobe Development Journal

Append-only log, most recent entry at the bottom. One entry per completed change — this exists because multiple developers work on this repo; read the latest entries before you start work to know what state things are in.

Entry format:
```
## YYYY-MM-DD — <short title>
**Branch/commit:** ...
**What changed:** ...
**Why:** ...
**Follow-ups / known gaps:** ...
```

---

## 2026-08-25 — Week 1 Day 1: Foundation

**Branch/commit:** `dev1` (not yet committed — see note at end of this entry)

**What changed:**
- **Monorepo scaffolding**: pnpm workspace (`apps/{web,admin,api}`, `packages/{database,types,validation,ui,config,utils}`), root scripts, corepack-pinned pnpm 11.23.0.
- **Full Prisma schema** (`packages/database/prisma/schema.prisma`) — every domain from `plan.md` §3 modeled now: auth (User/AuthCredential/Address), catalogue (Category/Collection/Product/ProductVariant/ProductImage), inventory (Warehouse/Inventory, ADR-015), pricing (PricingSetting), cart/wishlist (ADR-011), coupons, orders/order items (state machine per `plan.md` §4), payments + WebhookEvent (idempotency dedup, ADR-014), shipping (ShippingRule, ADR-021), returns/refunds (item-level, separate from `Order.status`), reviews, notifications. Money = `Int` paise, weight = `Int` grams throughout, no exceptions.
  - `Product.minPricePaiseCache` / `ProductVariant.effectivePricePaiseCache` added as **denormalized display/sort caches only** (ADR-012's category+price index) — checkout/cart pricing never reads them, always recomputes live. Clearly commented in the schema so this isn't mistaken for a price source of truth later.
  - Deferred to Day 3: the `pg_trgm` GIN index on `Product.name` (ADR-012) — didn't want to guess at untested Prisma `postgresqlExtensions` syntax on Day 1 with no catalogue-search code yet to validate it against. Noted as a TODO in the schema.
- **Migration applied + seeded** against local Postgres: `20260825102735_init`. Seed creates 1 warehouse, 1 admin (`admin@woobe.in` / `Admin@12345`, dev-only), 1 `PricingSetting` (₹1,200/kg placeholder), 1 `ShippingRule`, 5 categories, 2 collections, **10 demo products / 22 variants / 22 inventory rows**. Verified queryable via `psql` and Prisma Studio.
- **`apps/api` foundation**: env validation (zod, fail-fast), Redis client, `DomainError` hierarchy + `Result<T,E>`, `error-handler`/`request-id`/`validate` middleware, Express app + graceful shutdown. **All 17 modules** from `architecture.md` §3.3 registered as composition roots (`src/modules/*/*.module.ts`) mounted at `/api/v1/<name>`; only `auth` has its full domain/application/infrastructure/interface layering built out (per architecture.md's reference shape) — routes are real and validate against the real Zod schemas, but handlers return `501` with a "lands Day 2" message. No auth business logic (password verify, token issuance) written yet — that's Day 2, not started early.
- **Module boundary enforcement (ADR-010)**: `apps/api/.dependency-cruiser.cjs`, wired into `pnpm run boundaries:check` and CI. Verified it actually fires — not just present — by deliberately adding a violating import, confirming it failed, then confirming a clean tree passes.
- **CI** (`.github/workflows/ci.yml`, ADR-013): Postgres + Redis service containers, install → destructive-migration check → generate → migrate deploy → `migrate diff` drift check → lint → typecheck → boundary check → test → build. Not yet validated by an actual GitHub Actions run (needs a push) — reasoned through carefully but flag this as first-push-verify.
- **Destructive-migration guard** (`scripts/check-destructive-migration.mjs`, ADR-013): fails CI on any newly-added `migration.sql` containing DROP TABLE/COLUMN/TRUNCATE/column-TYPE-change unless it carries a human-added `-- accept-data-loss: <reason>` comment.
- **`apps/web` / `apps/admin`**: minimal Next.js 15 (App Router, React 19) skeletons, Tailwind wired to the design tokens from `woobe_ui_design_plan.md` §3-5 (`packages/ui/src/tokens`, mirrored in `packages/config/tailwind/preset.cjs`), Playfair Display + Inter via `next/font/google`. `apps/web` has a real (if placeholder) mobile-first homepage under the `(storefront)` route group; `apps/admin` has a placeholder landing page. No real pages/features yet — that starts Day 2.
- **`packages/utils`**: `calculateWeightBasedPricePaise` (the core pricing formula) + money/weight display helpers, unit tested (12 tests).
- **`packages/validation`**: `registerSchema` / `loginSchema` (Zod, shared client+server per ADR-020), unit tested (5 tests) — ready for Day 2's actual register/login pages to consume.
- **Governance docs added**: `DEVELOPMENT_RULES.md` (9 non-negotiable rules, referenced from ADR-016/§5), `DECISIONS_PENDING.md` (GST rate, shipping fee tier, default ₹/kg rate, Razorpay keys — all placeholder'd, not silently assumed).
- **Verified, not just written**: `pnpm install`, `db:generate`, `typecheck` (9/9 projects), `lint` (9/9, zero warnings), `test` (21/21 passing), `boundaries:check`, `build` (all apps), `prisma migrate dev`, `db:seed`, Prisma Studio boot, and a live `apps/api` server boot against real Postgres+Redis with a real HTTP round-trip (`/health`, validation-rejected register, validation-passed register hitting the Day-2 501 stub).

**Why:** Per `week1_excecution_prompt.md` Day 1 — foundation everything else depends on. Sequenced so Day 2 (auth) can start immediately without any scaffolding decisions left open.

**Environment notes for other developers on this machine/repo:**
- **Ports remapped from Docker defaults** — this dev machine already runs an unrelated project's Postgres (native, port 5432) and Redis (Docker container `version-vault-redis`, port 6379). Woobe's `docker-compose.yml` maps **Postgres to host `5433`** and **Redis to host `6380`** instead (container-internal ports unchanged). `.env.example` reflects this. If you're on a clean machine with no port conflicts, these mappings still work fine — just non-default.
- `pnpm` runs via **corepack** (`corepack enable`), not a separate global install — pinned via root `package.json`'s `packageManager` field.
- Local `.env` created from `.env.example` with real random dev JWT/cookie secrets (not committed — gitignored).
- `pnpm-workspace.yaml` now has an `allowBuilds` block approving postinstall scripts for `prisma`, `@prisma/client`, `@prisma/engines`, `esbuild`, `sharp` — all legitimate, needed for Prisma's engine binary and Next.js's image optimizer.

**Follow-ups / known gaps:**
- CI workflow written but not yet exercised by a real GitHub Actions run — verify on first push.
- `pg_trgm` GIN search index deferred to Day 3 (see schema TODO).
- `package.json#prisma` config is deprecated as of this Prisma version (v6.19) in favor of `prisma.config.ts` — not migrated, not urgent, Prisma 7 isn't out yet.
- **This work is not yet committed** — leaving that for an explicit go-ahead (see chat).

---
