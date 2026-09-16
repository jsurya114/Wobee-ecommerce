# Woobe Monorepo — Forensic Code Review & Hardening Report

Generated: 2026-09-13. Scope: forensic re-verification of the earlier reconnaissance report's findings against the actual current code (not summaries of summaries), plus implementation of safe, well-scoped fixes. Nine parallel forensic passes were run, each instructed to prove claims from code (exact file:line, exact execution sequences) rather than restate prior conclusions. Two of the recon report's findings were explicitly **refuted** by this pass (noted below) — this report supersedes the recon report wherever they conflict.

All fixes below were implemented directly, verified with `tsc --noEmit`, `eslint --max-warnings=0`, the full vitest suite (742 tests: 398 pure unit + 344 real-Postgres/Redis integration tests, run against the actual local `woobe_test` database — not mocked), `depcruise` (architecture boundary check), a real additive Prisma migration applied and drift-checked against a shadow database, and a full production build of all three apps (`api`, `web`, `admin`).

---

## Executive Summary

The forensic pass confirms the recon report's headline conclusion and sharpens it: **the money/inventory/payment correctness core is genuinely solid**, not merely well-architected in name. All 15 named concurrency scenarios were traced to an exact enforcing mechanism or an exact race proof — 13 are proven safe by real database guarantees (row locks, conditional `UPDATE ... WHERE status = X`, unique constraints), and the remaining 2 are "safe today, fragile under a future refactor" rather than live bugs. One genuinely new, previously-undocumented correctness gap was found and fixed: a worker crash mid-send could leave a notification permanently stuck in `SENDING` with silent, indefinite non-delivery on every subsequent retry.

Two of the recon report's findings did not survive forensic scrutiny and are **retracted**: the claimed "STAFF_ROLE/ROLE drift risk" is actually a deliberate, documented, internally-consistent subset relationship (no fix needed), and the claimed "no file-size limit on uploads" was wrong — a real, enforced 5MB cap and MIME allowlist already exist.

18 fixes were implemented in this pass, ranging from a real security gap (OTP/password-reset email spam bypassable via multi-IP rotation) to two newly-proven missing database indexes to a live dependency-vulnerability sweep that took the production dependency tree from 14 known vulnerabilities (8 high) to zero. Every fix was scoped to avoid touching checkout, payment state machines, authentication, or the Clean Architecture module boundaries — those are confirmed correct and were left alone.

The single largest remaining blocker for the planned EKS/production deployment is unchanged from the recon report and was **deliberately not touched** per this review's own scope: local-disk media storage is incompatible with multi-replica/ephemeral-pod deployment. That is a real architectural migration (to S3/Cloudinary), not a hardening fix, and doing it here would have violated the "don't implement large architectural changes automatically" rule.

---

## Production Readiness Score

| Dimension | Score /10 | Change from recon | Basis |
|---|---|---|---|
| Correctness | 9 | +1 | All 15 concurrency scenarios proven from code; the one real gap found (stuck-SENDING notifications) is now fixed |
| Maintainability | 7 | 0 | Two confirmed ISP violations remain (ProductRepositoryPort, AuthRepositoryPort) — correctly deferred, not blindly split |
| Efficiency | 7.5 | +0.5 | No N+1 anywhere; two proven-missing indexes now added; sequential-vs-parallel queries were already optimal everywhere checked |
| Memory safety | 9 | +1 | Zero confirmed/likely leaks found anywhere (backend or frontend) across an exhaustive audit |
| Scalability | 6.5 | +1.5 | Redis now memory-capped with eviction; readiness endpoint added; connection-pool sizing still needs an infra decision (replica count, RDS class) before it can be set — correctly left as a decision, not a guess |
| AWS cost efficiency | 7 | +2 | Caching confirmed to be doing real, measurable work, not cosmetic; most "cost risks" downgraded to POSSIBLE/THEORETICAL on forensic review; Cache-Control headers added ahead of the eventual CloudFront cutover |
| Observability | 6 | +3 | Structured JSON logging, a real DB+Redis readiness check, and CI dependency/secret scanning all added — still short of metrics/dashboards, which is correctly deferred as "needs a running system to be worth building" |
| Security | 8.5 | +1.5 | Zero known vulnerabilities in production dependencies (was 14, 8 high); email-targeted rate limiting closes a real multi-IP OTP-spam bypass; cart mutation routes now rate-limited |

**Overall production-readiness: 7.5/10** (up from 6.5/10 at recon time). The correctness foundation was already strong and is now forensically confirmed, not just architecturally plausible. The remaining gap to production-ready is concentrated in exactly two places, both correctly left untouched by this pass because they require decisions this review isn't positioned to make unilaterally: **media storage** (needs an S3/Cloudinary migration, an architectural change, not a hardening fix) and **connection-pool sizing** (needs a committed replica count and RDS instance class before a number can be chosen).

---

## Top P0 Issues

