# Woobe Monorepo — Technical Reconnaissance Report

Generated: 2026-09-13. Scope: current repository state on branch `woobe-ui/bug-fixes`. Read-only — no code was modified to produce this report. This is input for a later exhaustive code review, not the review itself. Anything not directly verified in the repo is marked UNKNOWN.

---

## 1. Repository topology

**Apps** (`apps/*`, pnpm workspace):

- `apps/api` — Express/Node backend. Clean/hexagonal architecture: `src/modules/<domain>/{interface,application,domain,infrastructure}`. 23 domain modules: admin, audit, auth, banners, cart, categories, collections, coupons, home, inventory, media, notifications, orders, payments, pricing, products, refunds, returns, shipping, staff, testimonials, users, wishlist. Also contains the background worker (`src/worker.ts`) — there is **no separate `apps/worker` package**; the worker is a second entrypoint in the same deployable unit as the API.
- `apps/web` — Next.js 15 / React 19 customer storefront. App Router at `app/(storefront)/*`, feature code at `src/features/*` (about, addresses, auth, cart, catalog, checkout, home, navigation, orders, payments, profile, returns, shipping, support, testimonials, wishlist).
- `apps/admin` — Next.js 15 / React 19 internal admin dashboard. App Router at `app/(dashboard)/*`, feature code at `src/features/*` (auth, banners, categories, collections, coupons, customers, dashboard, inventory, order-management, products, returns, settings, shell, staff, testimonials).

**Packages** (`packages/*`):
- `@woobe/database` — Prisma schema, migrations, generated client, seed script. Consumed only by `apps/api` (enforced convention, ADR-019).
- `@woobe/types` — shared TypeScript types/enums, depends on `@woobe/validation`.
- `@woobe/validation` — Zod schemas, no other runtime deps.
- `@woobe/utils` — pure logic helpers, has its own vitest suite.
- `@woobe/ui` — shared React component library (peer: react ^19), consumed by web + admin (not api).
- `@woobe/config` — shared eslint/typescript/tailwind config.

**Worker structure**: not a separate app — `apps/api/src/worker.ts`, a standalone BullMQ `Worker` process sharing the api package's code, started as its own OS process (`pnpm --filter @woobe/api run worker`), consuming the single `notifications` queue.

**Infrastructure/deployment directories**: `docker-compose.yml` (Postgres 16 + Redis 7 only — no app containers), `.github/workflows/ci.yml` (single CI workflow, build-verification only, no deploy step), `scripts/` (bootstrap.mjs, check-destructive-migration.mjs, with-root-env.mjs). No Kubernetes/EKS manifests, no Dockerfiles, no S3/Cloudinary config exist yet anywhere in the repo — these are planning-stage only (`project_planning/deployment_plan.md`), not implemented.

**Test directories**: Unit + integration tests live next to source as `*.test.ts` / `*.integration.test.ts` throughout `apps/api/src/modules/*` (one integration test file per module, e.g. `orders.integration.test.ts`, `checkout-price-change.integration.test.ts`, `admin-auth-rate-limit.integration.test.ts`, `google-auth-gaps.integration.test.ts`). `apps/api/vitest.config.ts` + `vitest.global-setup.ts`. `packages/utils` and `packages/validation` each run their own `vitest run`. No visible e2e/Playwright test directory in the repo.

**Configuration files**: root `package.json`/`pnpm-workspace.yaml` (with `overrides` for `qs` and `sharp` CVE fixes, dated comments), per-app `tsconfig.json`/`eslint.config.cjs`/`next.config.mjs`/`tailwind.config.ts`, `apps/api/.dependency-cruiser.cjs` (architecture boundary enforcement), root `.env.example` + per-app `.env.example`.

---

## 2. Runtime architecture (current, not planned)

**General flow**: Browser → Next.js (web/admin, App Router) → `apps/api` (Express, JSON REST) → PostgreSQL (Prisma) / Redis (ioredis) / local disk (media). Web and admin never talk to Postgres directly (verified — no `@woobe/database` imports in either app; the only hits are comments documenting the rule).

**Authentication**: JWT access token (short-lived) + refresh token pair. Refresh token delivered via httpOnly cookie (`app.ts`, ADR-018); access token held in memory only on both web and admin (never localStorage — confirmed by grep, zero `localStorage`/`sessionStorage` token usage). One reactive 401 → silent-refresh → retry flow in each app's `api-client.ts`. Google Sign-In supported via `google-auth-library` `verifyIdToken` (server-side ID-token verification, not full OAuth code exchange). Registration/password-reset use OTP + email verification tables (`EmailVerification`, `PasswordReset`).

**Cart flow**: Cart persisted in Postgres (not Redis). Guest carts (`Cart.userId` nullable) merge into the account cart on login (`merge-guest-cart.use-case.ts`). Line totals are never stored — recomputed live on every read (`compute-cart-totals.ts`), consistent with weight-based pricing being live business logic, not a cached snapshot.

**Checkout flow**: Single Postgres transaction (`TransactionPort.run`) wraps, in order: cart row lock (`SELECT...FOR UPDATE`) → coupon row lock + redemption-count check → live weight/GST/shipping recompute → inventory reservation (row-locked per variant) → order insert (full money/weight/tax snapshot) → coupon redemption finalize → cart marked converted. Comments in the code cite specific historical race conditions (double-click, client retry) that this design fixes — this is a genuine, tested Unit-of-Work pattern, not a happy-path illusion.

**Payment flow**: Razorpay is the only online gateway; COD is also supported as a separate path. Webhook handling (`handle-razorpay-webhook.use-case.ts`) verifies the signature *before* any DB work, then applies idempotent, conditional status transitions guarded by a `(provider, eventId)` unique constraint on `WebhookEvent` — out-of-order delivery (e.g., `failed` arriving after `captured`) is explicitly caught and returned as a non-retriable "stale" response rather than a 5xx, avoiding provider retry storms.

**Order flow**: `Order` rows are immutable snapshots (money/weight/tax fixed at creation). Status transitions (`PENDING_PAYMENT → CONFIRMED/PAYMENT_FAILED → PROCESSING → PACKED → SHIPPED → DELIVERED/RETURNED_TO_ORIGIN/CANCELLED`) go through the same conditional `WHERE status = X` repository primitive from every calling use case — not duplicated per use case.

**Inventory reservation flow**: Reservation happens *inside* the checkout transaction (not deferred to payment time), via `SELECT ... FOR UPDATE` per variant row in `inventory.repository.ts`. This correctly matches the business's single-unit/limited-inventory requirement. Finalization/release of the reservation happens later from the payment webhook, branching for COD vs. online payment.

**Returns/refunds flow**: Separate `Return`/`Refund` modules and models (not folded into `Order.status`). Return request → eligibility check (`resolve-return-eligibility.ts`) → admin approve/reject → refund issuance via Razorpay refund gateway on approval. `Refund.returnId` is a unique nullable FK — DB-enforced one-refund-per-return.

**Testimonial flow**: `Testimonial` (replaces a since-removed per-product `Review` model, migrated 2026-09-10 with zero rows lost) is `@@unique(orderId)` — one testimonial per order — with a moderation state machine `PENDING → APPROVED/REJECTED` (terminal, no resubmission).

**Background jobs**: A single BullMQ queue, `notifications`, is the only background job mechanism in the system. All transactional email except registration OTP goes through it (order confirmation/status, return/refund notices, password-reset confirmation). Registration OTP email is sent **synchronously** on the request path, deliberately (comment: "the user is on the screen waiting for the code; must not depend on the BullMQ worker") — a slow/down SMTP server directly slows or fails that one HTTP request.

**Media uploads**: `multer` (memory storage) → `LocalDiskMediaStorageService` writes the raw buffer to `MEDIA_UPLOAD_DIR` (default `uploads/`) via `node:fs/promises`, no resize/compression/reformatting, served back via `express.static` at `/uploads`. This is explicitly a placeholder behind a `MediaStoragePort` interface, documented in multiple comments as swappable for S3/Cloudinary later — confirming that integration does not exist yet.

**Caching**: A single Redis-backed, versioned cache-aside layer (`shared/cache/catalog-cache.ts`) covers product list, product detail, related products, categories, banners, and the home-page aggregate. A global `cache:catalog:version` counter is `INCR`'d on any catalog-affecting admin write; all cache keys are namespaced `cache:v<version>:<key>`, so a version bump makes old entries unreachable (they still occupy Redis until their own 60–300s TTL expires). Both reads and writes fail open (Redis error → live DB fallback, no user-facing failure).

