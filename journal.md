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

## 2026-08-25 — Week 1 Day 3: Catalogue + Cart (API + UI together) — ADR-011

**Branch/commit:** `dev2` (not yet committed — see chat)

**Pre-work: SOLID / Clean Architecture audit of Day 1–2 code (requested before starting Day 3).** Reviewed the `auth` module (the only fully-built reference module) against `architecture.md` §3.1 layering and SOLID: every use-case has a single responsibility, `application` depends only on `AuthRepositoryPort` (DIP) — never Prisma directly — and `infrastructure/repositories/auth.repository.ts` is verifiably the only file touching `@woobe/database` (dependency-cruiser, not just convention). Controllers stay thin. One defect found and fixed: `JwtService.signRefreshToken()`/`verifyRefreshToken()` were dead code (refresh tokens are opaque, sha256-hashed strings, never JWTs — leftover from an earlier design). Deleted both; nothing referenced them. No other violations found. Day 3 replicates the exact same module shape.

**What changed:**
- **Four new/built-out backend modules**, each following auth's `domain/application/infrastructure/interface` shape (ADR-010, only each module's own `infrastructure/repositories/*.ts` imports `@woobe/database`):
  - **`pricing`** (built out from Day 1's placeholder): `resolveEffectiveRatePerKgPaise` pure domain function (variant override wins, else the current admin default) + `CalculateEffectivePriceUseCase`, which is the single path every other module prices a variant through — combines that with `packages/utils`' `calculateWeightBasedPricePaise`. No HTTP surface yet (not needed this week); exported from `pricing.module.ts` for in-process cross-module use.
  - **`inventory`** (read-only slice — reservation/row-locking is Day 4, ADR-015, same repository this extends): `GetAvailableQuantitiesUseCase`, batched, sums `quantityAvailable - quantityReserved` across warehouse rows per variant.
  - **`categories`** (category-filter-only per the plan): `GET /api/v1/categories` (active, sorted) + an exported `findCategoryBySlugUseCase` for products' listing filter.
  - **`products`**: `GET /api/v1/products` (category slug filter, pagination, sorted by the `(categoryId, minPricePaiseCache)` index from ADR-012 — listing intentionally reads the **display/sort cache**, not live pricing, per the schema's own comment on that column) and `GET /api/v1/products/:slug` (detail — recomputes price **live** per variant via `pricing`, plus per-variant stock via `inventory`, since a single product's few variants make that cheap and it's the natural place to exercise the same live-pricing path `cart` uses). Also exports `getVariantsForCartUseCase` for `cart`.
  - **`cart`**: guest identity via a **signed httpOnly `cart_id` cookie** scoped to `/api/v1/cart` (ADR-011, same treatment as the refresh-token cookie), 30-day TTL. `GetCartUseCase` recomputes weight → price → subtotal **live on every read** from `products`/`pricing`/`inventory` — `CartItem` stores only `variantId` + `quantity` (schema.prisma is explicit: no price/subtotal columns), so there's no stored value for a tampered client input to ever override. `AddItemUseCase`/`UpdateItemQuantityUseCase` reject (409) a quantity exceeding live available stock. `MergeGuestCartUseCase` implements ADR-011 exactly: union items, **higher quantity wins on conflict** (`resolveMergedQuantity`, pure domain fn), then re-validates the merged result against live stock — caps or drops lines that no longer fit. Routes: `GET /`, `POST /items`, `PATCH /items/:itemId`, `DELETE /items/:itemId` (all via a new `optionalAuthGuard` middleware — never rejects, just sets `req.user` when a valid token is present, since guest and logged-in customers share these endpoints) and `POST /merge` (strict `authGuard` — the one cart endpoint that isn't guest-accessible).
- **Cross-module reads done via ports, not direct imports of Prisma or of another module's infrastructure** — `products`/`cart` each define narrow interfaces (`PricingReaderPort`, `InventoryReaderPort`, `CategoryReaderPort`/`VariantCatalogPort`) in their own `application/ports/`, wired in the composition root (`<module>.module.ts`) to a one-line pass-through calling the other module's exported use-case instance. Keeps DIP intact (application layer only knows the interface) without inventing adapter files for what's genuinely a trivial pass-through — matches `architecture.md`'s "other modules trigger transitions through its ports" pattern already used for orders/payments/returns.
- **New Zod schemas** (`packages/validation`, ADR-020): `productListQuerySchema` (category, page, limit — capped at 50), `addCartItemSchema`/`updateCartItemSchema` (deliberately **only** `variantId`/`quantity` — no price field exists to tamper with; Zod strips anything else a tampered request body includes).
- **`apps/web` catalog + cart features**: `features/catalog` (`ProductGrid`, `CategoryFilter` — plain links, works without JS — `ProductDetail` server component composing a `ProductPurchasePanel` client island for variant selection + add-to-cart), `features/cart` (`CartProvider`/`useCart` — mirrors Day 2's `AuthProvider` shape, replaces `cart` wholesale from the server response on every mutation rather than updating optimistically, since the server is the only legitimate source for price/subtotal; merges the guest cart via `POST /cart/merge` whenever auth status becomes `"authenticated"`, which is idempotent and safe to call on every session-restore too). Pages: `/products` (category filter via `?category=` query param, Server Component), `/products/[slug]`, `/cart`. `SiteHeader` extended (not replaced — full mobile bottom nav needs wishlist too, still Week 2+) with Shop/Bag links, Bag showing a live item count.
- **New unit tests** for the domain layer added this week (Definition of Done, `plan.md` §5): `resolveEffectiveRatePerKgPaise` (3 tests), `resolveMergedQuantity` (2 tests), `computeCartTotals` (2 tests) — all pure functions, no I/O.
- **Local dev environment gap found and fixed**: Day 2's `RefreshToken` migration (`20260825105515_add_refresh_tokens`) had never actually been applied on this machine's dev/test databases — only Day 1's `init` migration had run, so `apps/api` failed to typecheck (`Property 'refreshToken' does not exist on PrismaClient`) and the auth integration suite 500'd until `prisma migrate dev`/`migrate deploy` were re-run against `woobe_dev`/`woobe_test`. Not a code defect, a stale-local-env issue — flagging in case another machine hits the same thing.

**Why:** Per `week1_excecution_prompt.md` Day 3 — catalogue and cart are what turn the Day 2 walking skeleton into something a guest can actually shop with, and both need to prove the same non-negotiable: price/weight/subtotal are computed server-side, never trusted from the client (`DEVELOPMENT_RULES.md` #1).

**Definition of Done, checked against `plan.md` §5 and the day's own bar ("verify by tampering with a client value and confirming the server ignores it"):**
- Zero TypeScript errors, zero ESLint warnings, zero module-boundary violations across all 9 workspace projects (`pnpm run typecheck` / `lint` / `boundaries:check`).
- Unit tests: pricing/merge/totals domain logic (7 new tests). Full suite (18 tests) green, including Day 2's untouched auth integration tests.
- **Tampering verified directly**: `POST /api/v1/cart/items` with a spoofed `"pricePaise":1` in the body — Zod's schema only recognizes `variantId`/`quantity`, so the field is silently dropped; the response's `unitPricePaise`/`subtotalPaise` came back server-computed (`74400`/`148800` for 2× a 620g variant at ₹1,200/kg) regardless.
- **Stock enforcement verified**: adding past available quantity returns `409 CONFLICT` with the real remaining count, not a silent clamp.
- **Merge-on-login verified**: guest adds 2 units → registers a new account → `POST /cart/merge` → the 2 units land in the new account's cart, guest cart marked `MERGED`, cookie cleared.
- Full guest flow (browse → filter by category → open a product → select colour/size, live price updates → add to bag → adjust quantity → remove) walked in a real browser via `chrome-devtools-mcp` at **375px mobile viewport** — zero unexpected console errors (only the pre-existing, expected guest `/auth/refresh` 401 and a missing favicon, neither related to this week's work).
- `pnpm run build` clean across `apps/api`, `apps/web`, `apps/admin`.

**Follow-ups / known gaps:**
- `pg_trgm` GIN search index (flagged as a Day 1 TODO, tentatively "Day 3" in the schema comment) is **still** deferred — the actual day plan only calls for category filtering ("skip advanced search/sort for now"), and ADR-012's explicit trigger (catalogue > ~50k products, or p95 filter latency > 300ms, or a typo-tolerant/faceted UX need) isn't met yet. Re-flagging so it isn't mistaken for forgotten.
- Cart has no server-side enforcement of ADR-021's 1kg checkout minimum / 1.5kg free-delivery threshold yet — that's explicitly `shipping` + Day 4 (checkout-blocking) scope, not cart-display scope this week.
- `RefreshToken`-style pruning doesn't apply here, but the equivalent gap exists for abandoned guest carts (`ACTIVE` carts with no activity) — no cleanup job; fine at Week 1 scale, a Week 4 ops concern like the refresh-token one.
- `SiteHeader` still isn't the real mobile bottom nav from `woobe_ui_design_plan.md` §10 — that needs wishlist (Week 2+) to be worth building as a single unit; extended minimally instead of replaced.

---

## 2026-08-25 — Pre-Day-4 Patch: Settings Schema + RBAC (ADR-021/023/024)

**Branch/commit:** `dev2` (not yet committed — see chat)

**What changed** (per `project_planning/pre-day-4-patch.md`, three items):

1. **Settings schema** — added `GstSlab` (`id`, `maxPricePaise` nullable/top-slab, `ratePercent`, `createdAt`), one additive migration (`20260825150106_add_gst_slabs`, pure `CREATE TABLE`), seeded per ADR-023 (5% ≤ ₹2,500, 18% above). Audited `ShippingRule` and `PricingSetting` per the patch's own escape hatch: both were **already correct** from Day 1 — `ShippingRule` already had `minWeightGramsForCheckout`/`freeDeliveryThresholdGrams` (equivalent to the patch's `minOrderWeightGrams` naming, just not identical), `PricingSetting` was already DB-backed. Left both alone rather than adding a duplicate/renamed column — see Deviations below.
2. **Cart weight-threshold audit** — grepped `apps/api/src/modules/cart`, `apps/api/src/modules/shipping`, and `apps/web` for hardcoded `1000`/`1500` or a `WeightThresholdBanner`. Found neither. The `shipping` module is still Day 1's placeholder (`Built out: Week 1 Day 4`) and Day 3's cart module never implemented checkout-blocking at all — it was correctly deferred, not built with hardcoded values that needed fixing. **Zero code changes for this item.**
3. **RBAC replacement** — `Role` enum extended (additive `ALTER TYPE ... ADD VALUE`, migration `20260825150147_extend_role_enum`) with `SUPER_ADMIN`/`ORDER_PROCESSING_STAFF`/`PRODUCT_MANAGEMENT_STAFF`; seeded admin user migrated to `SUPER_ADMIN` via the seed script's upsert `update` clause (so re-running seed is the data migration, not a one-off SQL statement). New `apps/api/src/config/permissions.ts` — `PERMISSIONS` map + `ROLE_PERMISSIONS: Record<Role, Set<Permission>>` per ADR-024 (customer: none; super_admin: all five; order_processing_staff: `MANAGE_ORDERS` only; product_management_staff: `MANAGE_CATALOG` + `MANAGE_INVENTORY` only — confirmed disjoint, neither a subset of the other), 4 new unit tests. `rbac-guard.ts`'s `requireRole` replaced with `requirePermission(...permissions)` (passes if the caller holds ANY of the listed permissions — same ergonomics as the old variadic `requireRole`); zero route-level changes needed since nothing used `requireRole` yet. Single source of truth for the `Role` TS type moved to `packages/types` (`ROLE` const updated to the four contracted roles) — every hand-rolled `"CUSTOMER" | "ADMIN"` union across `auth-guard.ts`, `optional-auth-guard.ts`, `jwt.service.ts`'s `AccessTokenPayload`, `user.entity.ts`, and `apps/web`'s `auth.client.ts` now imports `Role` from there instead.

**Why:** Day 4 (checkout/GST/shipping) was designed against `GstSlab`/`ShippingRule` and ADR-024's role model — this patch is the small additive catch-up so Day 4 lands on the right foundation instead of needing its own schema/RBAC rework mid-stream.

**Migration safety:** both new migrations are purely additive (`CREATE TABLE`, `ALTER TYPE ... ADD VALUE`) — neither matches `scripts/check-destructive-migration.mjs`'s patterns (DROP TABLE/COLUMN, TRUNCATE, column TYPE change), confirmed by manual inspection of both `migration.sql` files. No `--accept-data-loss` marker needed. Applied to `woobe_dev` and `woobe_test` (the auth integration suite's database).

**Deviations from `pre-day-4-patch.md`, both deliberate:**
- **Did not rename/duplicate `ShippingRule`'s existing columns** to match the patch's `minOrderWeightGrams` naming — `minWeightGramsForCheckout` already exists from Day 1 with identical semantics (seeded `1000`) and `freeDeliveryThresholdGrams` already existed too. Renaming would be a destructive column change for zero functional gain; adding a second, differently-named column with the same meaning would just create confusing duplicate settings. Applied the patch's own stated principle for `PricingSetting` ("if already correct, leave it alone") to `ShippingRule` as well.
- **Kept `ADMIN` in the `Role` enum as an unused legacy value** rather than removing it to leave exactly the four contracted roles. Postgres can't cheaply drop an enum value without recreating the type (new type, migrate column via `USING`, drop old type) — meaningfully more invasive DDL for a Week-1 dev database with a single affected row. Nothing in the codebase issues `ADMIN` anymore (the TS-level `Role` union in `packages/types` no longer includes it, so it's unreachable from application code); the DB enum keeping a harmless extra value is the additive, expand-only choice consistent with the rest of this patch and with ADR-013's expand-contract migration discipline.

**Verified against `plan.md` §5 Definition of Done:** zero TypeScript errors, zero ESLint warnings, zero module-boundary violations across all 9 workspace projects; 22/22 tests passing (4 new permission-mapping tests, all prior tests untouched and still green); `pnpm run build` clean for `apps/api`/`apps/web`/`apps/admin`; live smoke test — `admin@woobe.in` logs in, `/auth/me` and the login response both return `"role":"SUPER_ADMIN"`, JWT payload carries the new role correctly.

**Follow-ups / known gaps:**
- `ADMIN` remains a dead value in the Postgres `Role` enum (see Deviations) — worth a one-time cleanup migration if the team ever wants full enum purity, not urgent.
- No admin-only routes exist yet to exercise `requirePermission` against a real request (expected — the admin settings/staff UI is Week 2+ scope per `week1_excecution_prompt.md`'s explicit exclusions). The middleware and permission mapping are unit-tested in isolation instead.

---