1. **Local-disk media storage is incompatible with the planned EKS/multi-replica deployment.** `apps/api/src/modules/media/infrastructure/storage/local-disk-media-storage.service.ts`. Confirmed unchanged by this pass — deliberately not touched (Phase 12 of this review was analysis-only by explicit instruction). The `MediaStoragePort` abstraction is confirmed sufficient for a direct S3 adapter swap; the actual migration work is an implementation task for a dedicated pass, not a fix bundled into hardening.
2. **Postgres connection pool is unconfigured, and its safety depends on decisions not yet made.** `packages/database/src/client.ts`. Forensically confirmed: pool size follows Prisma's CPU-count-based default with no override. The arithmetic (`total connections ≈ (server replicas + worker replicas) × per-instance pool size`) is sound and was verified, but the actual number depends on EKS pod CPU sizing and the target RDS instance class — neither exists in the repo yet. Not fixed here because a wrong guess (e.g. an artificially low `connection_limit`) could throttle real capacity unnecessarily; this needs to be set once those infra decisions are made, not guessed at.

Both of the recon report's other P0s (admin pagination, no readiness/observability, Redis memory limits, the claim-limiter fail-open inconsistency) are **fixed** in this pass — see "Fixes Implemented" below.

---

## Top P1 Issues

1. **Two confirmed ISP violations in the port layer**, not fixed in this pass because the blast radius is real (every storefront use-case for products, and 37 methods spanning user/auth/staff concerns for auth) and a mechanical split needs its own dedicated verification pass against every consumer and test mock:
   - `ProductRepositoryPort` (`apps/api/src/modules/products/application/ports/product-repository.port.ts`) mixes storefront-read and admin-write methods in one interface, forcing every storefront use-case to type-depend on admin capability it never calls. **Recommended fix**: split into `ProductCatalogReaderPort` + `ProductAdminRepositoryPort`, both still implemented by one `ProductRepository` class (no file-level split needed).
   - `AuthRepositoryPort` (`apps/api/src/modules/auth/application/ports/auth-repository.port.ts`) has the same issue, plus a confirmed **cross-module coupling**: `apps/api/src/modules/staff/application/use-cases/create-staff.use-case.ts` imports this port directly from the `auth` module, a boundary `dependency-cruiser` doesn't (and, per its own documented limitation, can't currently) catch. **Recommended fix**: give `staff` its own narrow `StaffRepositoryPort`.
2. **`findBestSellingVariantQuantities` has no date-range bound** (`apps/api/src/modules/orders/infrastructure/repositories/order.repository.ts`) — scans all-time order history on every 60s-TTL cache refresh for the public homepage's best-sellers section. Mitigated today by the cache TTL; grows slowly and steadily with total lifetime order volume. Not fixed here — needs a decision on what "recent" means for this feature (last 30/60/90 days) before adding the parameter.
3. **Guest cart rows have no cleanup/expiry job.** Every anonymous cart-touching request with no existing cart creates a new row; nothing prunes abandoned ones. Slow-burning, not urgent, needs a new scheduled job (out of scope for a hardening pass — this is new infrastructure, not a fix to existing code).
4. **The `inStockOnly` product-listing filter runs an uncached, unconditional full-table `Inventory` aggregate** (`apps/api/src/modules/inventory/infrastructure/repositories/inventory.repository.ts`) on every such request. Deliberate (never trust cached stock for a purchase-adjacent decision), but worth capacity-planning for once real traffic patterns are known.
5. **Two correctness invariants are enforced only by "there is exactly one caller," not by the database**: `MarkCodPaymentCapturedUseCase` (no conditional update guarding double-capture) and `IssueRefundForCancelledOrderUseCase` (no unique constraint on `Refund.orderId` for the cancellation path — the return-refund path already has one). Both are safe **today** because each has exactly one, atomically-gated call site — but a future second caller (a retry job, an admin "resend" button) would silently reintroduce a double-capture/double-refund risk with nothing to catch it. **Recommended fix**: a partial unique index (`Refund.orderId` WHERE `returnId IS NULL`) plus an explicit assertion/comment at each call site. Not implemented in this pass — needs a data check for existing violations before a unique constraint can be safely added (none were found in the manual audit, but this deserves its own verification pass, not an assumption).

---

## Top P2 Issues

- Admin's 10 near-identical table components (no shared `DataTable`) — real reusability debt, not a bug. A shared `Pagination` component was extracted in this pass as a first step; a full `DataTable` extraction is a larger, separate refactor.
- Coupons admin list has no pagination contract at all (unlike products/orders/customers/inventory/returns/testimonials, which had the contract but a UI bug) — low urgency today, but distinct from banners/categories/collections' deliberate "naturally small, curated" unpaginated design.
- Offset-pagination cost grows with page depth on the public product listing — not a current problem at plausible catalog sizes, a structural note for if/when the catalog grows an order of magnitude.
- `packages/validation/src/checkout.schema.ts` hardcodes `z.enum(["RAZORPAY", "COD"])` instead of importing `PAYMENT_METHOD` from `@woobe/types` — **investigated and deliberately NOT fixed**: `@woobe/types` already depends on `@woobe/validation` (for its own Zod-derived types), so importing the other way would create a circular workspace package dependency. A real fix requires relocating the shared enum to a lower-level package first — not a one-line change.
- `packages/database/src/client.ts` connection pool — see P0 #2, same underlying issue, listed here too since a rough default (even if later replaced) is arguably better than nothing; deliberately left unset per the reasoning above.

---

## P3 / Cleanup

