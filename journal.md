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

**Update:** committed and pushed to `dev1` as `519829e` (see Day 2 entry below).

---

## 2026-08-25 — Week 1 Day 2: Auth (API + UI together)

**Branch/commit:** `dev1` (not yet committed — pending go-ahead, see chat)

**What changed:**
- **Schema**: added `RefreshToken` model (`packages/database/prisma/schema.prisma`, migration `20260825105515_add_refresh_tokens`). ADR-018's "rotating refresh token" implemented as a DB-backed **opaque** token (crypto-random, sha256-hashed at rest), not a second JWT — this is what makes logout and reuse-detection real instead of "wait out the expiry."
- **`apps/api` auth module — fully implemented** (domain/application/infrastructure/interface, replacing Day 1's `501` stubs):
  - `register` / `login` / `refresh` / `logout` / `me` (new — protected, used by the frontend to restore a session).
  - Access token: short-lived JWT (15m default), verified by signature only, sent via `Authorization: Bearer`.
  - Refresh token: opaque, httpOnly + signed cookie, scoped to `/api/v1/auth`, **rotated on every refresh** (old row revoked, new row issued) and **reuse-detected** — presenting an already-revoked token revokes every session for that user (covered by an integration test).
  - Login timing-equalized between "no such user" and "wrong password" (same error, same rough latency via a dummy bcrypt compare) — prevents account-enumeration via response content or timing.
  - Deactivated-account check on both login and refresh.
  - `RBAC` middleware (`auth-guard.ts`, `rbac-guard.ts`) — deliberately duplicates a 2-line JWT verify instead of importing the auth module's `JwtService`, to keep ADR-010's boundary intact (this middleware protects every module's routes, not just auth's).
- **Correctness fix caught before it shipped**: Express 4 doesn't catch rejected promises from async route handlers — an unhandled use-case error would have bypassed `error-handler.ts` entirely. Added `middleware/async-handler.ts`, wrapped every async route.
- **Bug caught by writing the integration tests, not by inspection**: `packages/validation`'s `registerSchema` rejected a *blank* (not omitted) phone field — exactly what an untouched HTML input submits — because `""` doesn't match `.optional()`'s "field absent" case, only Zod's own `undefined`. Fixed with an explicit `"" -> undefined` transform; regression test added.
- **Integration tests** (`apps/api/src/modules/auth/auth.integration.test.ts`, 8 tests) against a **real** `woobe_test` Postgres database (migrated once via `prisma migrate deploy`, see below) — register, duplicate-email conflict, login, wrong-password (enumeration-safe), `/me` protected route, full refresh+logout lifecycle, and refresh-token reuse detection. All pass.
- **`packages/ui` primitives** (Button, Input, Label, `FormField`, `cn()` via clsx+tailwind-merge+cva) — first real primitives, styled with Day 1's design tokens. Deliberately not using Base UI yet (ADR-022) — nothing built so far needs accessible primitive *behavior* (focus trap, listbox), just styled HTML elements.
- **`apps/web` auth feature**: `lib/api-client.ts` (the sole HTTP boundary to `apps/api`, ADR-019), `features/auth/{api,hooks,components}` — `AuthProvider`/`useAuth` (access token in memory only, never localStorage; silent `/auth/refresh` on mount to restore a session across reloads), `LoginForm`/`RegisterForm` (react-hook-form + Zod resolver against the *same* schemas apps/api validates with), `AccountView` (the protected-route proof), `SiteHeader` (minimal nav for manual testing — not the real mobile nav, that's Day 3+).
- **Environment**: Next.js only auto-loads `.env*` from an app's own directory, not the monorepo root — added `apps/web/.env.local` and `apps/admin/.env.local` (+ `.env.example` siblings) for `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_ADMIN_API_URL`.
- **Verified in a real browser** (chrome-devtools-mcp, 375px mobile viewport, not just desktop per plan.md §5's Definition of Done): register → lands on `/account` → **hard reload** → session restored from the httpOnly cookie alone → logout → `/account` now redirects to `/login` (deep-link genuinely blocked, not just hidden client-side) → wrong-password login shows the real server-driven error message. Zero console errors/warnings throughout. Screenshots not retained; re-run via chrome-devtools-mcp against `localhost:3000` to reproduce.
- Fixed a nondeterministic UI race caught during that browser pass: `AccountView`'s logout handler was racing its own `router.push("/")` against the auth-guard `useEffect`'s `router.replace("/login")` — same underlying security property either way, but two navigations competing on microtask timing is worth removing regardless. Now single-path via the guard.

**Why:** Per `week1_excecution_prompt.md` Day 2 — auth is the foundation every other Week 1 day depends on (checkout, orders, etc. all need a real user). Built API+UI together per the plan's explicit instruction, so the contract was validated against real client code immediately, not integrated at the end.

**Definition of Done, checked against plan.md §5:**
- Zero TypeScript errors (9/9 projects), zero ESLint warnings (9/9), zero module-boundary violations (verified firing on a real violation, not just passing).
- Unit tests: password/schema edge cases. Integration tests: full transactional auth flow, including both mandatory-style concurrency-adjacent cases for this module (duplicate email race handled at the DB constraint, not just the pre-check; refresh-token reuse detection).
- Mobile viewport (375px) verified via chrome-devtools-mcp — done above, not skipped.
- No secrets/PII in logs — nothing new logged besides the existing bootstrap/error lines from Day 1.

**Follow-ups / known gaps:**
- `RefreshToken` rows are never pruned — expired/revoked rows accumulate forever. Fine at Week 1 scale; a cleanup job is a Week 4 observability/ops concern, not urgent now.
- No rate limiting on `/login` or `/register` yet (brute-force / registration-spam protection) — `ARCHITECTURE.md` §3.4 lists a `rate-limiter` middleware using Redis; not built this week, flagging so it isn't forgotten before production.
- `SiteHeader` is a manual-testing stand-in, not the real mobile bottom nav (design plan §10) — expected to be replaced, not extended, when Day 3's cart/wishlist give it something real to link to.
- Two manually-created browser-test accounts were cleaned up from `woobe_dev` after verification; the automated integration suite cleans up after itself via its `test.woobe.internal` email pattern.

---