---

## 3. Runtime processes

| Process | Entry point | Framework/runtime | State | Key env vars | External deps |
|---|---|---|---|---|---|
| **api (server)** | `apps/api/src/server.ts` | Express 4 / Node ≥22 | Stateless HTTP; graceful SIGTERM/SIGINT closes Prisma + Redis | `API_PORT`, `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `BCRYPT_SALT_ROUNDS`, `WEB_ORIGIN`, `ADMIN_ORIGIN`, `COOKIE_DOMAIN`, `COOKIE_SECRET`, `RAZORPAY_*`, `API_PUBLIC_URL`, `MEDIA_UPLOAD_DIR`, `SMTP_*`, `GOOGLE_CLIENT_ID` (all validated by a fail-fast Zod schema in `config/env.ts`) | Postgres, Redis, Razorpay, SMTP (optional — dev fallback), Google Identity Services, local disk |
| **api (worker)** | `apps/api/src/worker.ts` | BullMQ `Worker` / Node | Long-running consumer, no held state between jobs; graceful shutdown | Same DB/Redis/SMTP vars as server — explicitly documented as its **own deployable process** needing its own env copy | Postgres, Redis (BullMQ), SMTP |
| **web** | `apps/web/app/` | Next.js 15.5.25 / React 19 | Stateless SSR+CSR | `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_WHATSAPP_NUMBER`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `apps/api` over HTTP only |
| **admin** | `apps/admin/app/` | Next.js 15.5.25 / React 19 | Stateless | `NEXT_PUBLIC_ADMIN_API_URL`, `NEXT_PUBLIC_SITE_URL` | `apps/api` over HTTP only |
| **postgres** | `docker-compose.yml` | postgres:16-alpine | Stateful, host port 5433 (offset to avoid a local native Postgres) | `POSTGRES_USER/PASSWORD/DB` | — |
| **redis** | `docker-compose.yml` | redis:7-alpine | Stateful, host port 6380 (offset to avoid a local Redis) | none | — |

In dev, `pnpm dev` runs all app processes in parallel on the host (`concurrently`), not containerized — only Postgres/Redis run in Docker. No compose service exists for api/web/admin/worker; production containerization for these is planning-stage only.

---

## 4. Database architecture

**33 Prisma models** (`packages/database/prisma/schema.prisma`): identity/auth (`User`, `RefreshToken`, `EmailVerification`, `PasswordReset`, `AuthCredential`, `StaffInvitation`, `Address`); inventory (`Warehouse`, `Inventory`); catalogue/pricing (`Category`, `Collection`, `Banner`, `ProductCollection`, `Product`, `ProductImage`, `ProductVariant`, `PricingSetting`, `GstSlab`); cart (`Cart`, `CartItem`, `Wishlist`, `WishlistItem`); coupons (`Coupon`, `CouponProduct`, `CouponCategory`, `CouponRedemption`); shipping (`ShippingRule`); orders/payments/returns (`Order`, `OrderItem`, `AdminAuditLog`, `Payment`, `WebhookEvent`, `Return`, `ReturnItem`, `Refund`); content (`Testimonial`, `TestimonialImage`, `Media`); jobs (`Notification`).

**Product / ProductVariant / Inventory**: Inventory is **per-variant, quantity-based, single-warehouse** — `Inventory` is keyed `@@unique([variantId, warehouseId])` with `quantityAvailable`/`quantityReserved` integer columns (not a single-unit boolean flag; the "limited/single-unit" business reality is expressed as low integer quantities per variant, reserved via row locks at checkout).

**Weight-based pricing** (core business logic) spans several fields, deliberately never cached for money decisions:
- `ProductVariant.weightGrams` — required on every variant.
- `Category.pricingMode` — `WEIGHT_BASED` | `FIXED` enum, a hard per-category rule.
- `PricingSetting.defaultRatePerKgPaise` — single global, effective-dated rate; the source of truth for weight-based pricing.
- `ProductVariant.fixedPricePaise` — authoritative only when the category is `FIXED`.
- `ProductVariant.effectivePricePaiseCache` / `Product.minPricePaiseCache` — **display-only** denormalized caches; explicitly never read at checkout (checkout always recomputes live from `weightGrams` × the current rate).
- `ProductVariant.ratePerKgOverridePaise` — deprecated, retained in schema, ignored by all pricing logic.

**Cart / CartItem**: `Cart.id` doubles as the cookie-issued cart identifier; `userId` is nullable + unique, distinguishing guest vs. logged-in carts and enabling merge-on-login. `CartItem` stores no price — always live-recomputed. `@@unique([cartId, variantId])`.

**Order / OrderItem / Payment / Refund / Return**: `Order` stores a full immutable money/weight/tax snapshot at creation. `Payment` is `@@unique([orderId])` — DB-enforced one-payment-per-order (the schema comment notes this was promoted from a plain index after a real race was found). `Return`/`Refund` are separate entities from `Order`; `Refund.returnId` is a unique nullable FK, DB-backstopping one refund per return. Cascade behavior: owned child rows (`RefreshToken`, `AuthCredential`, `CartItem`, `ProductImage`, `ProductVariant`, coupon join rows, `TestimonialImage`) cascade-delete with their parent; `Cart.userId` is `SetNull` on user deletion; `Order`/`Return`/`Refund`/`OrderItem.variant` have **no** cascade — deleting a `User` or `Product` referenced by existing order history is blocked at the DB level, protecting financial records.

**Testimonial / Media / User**: `Testimonial` has the moderation lifecycle described in Section 2. **`Media` is the only model with a soft-delete pattern** (`MediaStatus.ACTIVE`/`DELETED`) — enforced in `delete-media.use-case.ts` and `media.repository.ts`; the row is retained for audit while the URL stops resolving and the file is removed from disk. No other model has (or needs) a soft-delete flag — everything else is either hard-deleted in a cascade-scoped way or intentionally immutable/append-only (`Order`, `OrderItem`, `Payment`, `WebhookEvent`).

**Indexes**: `Product` has a `pg_trgm` GIN index on `name` for `ILIKE` search plus `@@index([categoryId])`, `@@index([categoryId, minPricePaiseCache])`, `@@index([minPricePaiseCache])`, `@@index([createdAt])` — tuned directly to the PLP's filter/sort paths. `CouponRedemption.@@index([couponId, userId])` is deliberately composite specifically to keep the row-locked checkout-time redemption count scan fast (the schema comment explains that an unindexed scan here would extend lock hold time). `Order.@@index([userId])` / `@@index([status])`; `OrderItem.@@index([orderId])`. No obviously missing index was found for Cart/Inventory (Inventory's only lookup path is its own unique composite key, which doubles as the lock key), and no over-indexing was found.

**Migrations**: 19 migrations, additive-only by policy (ADR-013, enforced in CI — see Section 3/17). One genuine destructive migration exists (`20260910185907_replace_reviews_with_testimonials`, dropping the old `Review`/`ReviewImage` tables), justified in-repo because zero rows existed anywhere at removal time. `20260825150147_extend_role_enum` added an enum value it can't cheaply retract (Postgres enum limitation) — a legacy value remains. No unreviewed/unexplained destructive migration was found.

**Transactions and row locking** — extensive and real, not just comments:
- Inventory reservation: `SELECT ... FOR UPDATE` per variant row, `apps/api/src/modules/inventory/infrastructure/repositories/inventory.repository.ts:220-260`.
- Cart lock at checkout: `FOR UPDATE` on the cart row, `apps/api/src/modules/cart/infrastructure/repositories/cart.repository.ts:59-66`.
- Coupon redemption: `FOR UPDATE` on the coupon row before counting redemptions, `apps/api/src/modules/coupons/infrastructure/repositories/coupon.repository.ts:58-59`.
- Super-admin safety: locks every active `SUPER_ADMIN` row before a role change, `apps/api/src/modules/auth/infrastructure/repositories/auth.repository.ts:459-470`.
- Plain (non-raw) `$transaction` used for address CRUD, banner/category/collection reordering, product updates, and the generic Unit-of-Work port used by checkout/webhook use cases (`transaction.repository.ts`).

**Connection pool**: No `connection_limit`/PgBouncer parameter on `DATABASE_URL` anywhere; one `PrismaClient` singleton per process, cached on `globalThis` in dev. Since `server.ts` and `worker.ts` are separate OS processes, each opens its own default Prisma pool (~`num_cpus*2+1` connections) with **no tuning for expected concurrency** and no pooler in front of Postgres. This is unconfigured, not deliberately sized — worth addressing before horizontal scaling.

**Includes/N+1**: Sampled hot paths (product listing, admin product detail, cart, order reads) all use shallow, `select`-scoped includes (1-2 levels) — no 3+-level nested includes or full-row over-fetching found. A repo-wide grep for Prisma calls inside `for`/`.map(async`/`.forEach(async` loops returned **zero hits** — no N+1 loop pattern found in the code that was read.

---

## 5. Redis

Single shared `ioredis` client (`apps/api/src/config/redis.ts`, `maxRetriesPerRequest: 3`) used by everything except BullMQ, which needs its own connection (`maxRetriesPerRequest: null`, required for blocking commands). The Redis error handler only logs — it never crashes the process.

| Use case | Key pattern | TTL | Bounded? | Class | Outage behavior |
|---|---|---|---|---|---|
| Route rate limiting (login/register/password-reset/testimonials/staff-activation) | `ratelimit:<prefix>:<ip>` | Set on first hit, per-route window (10–60 min) | Self-expiring; steady-state bounded | Disposable | **Fails open** (Redis error → request proceeds unlimited, deliberate/documented) |
| Guest order-claim attempt limiter | `guest-order-claim:<key>` | 1 hour | Self-expiring | Disposable | **No try/catch found** — appears to fail *closed* (throws), inconsistent with the rest of the system's stated fail-open philosophy |
| Catalog cache version counter | `cache:catalog:version` (single key) | None (permanent counter) | Bounded (1 key) | Self-healing (miss → version 0) | Fails open on both read and write |
| Catalog read-through cache | `cache:v<version>:<caller key>` (product list/detail/related, categories, banners, home) | 60–300s depending on entity | TTL-bounded; product-list key space is combinatorial over filters but self-expires within 60s | Disposable/cache, never a source of truth for price/stock | Fails open |
| BullMQ `notifications` queue | Internal `bull:notifications:*` keys | Managed by BullMQ; completed jobs removed immediately, failed jobs capped at 1000 | Bounded (explicit `removeOnFail: 1000`) | Correctness-relevant for email delivery, but DB row is the real source of truth | UNKNOWN (library-internal) |

**Not found** despite being named as intended use cases in a code comment on `config/redis.ts` (ADR-017): sessions in Redis (auth is JWT + a Postgres `RefreshToken` table), inventory reservation locks in Redis (actually Postgres row locks — see Section 4), pub/sub, Redis-based idempotency keys for payments (idempotency is DB-based throughout). **This is a documentation/implementation drift worth flagging** — the comment overstates what Redis is actually used for today.

The `docker-compose.yml` Redis service has **no `maxmemory`, no eviction policy, no persistence flags, and no resource limits** — it runs on defaults, meaning unbounded memory growth under real load is possible with no configured backstop.

---

## 6. Background jobs / worker

**BullMQ is genuinely used** — `apps/api/src/worker.ts` is a real standalone consumer process, not a cron/polling stub. There is exactly **one queue**, `notifications`.

- **Producer**: `BullMqNotificationQueue.enqueue()`, called by `EnqueueNotificationUseCase`, itself invoked from auth (OTP/reset confirmations, Google-auth notices), orders (`notify-order-event.use-case.ts`), and returns/refunds use cases.
- **Consumer**: the `Worker` in `worker.ts`, calling `ProcessNotificationJobUseCase.execute(job.data.notificationId)`.
- **Concurrency**: not set → BullMQ default of **1 concurrent job per worker process**.
- **Retries/backoff**: `attempts: 3`, exponential backoff starting at 5s.
- **Timeout**: no explicit `lockDuration`/job timeout override — relies on BullMQ defaults; UNKNOWN whether this is safe against a slow SMTP send.
- **Idempotency**: two layers — a `jobId: notificationId` BullMQ-level dedup (explicitly documented as "belt-and-suspenders, not load-bearing") and the real guarantee, an atomic Postgres `claimForSending` conditional status transition (`PENDING → SENDING`) taken before the send — a lost race is a silent no-op, so at-least-once delivery can never double-send. A retryable failure calls `releaseClaim` to allow a genuine retry.
- **Cleanup**: `removeOnComplete: true`, `removeOnFail: 1000` — bounded, not left to grow Redis forever.
- **Failure behavior**: non-retryable errors are converted to `UnrecoverableError` and stop immediately; other errors retry per the 3-attempt cap; final failure or unrecoverable error always persists a terminal `FAILED` state in Postgres — no silent drop, no infinite retry.
- **Payload**: `{ notificationId }` only — the actual content is re-read from Postgres inside the use case, never trusted from the job payload. Payload size is not a risk.
- **Multi-replica safety**: appears safe — the Postgres `claimForSending` transition is the actual concurrency-safety mechanism, independent of and stronger than BullMQ's own guarantees; the only process-wide state (the Nodemailer transport) is per-process by design.
- **A real historical incident is documented in-repo**: the worker was, at one point, never actually started in local dev, so 12 real notifications sat permanently `PENDING` with the queue silently accumulating — fixed by wiring `worker` into the `dev` script. This demonstrates the queue has **no self-healing or alerting** if its consumer isn't running; jobs just accumulate with no visibility (ties into Section 17's observability gap).
- **Scale risk**: concurrency defaults to 1, so all transactional email (order confirmations, return/refund notices, etc.) is processed strictly serially by a single worker process — a legitimate scale bottleneck at higher order volume, though decoupled from the checkout request path so it doesn't block checkout itself.

---

## 7. Next.js storefront (`apps/web`)

**Rendering split**: Catalog-facing routes are genuine SSR of live data: home (`export const dynamic = "force-dynamic"`), `products/[slug]`, `products` (list, reads `searchParams`), `collections/[slug]` — all fetch server-side and are not client-shelled. All other routes (`cart`, `checkout`, `account/*`, `login`, `register`, `forgot-password`, `wishlist`, `order-confirmation/[id]`, `how-it-works`) are thin server wrappers that immediately delegate to one large client component; these pages are also marked `robots: { index: false }` (deliberate, SEO-appropriate) but as a side effect **get zero server-rendered content** — first paint is an empty shell until the client-side fetch completes. This is a systemic pattern on the highest-value transactional pages (cart, checkout), not a one-off. No `generateStaticParams` is used anywhere — the catalog is always dynamically rendered per an explicit "ADR-026" policy cited in code comments.

**Client components**: 76 `"use client"` files repo-wide. Every sampled large one (PromoCarousel, HeaderSearch/SearchField, ProductGallery, OrderConfirmation, OrderPlacementCelebration, useGuestLoginPrompt/GuestLoginPrompt, CartProvider/AuthProvider/WishlistProvider) has a real, justified reason (timers, listeners, context, browser APIs). `providers.tsx` is itself `"use client"` specifically so `layout.tsx` can remain a Server Component — a deliberate, documented boundary. **No unnecessarily-client component was found** in this pass.

**Data fetching**: `providers.tsx` composes `AuthProvider > CartProvider > WishlistProvider`; `api-client.ts` is the sole HTTP boundary with in-memory access-token handling and one 401-retry-after-silent-refresh. No duplicate/overlapping queries found; no `refetchInterval` polling anywhere. The only "polling" is `OrderConfirmation`'s bounded `setTimeout`-based `pollUntilConfirmed` loop, used because Razorpay's client-side success callback isn't authoritative — a deliberate, correctly-guarded (`isMountedRef`) pattern, not a leak.

**Images**: Only 1 file uses `next/image`; 12 use raw `<img loading="lazy">` — this is a **deliberate decision**, documented in a code comment: product image URLs aren't yet in `next/image`'s configured `remotePatterns` because there's no CDN/S3 yet (ties to Section 6's finding that media storage is local-disk only). Worth revisiting once real CDN-backed URLs exist.

**Timers/listeners/leak audit**: `PromoCarousel`, `useCountdown`, `useFilterResultCount`/`useSearchSuggestions` (debounce + `AbortController`, correctly cancels in-flight requests), `useGuestLoginPrompt` (5-min interval, cleared on unmount and on dismiss) — all **fine**, proper cleanup. Two **POSSIBLE** (not confirmed) risks worth a direct read: `OrderPlacementCelebration.tsx` chains 4 `setTimeout`s for its animation sequence and full unmount-cleanup coverage wasn't independently verified for all four; and `GuestLoginPrompt.tsx`/`SearchField.tsx`/`HeaderSearch.tsx` use `document.addEventListener` for keydown/pointerdown without the matching `removeEventListener` being directly re-verified in this pass. No `IntersectionObserver`/`ResizeObserver`/`WebSocket` usage anywhere.

**Browser storage**: only one use of Web Storage in the entire storefront — `sessionStorage` for the guest-login-prompt dismissal flag, wrapped in try/catch. No auth tokens in any browser storage (see Section 2).

**Bundle**: dependencies (`motion`, `embla-carousel-react`, `canvas-confetti`, `sonner`, `react-hook-form`) are all reasonably scoped to real UI needs; no oversized library for trivial use found.

---

## 8. Admin application (`apps/admin`)

**Tables**: No shared `DataTable` primitive — 10 near-identical, independently-implemented table components (Products, Inventory, Orders, Customers, Staff, Banners, Categories, Collections, Coupons, Returns), each reimplementing markup/empty/loading states. Real reusability debt (Section 10), not a correctness bug.

**Pagination — CONFIRMED bug**: the API contract fully supports server-side pagination (`{ page, pageSize } → { items, total }`), but every list page component **hardcodes `page: 1`** and no file anywhere references `setPage`/`nextPage`/`totalPages`/a pagination control. `total` is returned by every hook but never read. **Any product/order/customer/inventory list beyond its default page size (50, or 100 for inventory) is permanently invisible to staff, with no indication anything is missing.** This will worsen directly as order/customer volume grows toward the stated 10k–20k users/day target.

**Filters**: local `useState`, server-side query params (not client-side filtering of an over-fetched set) — well-designed in that respect. **No debounce** on any search input (grep-confirmed zero `debounce`/`useDebounce` usage) — every keystroke fires a new request. A code comment in `api-client.ts` claims AbortSignal-based stale-request cancellation is "threaded through," but **no hook actually passes a `signal`** into any list-fetch function — the cancellation described in the comment does not exist in the code. Rapid typing therefore fires uncancelled, racing requests.

**React Query config**: `staleTime: 10s`, `refetchOnWindowFocus: false`, smart retry (skips 401/403/404/422). No `refetchInterval` anywhere — zero polling, including on the orders dashboard (a product gap for "new order" visibility, not a performance risk). `invalidateQueries` calls are all correctly entity-scoped (23 call sites checked) — no over-invalidation found.

**Image previews**: plain `<img>` used deliberately (documented, mirrors the web app's reasoning); uploads go at full original resolution with no client-side resize/compression.

**Forms**: two coexisting, intentional patterns — manual `useState` + `useFormError` for most entity forms (with essentially no client-side validation; all real validation is server-round-tripped), and `react-hook-form` + `apply-backend-field-errors` for Login/NewStaff/ActivateStaff. Not accidental duplication — each hook maps backend field errors for its own form paradigm.

**State management**: no Redux/Zustand — React Query cache plus one `AdminAuthContext`. Minimal and appropriate.

**Memory leaks**: only 5 files use `useEffect` at all; zero `setInterval`/`addEventListener`/`IntersectionObserver`/`ResizeObserver`/`WebSocket` anywhere. One minor **POSSIBLE** gap: `products/page.tsx`'s category-fetch-on-mount effect has no cancellation flag, so a stale response could overwrite state after a fast unmount/token-change — low impact, easy fix.

**Large datasets**: inventory/products correctly push filtering/sorting/pagination to the API server-side — no "fetch all and filter in JS" pattern found (the missing pagination UI above is a display bug, not a fetch-everything bug — the API itself is only ever asked for one page).

**Dead code**: heuristic cross-reference found no unreferenced admin components.

**Auth**: single, centralized route guard at `app/(dashboard)/layout.tsx` covering every dashboard route — not duplicated per page.

---

## 9. API architecture

Route → controller → use case → repository → Prisma/external service is **genuinely followed**, not name-only: application-layer use cases depend exclusively on `ports/*.port.ts` interfaces; infrastructure implements them; a `dependency-cruiser` rule (`apps/api/.dependency-cruiser.cjs`, wired into CI as `boundaries:check`) enforces that only `<module>/infrastructure/**` may import `@woobe/database`/`@prisma/client`, and a second rule forbids circular module imports. This is unusually rigorous discipline for a project this size, and it's actually enforced, not aspirational.

**SOLID findings** (concrete, not generic):
- **ISP/SRP violation, confirmed**: `apps/api/src/modules/products/infrastructure/repositories/product.repository.ts` — 681 lines, 28 public methods, mixing public storefront reads (`findMany`, `findBySlug`, related-products) with admin-only writes (`createProduct`, `updateVariant`, `addImage`, `reorderImages`, `recomputeMinPrice`, `slugExists`) behind what appears to be one interface. `auth.repository.ts` (624 lines) is the second-largest and likely shows the same read/write mixing (not fully verified).
- **Minor domain-logic-in-infrastructure leak**: `product.repository.ts` also performs `recomputeMinPrice` — a derived-value computation that arguably belongs in the domain/application layer, not the repository.
- **DIP**: correctly followed everywhere sampled (orders, payments, inventory, cart, auth) — no direct Prisma imports outside infrastructure.
- **No circular dependencies, no OCP/LSP violations, no business logic in controllers** found in the sampled modules — controllers are thin adapters (guard → validate → `use-case.execute()`).

**Duplication**: pricing/GST computation is centralized (one call site in checkout, one in cart display — both deliberately live, not accidentally duplicated); pagination is capped consistently via a shared Zod schema (max 50); order status transitions go through one repository primitive. **Real gap**: rate limiting is applied to only 4 route groups (auth, admin-auth, staff-activation, testimonials) — cart mutation routes and the public product-listing route have none.

**Error handling**: a single global handler maps `DomainError` subclasses to their own status/code/message; unexpected errors return a generic `500` with no stack trace or internal detail leaked to the client (verified, not just claimed) — request-id is included for server-side log correlation. No empty catch blocks found; the one deliberate error-swallow (a non-critical address-save failure during checkout) is explicit, logged, and commented.

**Observability**: no structured logging library anywhere — every log call sampled is raw `console.error`/`console.log`, not JSON, not leveled, and the generated request-id is interpolated into log strings rather than attached as structured metadata (so log search at scale would mean string-grepping). `/health` returns a static `{status:"ok"}` with **no DB/Redis connectivity check** — not a real readiness probe. No metrics endpoint, no queue-depth or slow-query visibility. No dangerous logging (secrets/PII) was found.

**Security/perf intersection**: webhook signature verification happens before any DB work (correct ordering, good DoS defense). Pagination is capped at the validation layer (max 50) — a client cannot request unbounded page sizes. Express's JSON body parser has no explicit size-limit override found (Express's 100kb default would apply). Gaps: cart routes (guest-accessible) and the public product-listing route have no rate limiting at all.

---

## 10. Code reusability / duplication

- **Admin tables**: 10 near-identical table components with no shared `DataTable` — the most significant reusability debt found (Section 8).
- **Role/permission enums, two sources of truth**: `packages/validation/src/staff.schema.ts` hand-declares `STAFF_ROLE = [SUPER_ADMIN, ORDER_PROCESSING_STAFF, PRODUCT_MANAGEMENT_STAFF]`, a hand-duplicated subset of `packages/types/src/enums.ts`'s `ROLE` (which also includes `CUSTOMER`). Two independently-maintained lists for overlapping concepts across two packages — a drift risk if one changes without the other.
- **Pricing/GST calculation**: centralized correctly (checkout and cart display each independently recompute live from the same source data — not accidental duplication, a deliberate correctness choice per code comments).
- **Pagination**: single shared cap (Zod, max 50) — not duplicated per module.
- **Rate limiting**: single shared middleware factory reused across all guarded routes — not duplicated, but under-applied (Section 9/18).
- **Order status transitions**: single repository primitive reused by every status-changing use case — not duplicated.
- **Form error handling (admin)**: two parallel but each internally-consistent patterns for two different form styles — not accidental duplication.
- **Catalog caching**: one mechanism (`catalog-cache.ts`) for all cached entities — no duplicate/competing cache layer found.

---

## 11. Memory leak audit

No CONFIRMED memory leaks were found anywhere in the codebase.

**LIKELY**: none identified.

**POSSIBLE** (worth a direct read, low confidence of actual impact):
- `apps/web/src/features/checkout/components/OrderPlacementCelebration.tsx` — 4 chained `setTimeout`s for a phased animation; full cleanup-on-unmount coverage for all four was not independently re-verified.
- `apps/web` — `GuestLoginPrompt.tsx`, `SearchField.tsx`, `HeaderSearch.tsx` use `document.addEventListener` for keydown/pointerdown; matching `removeEventListener` on cleanup was not independently re-verified in this pass (a prior, separate reviewer pass on this component tree found no issue, but it wasn't re-confirmed line-by-line here).
- `apps/admin/app/(dashboard)/products/page.tsx` — category-fetch-on-mount effect has no `cancelled` guard (unlike the pattern used correctly elsewhere in the same app, e.g. `useAdminAuth.tsx`); a very-fast unmount/token-change could `setState` after unmount. React 18 tolerates this silently (no crash), so impact is minimal.

Everything else audited (storefront: PromoCarousel, useCountdown, useFilterResultCount/useSearchSuggestions, useGuestLoginPrompt, ScrollToHashOnLoad, OrderConfirmation's poll loop; admin: all 5 `useEffect` usages) has correct, verified cleanup (`clearInterval`/`clearTimeout`/`AbortController`/`cancelled` flags/cleanup-returning effects). No unbounded in-memory arrays/maps/caches were found; the Redis catalog cache is TTL-bounded, not an in-process leak.

---

## 12. Performance audit

**No N+1 queries found** (Section 4) — a repo-wide grep for Prisma calls inside loops returned zero hits. **No over-fetching found** in sampled hot paths — includes are shallow and `select`-scoped.

**Real performance-relevant findings**:
- **Storefront waterfall on transactional pages**: cart, checkout, account, orders, wishlist pages are pure client-rendered shells (Section 7) — every one of them is a server-render → client-mount → API-fetch waterfall by construction, on exactly the pages where speed matters most for conversion.
- **Admin: no debounce + no real request cancellation on search** (Section 8) — every keystroke in any admin filter fires an uncancelled network request; a documented-but-unimplemented AbortSignal claim compounds this (the code that would prevent request pile-up doesn't exist despite a comment saying it does).
- **Synchronous SMTP send on the registration OTP path** (Section 2/6) — a slow/down SMTP server directly slows or fails that HTTP request; this is the only place email is not decoupled from the request path, and it's deliberate, but it is still a real latency/availability dependency worth knowing about.
- **Notification worker concurrency = 1** (Section 6) — serializes all transactional email through a single lane; not currently a request-path problem, but a growing-backlog risk under order bursts.
- Catalog caching (Section 5) already mitigates what would otherwise be the highest-read-volume path (product listing/detail/home) — this is a genuine strength, not a gap.

---

## 13. Database load risks (ranked)

1. **Highest**: Checkout transaction — three sequential row locks (cart, coupon, inventory-per-variant) inside one transaction, on the write path most exposed to bursty traffic (flash sales, coupon drops). Correctness is solid (Section 4), but this is inherently the highest lock-contention, longest-held-transaction path in the system, and worth load-testing specifically for lock-wait behavior under concurrent checkouts for the same low-stock variant.
2. **High**: Coupon redemption counting — the `FOR UPDATE` lock on the coupon row during checkout means every concurrent checkout using the *same* coupon serializes on that one row; a popular, unlimited-use coupon during a promotion could become a bottleneck (the composite index mitigates the scan cost, not the lock contention itself).
3. **Moderate**: Admin list queries — bounded (page size 50–100, no fetch-all pattern), but with no debounce/cancellation (Section 8/12), a busy admin user browsing/searching generates more Postgres round-trips than necessary; each individual query is cheap and indexed, so this is a multiplier-of-cheap-things risk, not an expensive-query risk.
4. **Low**: Public catalog reads (product list/detail/home) — already cache-mitigated (Section 5); direct DB load only occurs on cache miss (every 60–300s) or explicit cache-busting writes.

**Connection pool risk** (cross-cutting, not endpoint-specific): with no `connection_limit`/PgBouncer configured (Section 4), scaling either `apps/api` or the worker to multiple replicas multiplies default-sized Prisma pools with no coordination — this is a real risk that would surface as connection exhaustion under horizontal scaling, independent of any single endpoint's query cost.

---

## 14. AWS cost risks

| Risk | Cause | Resource affected | Why it can become expensive | Severity |
|---|---|---|---|---|
| Local-disk media storage | `LocalDiskMediaStorageService` writes to the container's local filesystem, no resize/compression | Would-be S3 + CloudFront + EBS/EFS | Full-resolution images stored/served with no optimization means larger storage and higher egress once real image traffic exists; today this is dev-only (no S3 usage yet), but it's a rework, not a config change, once cloud media lands | Medium (blocking architectural gap, not an active cost today) |
| No CDN in front of images | 12 of 13 image usages in the storefront are raw `<img>` (Section 7), by design until real CDN URLs exist | CloudFront | Every image request currently round-trips to the API's local disk with no edge caching — once deployed, this multiplies origin egress and compute vs. a CDN-fronted setup | Medium |
| Short catalog cache TTLs (60s for high-traffic paths) | `catalog-cache.ts` TTLs | ElastiCache/Redis compute, RDS/Aurora read compute on miss | At 10k–20k users/day this is a reasonable trade-off (freshness vs. cost) and not clearly wrong, but it's worth knowing 60s is the floor for how often a popular product-list permutation re-hits Postgres | Low |
| Unstructured, high-volume console logging | Every log call is raw `console.error`/`console.log` (Section 9/17) | CloudWatch Logs ingestion | At 10k–20k users/day, unleveled request/error logs with no sampling could generate meaningful CloudWatch ingestion + storage cost, and would be hard to query without structured fields, compounding the cost of actually using the logs | Medium |
| No dependency/security audit gate in CI | `.github/workflows/ci.yml` has no `pnpm audit` step (Section 19) | Indirect (incident response cost) | CVE overrides (`qs`, `sharp`) were found and patched manually — without an automated gate, a future vulnerable transitive dependency could ship silently, with the associated incident-response cost if exploited | Low-Medium |
| Notification worker concurrency = 1 | `worker.ts`, no concurrency override | Compute (if scaled reactively) / SES or SMTP cost is unaffected | Not a direct cost risk today, but a naive fix under load ("just add more worker replicas") interacts with connection-pool sizing (Section 13) — scaling this component isn't free without also addressing pool limits | Low |

No evidence of runaway retries, unbounded polling, oversized responses, or repeated cache invalidation storms was found — the existing caching and job-retry design (bounded attempts, TTL-bounded keys) is actually cost-conscious by construction.

---

## 15. Scaling risks (10k–20k users/day)

Most likely first failure points, in rough order of concern:

1. **Media storage on local disk is incompatible with the planned EKS deployment as-is.** Multiple replicas of `apps/api` behind a load balancer, or pod rescheduling, would each see a different (or empty) local filesystem — an upload written to one pod's disk would 404 when served from another. This must be replaced with S3/Cloudinary (the port/adapter seam for this already exists and is ready) **before** any multi-replica or Kubernetes deployment, not after.
2. **Postgres connection pool exhaustion under horizontal scaling.** No `connection_limit`/PgBouncer is configured; scaling `apps/api` and/or the worker to N replicas each opens a default-sized Prisma pool with no coordination — a real risk of hitting Postgres's `max_connections` well before CPU or query cost becomes the bottleneck.
3. **Redis has no memory limit or eviction policy.** Under sustained real traffic (larger, more diverse catalog cache key space; more concurrent rate-limit keys), Redis could grow unbounded with no configured backstop, risking an OOM of the Redis process itself — which would then cascade into the (correctly fail-open) caching and rate-limiting paths falling back to un-cached, un-limited behavior simultaneously.
4. **Notification worker concurrency = 1** becomes a real backlog risk specifically during order bursts (flash sales, festival traffic) — email delivery would lag further and further behind order volume with no autoscaling signal to react to (no queue-depth metric exists — see Section 17).
5. **No real readiness/health check.** `/health` doesn't verify DB/Redis connectivity, so a Kubernetes liveness/readiness probe based on it would keep routing traffic to a pod that can't actually reach its dependencies — this directly undermines safe autoscaling and rolling deploys.
6. **Coupon-row lock contention** (Section 13) under a popular promotional coupon during a traffic spike is a plausible checkout-latency source specifically at the "bursty checkout traffic" scenario the project context calls out.
7. **Admin per-keystroke, uncancelled search requests** (Section 8/12) would multiply Postgres round-trips during "many admin operations during working hours," though each is cheap and indexed — a multiplier risk, not a collapse risk.
8. **IP-based (not account-based) rate limiting** is a known, documented gap in the code itself — at 10k+ daily users behind shared NATs/mobile carriers, this could produce false-positive throttling of legitimate users, an availability risk more than a security one at this scale.

Not a near-term risk: the Node event loop, Next.js rendering cost, and S3/bandwidth (since S3 isn't wired up yet) — none of these showed evidence of being close to a limit at the traffic levels described.

---

## 16. Error handling

The global Express error handler (`middleware/error-handler.ts`) is consistent and secure: `DomainError` subclasses map to their declared HTTP status/code/message (+ field errors where applicable); anything else returns a generic `500` with no internal detail (stack trace, Prisma error text) leaked to the client, while still logging server-side with the request-id for correlation. No empty catch blocks or obviously swallowed errors were found; the one deliberate swallow (a non-critical address-save failure inside checkout) is explicit and logged.

**A real inconsistency**: `RedisClaimAttemptLimiterService` (guest order claim, Section 5) has no try/catch around its Redis call, unlike every other Redis-touching guard in the codebase (rate-limit middleware, catalog cache) which all deliberately fail open. This means a Redis blip would likely surface as an uncaught error (500) on the guest-order-claim endpoint specifically — worth confirming with a live test and either adding the same fail-open handling or explicitly documenting why this one path should fail closed.

**A documented-but-not-implemented claim**: the admin `api-client.ts` comment describing AbortSignal-based stale-request cancellation does not match the actual code (Section 8/12) — this is a discrepancy between intent and implementation that could mislead a future engineer into assuming protection against request pile-up exists when it doesn't.

No evidence of retry-amplification (unbounded retries, retry storms) was found — BullMQ's 3-attempt cap and the webhook handler's explicit "stale, don't retry" response to out-of-order events are both correctly bounded.

---

## 17. Observability

This is the weakest area found in the entire recon.

- **Structured logging**: none. Every log call sampled across the API (error-handler, rate-limit middleware, catalog-cache, worker) is a raw `console.error`/`console.log` string, not JSON, not leveled.
- **Request IDs**: generated (`middleware/request-id.ts`) and included in error logs, but only interpolated into log strings — not attached as structured, queryable metadata. No correlation ID propagation beyond that was found.
- **Metrics**: no metrics endpoint (no `/metrics`, no Prometheus client) anywhere in the code read.
- **Health/readiness checks**: `/health` returns a static `{status:"ok"}` with no dependency check — not a real readiness probe (Section 15 covers the operational impact of this).
- **Database/Redis/queue metrics**: none found — no queue-depth visibility for the BullMQ `notifications` queue (relevant given the documented past incident of the worker silently not running while jobs piled up, Section 6).
- **Slow-query visibility**: none found.
- **Error tracking**: no third-party error-tracking SDK (e.g., Sentry) was found in any `package.json`.
- **Dangerous logging patterns**: none found — no evidence of full request-body logging, secret/PII logging, or per-request high-volume INFO logging in the files sampled; a code comment explicitly states secrets/PII must not be logged (referencing an internal development-rules document).

At the target scale of 10k–20k users/day, this gap means the team would have very limited ability to detect degraded performance, a stuck queue, or a failing dependency before it becomes a customer-visible incident.

---

## 18. Security/performance intersection

- **Unauthenticated, unrated endpoints**: cart mutation routes (guest-accessible by design) and the public product-listing route have no rate limiting (Section 9) — the product-listing route is at least mitigated by caching and a hard pagination cap; cart mutation routes have neither mitigation.
- **Payments webhook**: correctly verifies signature before any DB work (good ordering — cheap rejection before expensive work), but has no rate limit of its own; acceptable given the signature check, though a flood of invalid-signature POSTs still costs some CPU/Redis lookups before rejection.
- **Guest order-claim limiter's inconsistent fail-closed behavior** (Section 5/16) is also a mild availability risk: if it does throw uncaught on a Redis blip, that's effectively a self-inflicted denial of service on a single endpoint during any Redis hiccup.
- **Body size limits**: no explicit override found for Express's JSON parser — Express's 100kb default would apply unless overridden elsewhere not found in this pass; UNKNOWN whether any route (e.g., admin bulk operations) needs more and silently doesn't get it, or whether media upload (via multer, a different code path) has its own limit.
- **Pagination caps are enforced** at the validation layer (max 50) — no endpoint found that would accept an unbounded page size.
- **Rate limiting is IP-based only**, not account-based — a known, documented gap in the code, more of an availability/UX risk (false positives on shared IPs) than a security hole at this stage.
- No SQL injection risk found — all DB access is via Prisma's parameterized query builder or explicitly parameterized `$queryRaw` calls for row-locking (Section 4); no string-concatenated raw SQL was found.
- No evidence of cache-poisoning risk in the catalog cache — cache keys are built from server-validated, bounded filter parameters, not raw unsanitized user input reflected into the key.

---

## 19. Dependencies

- **Version consistency**: no drift found — `react`, `next`, `zod`, `typescript`, `eslint`, `tailwindcss`, `lucide-react`, `sonner` are pinned to identical ranges everywhere they appear across all 3 apps and 6 packages.
- **No cross-boundary leakage**: no server-only package (`bcryptjs`, `jsonwebtoken`, `ioredis`, `bullmq`, `nodemailer`, `@prisma/client`) appears in `apps/web` or `apps/admin`; no frontend package (`react`, `next`) appears in `apps/api`. The `@woobe/database` "web/admin must not import this" rule (ADR-019) is followed — the only grep hits in either app are comments documenting the rule, not real imports.
- **Potentially oversized for its use**: `google-auth-library` (^11.0.2) in `apps/api` is used for exactly one call (`verifyIdToken` on a Google Sign-In ID token) — a comparatively heavy dependency for that single use, though it is the officially supported library for the purpose, so this is a minor note rather than a real problem.
- **Two independent sources of truth**: `packages/validation/src/staff.schema.ts`'s hand-declared `STAFF_ROLE` array duplicates a subset of `packages/types/src/enums.ts`'s `ROLE` array — a real drift risk (Section 10).
- **Possibly-dead exported constants**: several runtime `as const` arrays in `packages/types/src/enums.ts` (`ORDER_STATUS`, `RETURN_STATUS`, `PAYMENT_METHOD`, `PAYMENT_STATUS`, `REFUND_STATUS`, `ROLE`, `PRICING_MODE`, `PERMISSION`, `INVENTORY_STATUS`, etc.) show zero usages outside the package — only their derived TypeScript *types* are consumed elsewhere; `packages/validation`'s Zod schemas don't import these arrays either. This suggests the runtime arrays themselves may be vestigial (see Section 20).
- **No suspicious/unusual packages** found in any `package.json`.
- **No automated dependency/security audit gate exists in CI** (Section 14) — the `qs` and `sharp` CVE fixes present in `pnpm-workspace.yaml` overrides were evidently found and patched manually, not by an automated `pnpm audit` (or equivalent) step.

---

## 20. Dead code

- **`packages/types/src/enums.ts`** — several exported runtime const arrays appear unused outside their own derived-type declarations (Section 19); worth confirming with a repo-wide reference search before removing, since this recon used a heuristic, not an exhaustive check.
- **`ProductVariant.ratePerKgOverridePaise`** — deprecated but intentionally retained field, documented as "never sent by the admin UI." This is a documented compatibility shim, not accidental dead code — no action needed unless the team wants to drop it in a future migration.
- **`review.md`** (root, dated 2026-08-27) — contains at least one stale finding (a claim that the `apps/web` production build fails without a live API server) that has since been fixed (the homepage now has `export const dynamic = "force-dynamic"`) but is not marked resolved in the document. Treat this file as a point-in-time snapshot, not current status, and don't re-litigate its findings without re-verifying them against current code (as this recon did for the one spot-checked item).
- **No unreferenced components/hooks were found** in the admin app (heuristic cross-reference, all `src/features/*/components` files are imported somewhere) or in the storefront sample.
- **No obsolete API endpoints, stale feature flags, or duplicate parallel implementations** were found in either app beyond the two form-handling patterns in admin, which are intentional (Section 8), not accidental duplication.
- **`Review`/`ReviewImage` models** were already removed cleanly via migration (Section 4) — not lingering dead code, a completed cleanup.

---

## 21. Overall architecture scores

| Dimension | Score /10 | Basis |
|---|---|---|
| Architecture | 8 | Genuine, CI-enforced Clean/Hexagonal boundaries; real Unit-of-Work pattern for checkout |
| SOLID | 7 | Mostly followed; one confirmed ISP violation (`product.repository.ts`), minor domain-logic-in-infra leak |
| Reusability | 6 | Admin table duplication (10x), two sources of truth for role enums; otherwise reasonable |
| Database design | 8 | Well-indexed to actual query patterns, correct cascade design, deliberate soft-delete only where needed; connection pool unconfigured |
| Concurrency correctness | 8 | Real Postgres row-locking for inventory/cart/coupon/super-admin; idempotent, ordering-safe webhook handling |
| Backend performance | 7 | No N+1, effective caching; sync SMTP on one request path, worker concurrency=1 |
| Frontend performance | 6 | Catalog SSR is well done; transactional pages (cart/checkout/account) are pure CSR shells; admin search has no debounce/cancellation |
| Memory safety | 8 | No confirmed leaks; a small number of low-confidence POSSIBLE items, all easily verified/fixed |
| Scalability | 5 | Local-disk media storage is a hard blocker for the planned EKS/multi-replica architecture; unconfigured connection pool; Redis has no memory limit |
| AWS cost efficiency | 5 | Not actively wasteful today (no cloud services wired up yet to waste money on), but the current media/logging patterns would need rework before cloud deployment to avoid new cost exposure |
| Observability | 3 | No structured logging, no metrics, no real readiness check — the weakest area found |
| Security | 7 | Strong fundamentals (no tokens in localStorage, signature-first webhook verification, no error leakage); gaps in rate-limit coverage and one inconsistent fail-closed path |

**Overall production-readiness: 6.5/10.** The system has an unusually strong and *actually enforced* architectural and data-correctness foundation for a project at this stage — the parts of the system that handle money, inventory, and payment webhooks are careful, tested, and race-condition-aware. The gaps that would most affect a real production launch at 10k–20k users/day are not correctness bugs but operational/scaling readiness: no observability, a media storage strategy incompatible with the planned deployment target, an unconfigured connection pool, and a couple of frontend/admin polish issues (admin pagination UI, storefront transactional-page waterfalls) that are straightforward to fix but currently unaddressed.

---

## 22. Top 20 findings

**P0 — should be fixed before production/EKS deployment**

1. **Admin list pages have no working pagination UI.** `apps/admin/app/(dashboard)/{products,orders,customers,inventory}/page.tsx` hardcode `page: 1`; `total` is returned by the API but never rendered or used anywhere. Any list beyond the default page size (50, 100 for inventory) is silently invisible to staff. **Impact**: staff will lose visibility into orders/customers/products as volume grows, with no error or indication. **Direction**: add a pagination control wired to the existing `total`/`page`/`pageSize` API contract — the backend already supports it.
2. **Media storage is local disk, incompatible with the planned EKS/multi-replica deployment.** `apps/api/src/modules/media/infrastructure/storage/local-disk-media-storage.service.ts` writes to the pod's local filesystem. **Impact**: uploads written on one replica/pod would 404 when served from another, or vanish on pod rescheduling. **Direction**: implement the already-existing `MediaStoragePort` against S3 (or Cloudinary) before any multi-replica or Kubernetes deployment — this is an adapter swap, not a redesign.
3. **No structured logging, metrics, or real health/readiness check.** Every log is a raw `console.log`/`console.error`; `/health` doesn't check DB/Redis connectivity. **Impact**: no way to detect a stuck queue, a failing dependency, or a degraded pod before customers notice; a Kubernetes readiness probe based on `/health` would keep routing traffic to a broken pod. **Direction**: adopt a structured logger with request-id as metadata, add a real `/ready` check, add basic metrics (at minimum: queue depth, error rate, request latency).
4. **Redis has no memory limit or eviction policy.** `docker-compose.yml`'s redis service runs entirely on defaults. **Impact**: unbounded memory growth under real traffic could OOM Redis, simultaneously degrading rate-limiting and caching (both are fail-open, so this becomes a silent full-bypass of both, not just a cache miss). **Direction**: configure `maxmemory` + an eviction policy (e.g., `allkeys-lru` given everything in Redis today is disposable/cache-like) before production traffic.
5. **`RedisClaimAttemptLimiterService` has no error handling, inconsistent with the rest of the system's fail-open policy.** `apps/api/src/modules/orders/infrastructure/services/redis-claim-attempt-limiter.service.ts`. **Impact**: a Redis blip likely surfaces as an uncaught 500 on the guest-order-claim endpoint specifically, while every other Redis-touching path in the system is designed to degrade gracefully. **Direction**: wrap in the same fail-open (or deliberately fail-closed, if that's actually intended — confirm with the team) pattern used elsewhere, and document the choice.

**P1 — high-impact, should be scheduled soon**

6. **Notification worker concurrency defaults to 1.** `apps/api/src/worker.ts`. **Impact**: all transactional email is processed strictly serially; a burst of orders could create a growing, invisible backlog (compounds finding #3's lack of queue-depth visibility). **Direction**: set an explicit concurrency based on expected order-burst volume; add queue-depth monitoring.
7. **Synchronous SMTP send on the registration-OTP request path.** `apps/api/src/modules/auth/infrastructure/services/smtp-otp-notifier.ts`. **Impact**: a slow/down SMTP server directly slows or fails registration for real users. **Direction**: this is a deliberate design choice (documented) — the fix, if any, is an SMTP-provider SLA/timeout decision, not a code change; flag for the team to confirm it's still the right trade-off at scale.
8. **`ProductRepository` mixes storefront-read and admin-write concerns in one 681-line, 28-method file.** `apps/api/src/modules/products/infrastructure/repositories/product.repository.ts`. **Impact**: this is the largest, highest-blast-radius file to change safely in the whole codebase — a change for an admin feature risks an unintended storefront regression and vice versa. **Direction**: split into a read-focused and a write-focused repository/port pair.
9. **Admin search inputs have no debounce, and a documented request-cancellation mechanism doesn't actually exist.** `apps/admin/src/lib/api-client.ts` (comment vs. code), every admin `*Filters` component. **Impact**: every keystroke fires an uncancelled request; under heavy admin use this multiplies Postgres round-trips and can cause response race conditions (a slow earlier request resolving after a faster later one). **Direction**: add debounce and actually wire `AbortSignal` through the fetch functions as the comment claims.
10. **No automated dependency/security-audit gate in CI.** `.github/workflows/ci.yml`. **Impact**: the existing `qs`/`sharp` CVE fixes were found manually; a future vulnerable dependency could ship undetected. **Direction**: add a `pnpm audit` (or equivalent, e.g. `osv-scanner`) step to CI.
11. **Cart mutation and public product-listing routes have no rate limiting.** Only auth/admin-auth/staff-activation/testimonials routes are guarded (`apps/api/src/middleware/rate-limit.ts` usage). **Impact**: a scriptable abuse surface on cart mutations especially (guest-accessible, no cache mitigation unlike product listing). **Direction**: extend rate-limiting to cart mutation routes at minimum.
12. **Two independent sources of truth for role/staff-role enums.** `packages/validation/src/staff.schema.ts` `STAFF_ROLE` vs. `packages/types/src/enums.ts` `ROLE`. **Impact**: a role added to one and not the other silently diverges validation from the type system. **Direction**: derive `STAFF_ROLE` from `ROLE` (or vice versa) instead of maintaining two lists.

**P2 — moderate, worth planning for**

13. **Postgres connection pool is entirely unconfigured/default across multiple processes.** `packages/database/src/client.ts`, `DATABASE_URL` has no `connection_limit`. **Impact**: horizontally scaling `apps/api` and/or the worker multiplies unpooled default-sized connections with no coordination — a plausible first bottleneck under real scaling, ahead of query cost or CPU. **Direction**: introduce PgBouncer (or tune `connection_limit` per replica count) before scaling beyond a single replica of each process.
14. **Admin has 10 near-identical table components with no shared `DataTable`.** Real reusability debt (not a bug) across Products/Inventory/Orders/Customers/Staff/Banners/Categories/Collections/Coupons/Returns tables. **Direction**: extract a shared table primitive; lower priority than the pagination bug above but would prevent it from recurring per-feature.
15. **Storefront's transactional pages (cart, checkout, account, orders, wishlist) render as empty client-side shells with zero SSR content.** **Impact**: slower perceived load exactly where conversion matters most. **Direction**: consider server-fetching at least the initial cart/order state where feasible, while keeping interactive elements client-side.
16. **`review.md` contains at least one stale, unresolved-looking finding that has actually already been fixed.** **Impact**: risk of the team re-litigating an already-solved problem, or trusting the rest of the document's findings without re-verification. **Direction**: mark it resolved or archive/refresh the document.
17. **A code comment (`apps/api/src/config/redis.ts`, ADR-017) claims Redis is used for "session tokens" and "inventory reservation locks" — neither is actually implemented that way** (sessions are JWT+Postgres; inventory locking is Postgres row locks). **Impact**: documentation/implementation drift that could mislead a future engineer into looking for logic that isn't there, or duplicating logic that already exists elsewhere. **Direction**: update the comment to reflect what's actually built.
18. **`OrderPlacementCelebration.tsx`'s 4 chained `setTimeout`s** — cleanup-on-early-unmount not fully re-verified in this pass. **Impact**: low — a one-time post-checkout animation screen, unlikely to be revisited by the user repeatedly in a way that would compound any leak. **Direction**: a quick direct read to confirm all four timeouts are cleared in the effect's cleanup function.

**P3 — minor/cosmetic**

19. **`google-auth-library` is a comparatively heavy dependency for its single use** (`verifyIdToken` only). Not wrong, just worth knowing if dependency footprint becomes a concern later.
20. **Deprecated `ProductVariant.ratePerKgOverridePaise` field and several unused exported const arrays in `packages/types/src/enums.ts`** add minor cognitive noise but are otherwise harmless (the deprecated field is a documented, intentional compatibility shim).

**Should any of these be fixed before deployment?** Yes — items 1–5 (P0) should be resolved before any production or EKS deployment. Item 2 (media storage) is an outright architectural blocker for the specific deployment target described (multi-replica/EKS), not merely a nice-to-have.

---

### What is already good

- A genuinely Clean/Hexagonal-architected API, with the boundary rules **actually enforced in CI** via `dependency-cruiser` (no cross-module DB access, no circular imports) rather than merely named or documented.
- Correct, tested concurrency control for the business's hardest problem: Postgres row-locking (`SELECT ... FOR UPDATE`) for inventory reservation, cart-checkout locking, coupon-redemption counting, and even super-admin role-change safety — this directly and correctly addresses the "single-unit/limited inventory" and "order/payment/inventory correctness is critical" requirements from the project brief.
- Payment webhook handling that verifies signatures before any DB work, is idempotent via a DB unique constraint plus conditional state transitions, and correctly handles out-of-order webhook delivery without triggering provider retry storms.
- The BullMQ notification queue's real idempotency guarantee is a Postgres atomic claim, independent of and stronger than BullMQ's own dedup — genuinely safe for multiple worker replicas.
- Auth tokens are never placed in `localStorage`/`sessionStorage` on either frontend — access tokens are in-memory only, refresh tokens are httpOnly cookies. Correct, deliberate XSS-resistant design.
- The catalog cache is a well-built, fail-open cache-aside layer with version-bump invalidation, explicitly never trusted as a source of truth for price/stock/payment decisions.
- A destructive-migration guard (`scripts/check-destructive-migration.mjs`) is wired into CI with a deliberate human-signoff escape hatch — a genuine, working safety net against accidental data loss.
- The database schema is well-indexed for its actual query patterns, with index choices explained in schema comments (e.g., the coupon-redemption composite index exists specifically to bound lock-hold time).
- No dependency-boundary violations were found anywhere in the monorepo (no frontend/backend package leakage, no version drift) — unusually clean for a project this size.

### What NOT to change

- The Clean Architecture module structure and its `dependency-cruiser` enforcement — it's working as intended; don't loosen it for short-term convenience.
- The Postgres-row-lock-based concurrency model for inventory/cart/coupons — don't replace it with Redis-based locking; Postgres being the single source of truth for stock/price/payment decisions (per the codebase's own stated policy) is the correct choice, and Redis's fail-open design elsewhere would make it the wrong tool for this specific job.
- The fail-open posture for rate-limiting and catalog caching — this is a deliberate, documented availability-over-strictness trade-off on genuinely disposable data; leave it as-is (the one place that should probably change, the claim-attempt limiter, is called out separately in finding #5 precisely because it's the *odd one out*, not because fail-open itself is wrong).
- The two-tier email design (synchronous OTP vs. async BullMQ for everything else) — the underlying reasoning (OTP delivery must not depend on the worker process being alive) is sound engineering, not an oversight; don't force OTP through the queue.
- The `MediaStoragePort` abstraction itself — it's already correctly designed for an S3/Cloudinary swap; the fix needed (finding #2) is implementing a new adapter behind it, not rearchitecting the use cases that depend on it.

### Files that require the deepest follow-up review

1. `apps/api/src/modules/orders/application/use-cases/checkout.use-case.ts` — the core money/inventory/coupon correctness path
2. `apps/api/src/modules/payments/application/use-cases/handle-razorpay-webhook.use-case.ts` — payment integrity and idempotency
3. `apps/api/src/modules/inventory/infrastructure/repositories/inventory.repository.ts` — the row-locking mechanism underpinning single-unit inventory correctness
4. `apps/api/src/modules/products/infrastructure/repositories/product.repository.ts` — the confirmed ISP violation, largest/highest-risk file to change
5. `apps/api/src/modules/auth/infrastructure/repositories/auth.repository.ts` — second-largest repository, super-admin lock logic, likely similar read/write mixing
6. `apps/api/src/modules/coupons/infrastructure/repositories/coupon.repository.ts` — coupon row-lock, the second-highest lock-contention path
7. `apps/api/src/modules/orders/infrastructure/repositories/transaction.repository.ts` — the Unit-of-Work implementation used throughout checkout/payments
8. `apps/api/src/modules/orders/infrastructure/services/redis-claim-attempt-limiter.service.ts` — confirmed missing error handling
9. `apps/api/src/modules/media/infrastructure/storage/local-disk-media-storage.service.ts` — the deployment-blocking media storage adapter
10. `apps/api/src/worker.ts` — sole background worker, concurrency and observability gaps
11. `apps/api/src/modules/notifications/infrastructure/queues/notification.queue.ts` and `process-notification-job.use-case.ts` — the queue config and idempotency mechanism
12. `apps/api/src/modules/auth/infrastructure/services/smtp-otp-notifier.ts` — the one synchronous, request-blocking email path
13. `apps/api/src/shared/cache/catalog-cache.ts` — the whole caching mechanism, fail-open guarantees
14. `apps/api/src/config/redis.ts` — connection config, and the source of the ADR-017 documentation drift (finding #17)
15. `packages/database/prisma/schema.prisma` — single source of truth for data model, unusually well-commented with rationale
16. `packages/database/src/client.ts` — where connection-pool tuning would need to happen
17. `apps/api/src/middleware/rate-limit.ts` — where rate-limit coverage would need to be extended (finding #11)
18. `apps/api/src/middleware/error-handler.ts` — global error taxonomy, confirmed secure, good reference point
19. `apps/admin/app/(dashboard)/products/page.tsx` (and the equivalent orders/customers/inventory pages) — the confirmed missing-pagination-UI bug
20. `apps/admin/src/lib/api-client.ts` — the comment/code mismatch on request cancellation
21. `apps/web/src/lib/api-client.ts` — the storefront's equivalent HTTP boundary and token-refresh logic
22. `apps/web/src/features/checkout/components/OrderPlacementCelebration.tsx` — verify the 4-`setTimeout` cleanup
23. `apps/web/src/features/orders/components/OrderConfirmation.tsx` — the payment-confirmation poll loop, business-critical
24. `.github/workflows/ci.yml` — where a dependency-audit gate and (eventually) a deploy stage would be added
25. `apps/api/.dependency-cruiser.cjs` — the architecture-boundary rule set, including its documented limitations
26. `packages/types/src/enums.ts` and `packages/validation/src/staff.schema.ts` — the duplicated role-enum sources of truth (finding #12) and the possibly-dead const arrays (Section 20)
27. `docker-compose.yml` — where Redis memory limits/eviction policy would be configured (finding #4)

---

*This report is reconnaissance only. No files were modified. No fixes were implemented. No PR was created.*