- Several exported `as const` arrays in `packages/types/src/enums.ts` (`ORDER_STATUS`, `ROLE`, etc.) have zero real usages outside their own file — only their derived TypeScript types are consumed elsewhere. Confirmed via full-repo grep. Low value to remove, no harm left in place.
- `review.md` contains at least one stale finding (a since-fixed build issue) not marked resolved — risk of re-litigating a solved problem. Recommend archiving or annotating, not deleting.
- `ProductVariant.ratePerKgOverridePaise` — deprecated, intentionally retained, documented compatibility shim. No action needed.

---

## SOLID Review

Route → controller → use case → port → repository → infrastructure is **genuinely followed**, confirmed by reading actual controller and use-case files (not inferred from directory names). Controllers in orders/payments are verified thin — zero business logic, guard → validate → `use-case.execute()` only. No database logic was found hidden in any use-case (a full grep of every `application/` directory for `@woobe/database`/`@prisma/client` imports found zero real hits — only code comments referencing the rule).

**Confirmed violations** (both ISP, both listed as P1 above, neither fixed in this pass): `ProductRepositoryPort` (28 methods, storefront+admin mixed) and `AuthRepositoryPort` (37 methods, plus a real cross-module import from `staff`). Neither is a file-size problem — the underlying repository classes are internally well-organized; the interfaces they implement are too fat for their consumers.

**Refuted claims**: `recomputeMinPrice` inside `product.repository.ts` was flagged by the recon pass as "domain logic in infrastructure" — on forensic read, it's pure denormalization bookkeeping (a `MIN` aggregate + write-back over an already-computed cache column), not a pricing rule; the actual price computation happens entirely in `PricingReaderPort`. The `TransactionPort` being duplicated once per module (orders, payments) looks like duplication but is a **deliberate, correct trade-off** — a 3-line interface duplicated twice is cheaper insurance against exactly the cross-module coupling problem found in `AuthRepositoryPort`, not an oversight.

No circular dependencies, no OCP/LSP violations, and no unnecessary DB/network calls caused by the architecture itself were found in the modules sampled (orders, payments, inventory, cart, auth, products).

---

## Reusability / DRY Review

- Admin's 10 table components duplicate markup/loading/empty states (real, unfixed — see P2). A shared `Pagination` component (`apps/admin/src/features/shell/components/Pagination.tsx`) and a shared `useDebouncedValue` hook (`apps/admin/src/lib/use-debounced-value.ts`) were added in this pass and are now reused across 7 pages — a first step toward reducing that duplication, not a full fix.
- The claimed `STAFF_ROLE`/`ROLE`/Prisma-enum "drift" is **refuted**: all three are deliberate, internally-consistent, documented subsets of each other (Prisma's 5-value enum includes one retired legacy role; `ROLE` is the 4 active roles; `STAFF_ROLE` further excludes `CUSTOMER` since it governs staff-assignment forms). No fix needed or made.
- Pricing/GST computation is centralized (cart display and checkout each independently, deliberately recompute live from the same source data — correctness choice, not duplication).
- Weight-based pricing, order status transitions, pagination caps, and rate-limiting are each implemented exactly once and reused everywhere — confirmed, no duplication found.

---

## Memory Leak Review

**Zero CONFIRMED or LIKELY leaks found anywhere** — backend or frontend — after an exhaustive pass.

Backend: Prisma/Redis/Nodemailer/BullMQ client lifecycles are all true singletons, constructed once at module load, never per-request. Graceful shutdown in both `server.ts` and `worker.ts` correctly drains in-flight work before disconnecting. No unbounded in-memory caches, maps, or sets were found.

Frontend (`apps/web`): the recon report's two "POSSIBLE risk" flags were both **resolved to NO ISSUE** on a full re-read:
- `OrderPlacementCelebration.tsx` has exactly 3 `setTimeout`s (not 4, as guessed) plus one more in a mutually-exclusive reduced-motion branch, all cleared in the effect's cleanup function.
- `GuestLoginPrompt.tsx`, `SearchField.tsx`, `HeaderSearch.tsx` all correctly pair every `addEventListener` with a matching `removeEventListener`.

Every other timer/listener audited (`PromoCarousel`, `useCountdown`, `useFilterResultCount`, `useSearchSuggestions`, `useGuestLoginPrompt`, `ScrollToHashOnLoad`, `OrderConfirmation`'s poll loop) has correct, verified cleanup.

Frontend (`apps/admin`): only 5 files use `useEffect` at all in the whole app; all have correct or harmless (no-cleanup-needed) behavior.

---

## Backend Performance Review

No N+1 queries were found anywhere (a repo-wide grep for Prisma calls inside loops returned zero hits). Sequential-vs-parallel query opportunities were checked across products, orders, customers, and the admin analytics dashboard — **every one already uses `Promise.all`** where safe; this was a positive finding, not a gap. The checkout transaction's lock-hold duration was traced statement-by-statement: every operation inside it is a Postgres round-trip or pure computation — **no external network call and no CPU-heavy work happens inside a held transaction**, anywhere in the codebase.

Two real, now-fixed gaps: the admin customer list had no index behind its unconditional `role` filter + `createdAt` sort (full table scan + in-memory sort on every load), and the admin order search had no index behind its `contactEmail`/`orderNumber` substring search. Both fixed with additive indexes (see Database Review).

The registration-OTP path's synchronous SMTP send and the BullMQ worker's default concurrency-of-1 were both flagged as real degradation risks in a slow-SMTP scenario; both are fixed (SMTP timeouts bound the worst case, concurrency raised to a justified 5).

---

## Frontend Performance Review

`apps/web`: catalog-facing routes (home, product list/detail, collections) are genuine Server Components doing server-side data fetching — confirmed by direct file read, not inferred. All transactional routes (cart, checkout, account, orders, wishlist) are, by design, thin server wrappers delegating entirely to client components — a real, systemic "empty shell on first paint" pattern on the highest-value pages, not a bug but worth knowing. `canvas-confetti` is correctly lazy-loaded only at the moment it's needed; `motion` is scoped to exactly the 3 files that animate. Memoization is used sparingly and correctly — no component was found doing an expensive unmemoized computation, and no over-memoization was found either. One real, now-fixed gap: `AuthContext`/`CartContext` provider values were fresh object literals on every render instead of memoized (unlike `SelectedVariantProvider`, which already did this correctly) — fixed by mirroring that existing pattern.

`apps/admin`: the pagination bug's exact scope was determined precisely — **6 of 11 list pages** (products, orders, customers, inventory, returns, testimonials) had a working backend contract (`{items, total}`, accepts `page`/`pageSize`) but a hardcoded `page: 1` and no UI to change it. Staff, banners, categories, and collections are correctly unpaginated by design (small, curated, or naturally bounded entity counts) — not bugs. Coupons has a distinct, lower-severity gap (no pagination contract at all, genuinely unbounded growth over time). All 6 confirmed-buggy pages are fixed in this pass. Search inputs across every affected page (plus staff, which had the same gap despite needing no pagination) had zero debounce — fixed with a shared hook. The admin `api-client.ts`'s claim that request cancellation was "threaded through" was verified false (the code that would do it didn't exist) — now actually wired for the 4 search-driven list endpoints.

---

## Database Review

33 Prisma models, well-indexed for their actual query shapes (a trigram GIN index on `Product.name`, composite indexes matching the PLP's filter/sort paths, a composite `CouponRedemption` index sized specifically to bound checkout-time lock duration). Two new, forensically-proven index gaps were found and fixed in this pass:

- `User` had no index behind the admin customer list's unconditional `role` filter + `createdAt` sort — every load was a full sequential scan + in-memory sort. Fixed: `@@index([role, createdAt])`.
- `Order.contactEmail` had no index behind the admin order search's `contains`/insensitive filter (the existing `orderNumber` index is a plain unique btree, useful only for exact match). Fixed: a GIN trigram index, mirroring the existing `Product.name` treatment.

Both were applied as a real, additive migration (`20260913110500_add_user_role_index_and_order_email_search_index`), deployed to both the local dev and test databases, and verified to produce **zero schema/migration drift** against a shadow database (the same check CI runs).

Connection pooling remains unconfigured (see P0 #2) — correctly left as a decision pending infra commitments, not guessed at. `findBestSellingVariantQuantities`'s unbounded historical scan (P1) and the `inStockOnly` filter's uncached full-table aggregate (P1) are both real, low-urgency findings not fixed in this pass. No SQL injection risk exists anywhere — every raw query uses Prisma's tagged-template parameterization.

---

## Redis Review

Exactly two long-lived ioredis instances exist process-wide (the shared client, and BullMQ's dedicated connection) — both true singletons. Two real gaps found and fixed:

1. **No command timeout was configured** — a Redis that accepts the TCP connection but stalls replying (not "down," just slow) could hang a request indefinitely, bypassing every fail-open catch block in the codebase (those only fire on an actual thrown error, not an indefinitely-pending promise). Fixed: `commandTimeout: 2000` added to the shared client.
2. **`RedisClaimAttemptLimiterService` had no error handling at all**, making it fail *closed* — the only Redis-touching guard in the codebase that did. Forensically evaluated against its actual threat model (guest order-claim brute-forcing, whose real defense is a 48-bit crypto-random order-number suffix, not this counter) and fixed to fail **open**, matching the rest of the codebase and avoiding a needless 500 for a real customer during a Redis blip on a non-money-moving action.

Redis's memory policy was confirmed unconfigured (no `maxmemory`, defaulting to unbounded growth) — fixed in `docker-compose.yml` with `maxmemory 256mb` + `allkeys-lru` (justified: everything stored in this Redis instance today is disposable cache/rate-limit/queue data with its own TTL or cleanup, nothing needs eviction-exemption). Product-list cache key cardinality was calculated concretely: bounded in normal browsing traffic, a real (not merely theoretical) but modest risk under adversarial/bot traffic hitting many distinct `minPrice`/`search` combinations within one 60s TTL window — not fixed in this pass (would need a rate limit on the product-listing route specifically, a design decision about acceptable cache-bypass cost, not a mechanical fix). Confirmed, with an exact trace: stale cached data can **never** reach a checkout or payment decision — the checkout path has no dependency on the cached product repository at all.

---

## Queue/Worker Review

BullMQ is genuinely used (not a cron/polling stub), with one queue (`notifications`). A real, previously-undocumented correctness gap was found: a worker crash between winning the `claimForSending` claim and the provider call resolving left a notification stuck in `SENDING` forever — BullMQ's own stalled-job detection *does* redeliver the job, but the old claim logic (`WHERE status = PENDING`) mistook the orphaned `SENDING` row for someone else's active send and silently no-op'd every redelivery attempt, forever. **Fixed**: `claimForSending` now also reclaims a `SENDING` row if it's been stale for more than 10 minutes (comfortably longer than BullMQ's own stall-detection + 3-attempt/backoff window), making the existing automatic redelivery mechanism actually work instead of being silently defeated. No new cron/sweep job was needed — this closes the loop using infrastructure BullMQ already provides.

Concurrency was raised from BullMQ's unconfigured default of 1 to an explicit 5, but only *after* first fixing the actual root risk: Nodemailer had no connection/socket timeout configured, so a single hung SMTP connection could previously block the entire single-concurrency queue for however long a hang lasted (Nodemailer's undocumented-here default is up to 10 minutes). Both are fixed together — timeouts bound the worst case per send regardless of concurrency, and the concurrency increase (justified by an estimated 2,000–16,000 notification-events/day at the target traffic scale) prevents that bounded worst case from serializing every other queued notification behind it.

---

## Security + Load Review

**Real, fixed**: OTP/password-reset/registration routes were rate-limited by IP only — an attacker controlling multiple IPs could spam a specific victim's inbox by rotating source IPs, since each IP gets its own fresh budget against the same target. Fixed with a second, email-keyed rate limiter (5/10min) layered on top of the existing IP limiter on the four routes that actually send mail to a caller-supplied address (`register/start`, `register/resend`, `forgot-password`, `reset-password/resend`).

**Real, fixed**: every cart mutation route (add/update/remove/change-variant/merge/coupon apply/remove) was guest-accessible with zero rate limiting — a scripted client could generate unbounded DB writes. Fixed with a 120/5min-per-IP limiter across all seven mutation routes (the read-only `GET /cart` is deliberately left unlimited).

**Confirmed safe by exact request-amplification counts**: the Razorpay webhook route rejects a bad signature at near-zero cost (0 DB queries, 0 Redis calls — the HMAC check runs before any I/O). Checkout, on a 2-item cart with a coupon, executes ~16 DB statements inside one transaction — bounded by realistic cart sizes, not a scaling risk. Body size limits (Express's 100kb default) were confirmed generous enough for every real payload shape in the app. Upload size limits were confirmed to already exist (5MB, MIME-allowlisted) — the recon report's "no limit found" claim was wrong.

**Not fixed, correctly deferred**: the public product-listing route (mitigated by caching + a hard pagination cap, but still technically unrated) and the `inStockOnly` filter's uncached full-table scan.

Zero known vulnerabilities remain in production dependencies (`multer` and `nodemailer` bumped within their existing semver ranges; `postcss`/`deepmerge-ts`/`js-yaml` forced via `pnpm-workspace.yaml` overrides matching the repo's existing pattern for `qs`/`sharp`) — was 14 (8 high, 5 moderate, 1 low), confirmed zero after the fix.

---

## AWS Cost Review

Every candidate cost risk was classified rather than assumed real:

- **THEORETICAL, not REAL**: per-request logging volume. Confirmed by reading every `console.*` call site — every single one is error-path-only (Redis failure, unhandled exception, malformed cache value); there is no per-request success log anywhere in the codebase. Restructuring these as JSON (done in this pass) doesn't add volume, since there was none to begin with.
- **REAL, and genuinely working, not cosmetic**: the catalog cache. Worked the math with a plausible traffic estimate (15k users/day × ~4 product-list views ≈ 0.7 req/s sustained) — a 60s TTL absorbs a meaningful multiple of requests per cache-hot key into one DB read, cutting product-listing DB load by one to two orders of magnitude on the hot path. The cold-tail (unique searches/filter combos) gets little benefit, which is expected, correct behavior for this cache design, not a flaw.
- **POSSIBLE, once S3/CloudFront exist**: served images had no explicit cache lifetime (Express's static-file default of `maxAge: 0`), which would force CloudFront to revalidate on every hit instead of caching at the edge. **Fixed now**, ahead of that migration: `/uploads` now serves with a 365-day immutable `Cache-Control`, safe because every upload key is a `randomUUID()` that's never reused or overwritten.
- **No retry-amplification risk found anywhere** — BullMQ's 3-attempt cap, the webhook handler's explicit "stale, don't retry" response to out-of-order events, and the OTP/slug/SKU generators' own bounded-attempt constants were all checked.

---

## Observability Review

Minimum-viable additions were made, deliberately stopping short of a full platform:

1. **Structured JSON logging** for every existing error-path log call (`error-handler.ts`, `rate-limit.ts`, `catalog-cache.ts`, `config/redis.ts`, the claim-limiter) via a new ~10-line `logError()` helper (`apps/api/src/shared/logger.ts`) — no new dependency, no new log volume, just queryable fields (`event`, `requestId`, `code`, etc.) instead of interpolated strings.
2. **A real `/ready` endpoint** (distinct from the existing liveness-only `/health`) that pings both Postgres and Redis with a 1.5s timeout each, returning 503 if either fails — exactly what a Kubernetes readiness probe needs, deliberately *not* checking BullMQ queue depth or SMTP reachability (those belong as separate metrics, not inside a probe that needs to stay fast and reliable). Implemented via dependency injection (`createApp({ checkReadiness })`) specifically so `app.ts` itself stays free of any direct database/Redis import, preserving the existing architecture boundary rule and keeping the endpoint fully unit-testable without a real database.

Explicitly **not** added, and why: a metrics/dashboard stack (nothing yet running in production to monitor), BullMQ queue-depth alerting (would need a decision on where alerts go — Slack, PagerDuty, email — that this review isn't positioned to make), and a third-party error-tracking SDK (a real, valuable next step, but a new dependency decision for the team, not a hardening-pass fix).

---

## Deployment Readiness Review

`.github/workflows/ci.yml` already ran lint, typecheck, unit+integration tests, a module-boundary check, and two migration-safety checks (destructive-migration guard, schema/migration drift) — a genuinely solid gate set for this stage. Two real gaps were closed: a `pnpm audit --prod` step (catches exactly the kind of vulnerability found and fixed by hand in this pass, automatically, on every future PR) and a `gitleaks` secret-scanning step, both added early in the pipeline (secret scan at checkout, dependency audit right after install) so they fail fast and cheap before the slower DB/test steps run.

Confirmed, not fixed (out of scope for a code-hardening pass): no Dockerfile, Kubernetes manifest, or IaC file exists anywhere in the repo yet — container/IaC scanning has nothing to scan until those exist, and adding that tooling now would be premature process weight.

---

## Things That Are Already Excellent

(Re-confirmed by forensic review, not merely re-stated from the recon pass)

- Postgres row-locking for inventory reservation, cart-checkout locking, and coupon-redemption counting — traced to the exact `SELECT ... FOR UPDATE` statements and proven, with statement-by-statement interleaving, to prevent every named race scenario.
- Payment webhook handling — signature verification before any DB work, idempotent via a real unique constraint, and explicitly correct handling of out-of-order delivery (a late event on an already-resolved order returns "stale" rather than corrupting state or triggering a provider retry storm).
- The dependency-cruiser-enforced module boundary rule — genuinely followed by every module sampled, with its own documented, honest limitation (it doesn't catch cross-module port imports) rather than a false sense of completeness.
- Zero circular package dependencies in the monorepo, and this review specifically avoided introducing one (see the `checkout.schema.ts` P2 finding).
- In-memory-only access tokens + httpOnly refresh cookies on both frontends — confirmed, no tokens in any browser storage anywhere.
- The `MediaStoragePort` abstraction — confirmed genuinely sufficient for a drop-in S3 adapter swap, no rearchitecting needed when that migration happens.
- The BullMQ notification queue's real idempotency guarantee (`claimForSending`'s atomic conditional update) is stronger than BullMQ's own dedup and was confirmed safe for multiple worker replicas.

## Things We Should NOT Refactor

- The Clean Architecture module structure and its enforcement — working as designed.
- The Postgres-row-lock concurrency model — do not replace with Redis locks; Postgres being the source of truth for stock/price/payment decisions is the correct design, forensically reconfirmed.
- The fail-open posture for rate-limiting and catalog caching — a deliberate, correct trade-off on genuinely disposable data (the claim-limiter was the one inconsistent exception, and it's now been brought in line, not the rule changed).
- The synchronous-OTP/async-everything-else email split — sound engineering (OTP delivery must not depend on the worker being alive), not an oversight.
- `TransactionPort` being duplicated once per module — a deliberate, cheap insurance policy against cross-module coupling, confirmed correct on forensic review, not accidental duplication to "clean up."

---

## Fixes Implemented

| # | File(s) | What changed | Why | Tests run | Result |
|---|---|---|---|---|---|
| 1 | `apps/admin/app/(dashboard)/{products,orders,customers,inventory,returns,testimonials}/page.tsx`, new `apps/admin/src/features/shell/components/Pagination.tsx` | Replaced hardcoded `page: 1` with real page state + a shared Prev/Next control wired to the API's existing `total`/`page`/`pageSize` contract; resets to page 1 on filter change | 6 admin list pages were silently hiding all data beyond the first page, with no indication anything was missing | `tsc --noEmit`, `eslint` | Pass |
| 2 | New `apps/admin/src/lib/use-debounced-value.ts`; applied in products/orders/customers/inventory/staff pages | Debounces search input before it reaches the query filter | Every keystroke previously fired an uncancelled network request | `tsc --noEmit`, `eslint` | Pass |
| 3 | `apps/admin/src/lib/api-client.ts` (comment), `admin-products/orders/customers/inventory.client.ts`, matching hooks | Corrected a false comment claiming request cancellation was "threaded through" (it wasn't); actually wired React Query's `{signal}` context through to `fetch` for the 4 search-driven list endpoints | Comment/code mismatch could mislead a future engineer; real fix closes wasted-request risk under fast typing | `tsc --noEmit`, `eslint` | Pass |
| 4 | `apps/api/src/modules/orders/infrastructure/services/redis-claim-attempt-limiter.service.ts` | Wrapped the Redis call in try/catch, failing OPEN with a logged error | Was the one Redis-touching guard in the codebase that failed closed, inconsistent with its own actual threat model | `tsc --noEmit`, `eslint`, full vitest suite | Pass (742/742) |
| 5 | `apps/api/src/config/redis.ts` | Added `commandTimeout: 2000`; corrected the ADR-017 comment (Redis is not actually used for sessions or inventory locks, despite the old comment implying it would be) | A slow-but-connected Redis could hang requests indefinitely, bypassing every fail-open catch | `tsc --noEmit`, `eslint`, full vitest suite | Pass |
| 6 | `apps/api/src/shared/email/nodemailer-mailer.ts` | Added `connectionTimeout`/`greetingTimeout`/`socketTimeout` | Nodemailer's undocumented-here defaults (up to ~10min) could hang the single-concurrency worker indefinitely on a slow SMTP endpoint | `tsc --noEmit`, `eslint`, full vitest suite | Pass |
| 7 | `apps/api/src/worker.ts` | Set explicit `concurrency: 5` on the BullMQ Worker | Was defaulting to BullMQ's unconfigured concurrency of 1; justified by estimated 2k-16k notification-events/day at target traffic and made safe by fix #6 | `tsc --noEmit`, `eslint`, full vitest suite | Pass |
| 8 | `apps/api/src/modules/notifications/application/ports/notification-repository.port.ts`, `infrastructure/repositories/notification.repository.ts`, `application/use-cases/process-notification-job.use-case.ts` (+ its test file) | `claimForSending` now also reclaims a `SENDING` row stale for >10 minutes, not just a `PENDING` one | A worker crash mid-send left a notification stuck in `SENDING` forever — BullMQ *did* redeliver the job, but the old claim check silently no-op'd every redelivery, causing permanent, silent non-delivery with no operator visibility | `tsc --noEmit`, `eslint`, full vitest suite (updated 2 assertions to match the new call signature) | Pass |
| 9 | `packages/database/prisma/schema.prisma` + new migration `20260913110500_add_user_role_index_and_order_email_search_index` | Added `User.@@index([role, createdAt])` and a GIN trigram index on `Order.contactEmail` | Proven full-table scan + in-memory sort on every admin customer-list load; proven unindexed substring search on admin order search | Migration applied to local dev + test DBs, verified via `pg_indexes`; `prisma migrate diff --exit-code` against a shadow DB → "No difference detected" (zero drift); full vitest suite incl. integration tests | Pass |
| 10 | `apps/api/src/app.ts`, `apps/api/src/server.ts` (+ 2 new tests in `app.test.ts`) | Added `GET /ready`, checking DB (`SELECT 1`) + Redis (`PING`) with a 1.5s timeout each, via a `checkReadiness` option injected from `server.ts` so `app.ts` stays DB/Redis-free | No prior readiness check existed — `/health` was liveness-only; a Kubernetes readiness probe based on it would route traffic to a pod that can't reach its dependencies | `tsc --noEmit`, `eslint`, full vitest suite | Pass |
| 11 | `apps/api/src/app.ts` | `/uploads` now served with `maxAge: "365d", immutable: true` | Every upload key is a never-reused `randomUUID()` — content-immutable by construction; the prior default (`maxAge: 0`) forced a conditional GET + disk `stat()` on every repeat image view and would defeat CloudFront edge caching once added | `tsc --noEmit`, `eslint`, full vitest suite, full production build | Pass |
| 12 | New `apps/api/src/shared/logger.ts`; applied in `error-handler.ts`, `rate-limit.ts`, `catalog-cache.ts`, `config/redis.ts`, the claim-limiter | Structured every existing error-path log call as one-line JSON with consistent fields | Prior logs were interpolated strings, unqueryable in CloudWatch Logs Insights; this adds zero new log volume (confirmed no per-request logging exists) | `tsc --noEmit`, `eslint`, full vitest suite | Pass |
| 13 | `apps/api/src/modules/auth/interface/http/auth.routes.ts`, `apps/api/src/middleware/rate-limit.ts` (added `keyExtractor`/`byBodyField`) | Added a second, email-keyed rate limiter (5/10min) on `register/start`, `register/resend`, `forgot-password`, `reset-password/resend`, alongside the existing IP-keyed one | An attacker with multiple IPs could spam one victim's inbox with OTP/reset emails — each IP got its own fresh per-IP budget against the same target | `tsc --noEmit`, `eslint`, full vitest suite incl. `admin-auth-rate-limit.integration.test.ts` and the full `auth.integration.test.ts` (which exercises these exact routes at real volume with `uniqueEmail()` per test) | Pass |
| 14 | `apps/api/src/modules/cart/interface/http/cart.routes.ts` | Added a 120/5min-per-IP rate limiter to all 7 cart mutation routes (add/update/remove/change-variant/merge/coupon apply/remove) | Every one was guest-accessible with zero rate limiting — a scripted client could generate unbounded DB writes | `tsc --noEmit`, `eslint`, full vitest suite incl. `cart.integration.test.ts` | Pass |
| 15 | `docker-compose.yml` | Added `command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru` to the Redis service | Redis had no memory cap or eviction policy — unbounded growth under real load had no configured backstop; `allkeys-lru` is correct since nothing stored today is exempt from eviction | Manual review (no test harness covers docker-compose config) | N/A — config-only |
| 16 | `.github/workflows/ci.yml` | Added a `gitleaks` secret-scanning step (at checkout) and a `pnpm audit --prod` step (after install) | No automated gate previously existed for either — the `qs`/`sharp` CVEs already in the codebase's own `pnpm-workspace.yaml` overrides were found and fixed by hand, not by CI | YAML validated with a real parser (`python3 -c "import yaml..."`); steps confirmed in correct order | Pass (17 steps, valid YAML) |
| 17 | `apps/api/package.json` (via `pnpm update`), `pnpm-workspace.yaml` (new overrides: `postcss`, `deepmerge-ts`, `js-yaml`) | Bumped `multer` 2.2.0→2.3.0 and `nodemailer` 9.0.6→9.1.1 within their existing semver ranges; force-pinned 3 more transitive dependencies via the same override pattern already used for `qs`/`sharp` | `pnpm audit --prod` found 14 real vulnerabilities (8 high) before this fix, including 3 high-severity multer DoS issues directly relevant to the upload endpoints this review examined | `pnpm audit --prod` (14→0), full monorepo `tsc --noEmit` + `eslint` + full vitest suite (742/742) + full production build (`api`, `web`, `admin`) | Pass — zero vulnerabilities in production dependencies |
| 18 | `apps/web/src/features/auth/hooks/useAuth.tsx`, `apps/web/src/features/cart/hooks/useCart.tsx` | Wrapped both context `Provider` values in `useMemo` | Both were passing a fresh object literal on every render, inconsistent with the existing (correct) pattern in `SelectedVariantProvider` | `tsc --noEmit`, `eslint`, full production build | Pass |

**Full validation run performed after all changes** (not just per-fix): `pnpm run typecheck` (9/9 packages), `pnpm run lint` (9/9 packages), `pnpm --filter @woobe/api run boundaries:check` (621 modules, 1996 dependencies, zero violations), full `vitest run` in `apps/api` (100 test files, 742 tests, including every integration test against a real Postgres + Redis — not mocked), `pnpm --filter @woobe/utils run test` and `pnpm --filter @woobe/validation run test` (36 tests), and `pnpm run build` (all three apps compile and produce a production bundle).

**Environment note**: integration tests were run against the actual local `woobe_dev`/`woobe_test` Postgres databases and a local Redis (this sandbox has no Docker; the project's `docker-compose.yml` services were substituted with the equivalent already-running native services on the host, confirmed to be this project's real databases, not an unrelated instance, via `prisma migrate status`).

---

## Remaining Work Before Production

Ordered by dependency — items later in the list either depend on or are less urgent than items earlier in it.

**A. Must fix before cloud deployment**
1. Migrate media storage from local disk to S3 (or Cloudinary), implementing a new adapter behind the already-sufficient `MediaStoragePort` — this is a hard blocker for any multi-replica or Kubernetes deployment, not a nice-to-have.
2. Decide EKS pod CPU sizing and RDS instance class, then set an explicit `connection_limit` on `DATABASE_URL` (or introduce PgBouncer) sized to `(planned replicas × per-instance limit) ≤ RDS max_connections − headroom`.

**B. Should fix before first real traffic**
3. Split `ProductRepositoryPort` and give `staff` its own `StaffRepositoryPort` (closes the two confirmed ISP violations and the one confirmed cross-module coupling) — needs its own verification pass against every consumer and test mock.
4. Add a partial unique index on `Refund.orderId` (WHERE `returnId IS NULL`) after confirming no existing violations, closing the one remaining "safe today, fragile later" correctness gap.
5. Decide on and implement a guest-cart cleanup job.
6. Bound `findBestSellingVariantQuantities` to a rolling window once a "recent" definition is decided.
7. Add a real error-tracking SDK (e.g. Sentry) and BullMQ queue-depth alerting — both are team/tooling decisions, not code fixes.

**C. Can fix after launch**
8. Extract a shared `DataTable` component for the admin app's 10 near-identical tables.
9. Add pagination to the coupons admin list once coupon-count growth is actually observed.
10. Consider cursor-based pagination for the public product listing if/when catalog size or deep-page usage grows enough to matter.
11. Relocate shared enums to a package both `@woobe/types` and `@woobe/validation` can depend on, then remove `checkout.schema.ts`'s hardcoded duplicate.

**D. Do not fix**
- Do not replace Postgres row-locking with Redis locks.
- Do not force `STAFF_ROLE` to mechanically derive from `ROLE` — the current explicit lists are clearer given each already documents why it differs, and this review found no actual drift.
- Do not add a full observability/metrics platform before there's a running production system generating data worth watching.
- Do not add container/IaC security scanning before a Dockerfile or IaC files exist.

---

*This report supersedes the earlier reconnaissance report wherever the two conflict (the STAFF_ROLE/ROLE "drift" claim and the "no upload size limit" claim are both retracted). All fixes listed above are live in the working tree; nothing in this report describes a hypothetical or unapplied change.*
