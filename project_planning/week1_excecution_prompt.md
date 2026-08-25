# Woobe — Week 1 Execution Plan (Walking Skeleton: Login → Checkout)

You are continuing as Senior Software Architect and Technical Lead on Woobe. Architecture is approved (`ARCHITECTURE.md`, `PLAN.md`, ADR-001–018).

**Week 1 goal:** one working, demo-able vertical slice — register/login → browse seeded products → cart → checkout → pay (Razorpay test mode or COD) → order confirmed in the database. Not full-scope Week 2–4 features. Build backend and UI for each step together, same session, so API contracts and client code are validated against each other immediately rather than integrated at the end.

**Non-negotiable even at prototype speed:** server-side price/tax calculation, inventory row-locking on reservation, payment webhook signature verification + idempotency. These are correctness rules, not polish — cutting them now creates bugs (oversold stock, duplicate charges) that are far more expensive to fix later than to build right today.

**Explicitly deferred to Week 2+:** returns, refunds, reviews, wishlist, coupons, admin product-management UI (seed script only this week), full SEO, observability, full notification system, catalogue search refinement.

Stop after each day and report before continuing. Do not silently expand scope back to the original Week 2–4 breakdown.

---

## Day 1 — Foundation

- pnpm workspace: `apps/{web,admin,api}`, `packages/{database,types,validation,ui,config,utils}`
- Full Prisma schema per `PLAN.md` §3 (all domains modeled now — cheap to include, expensive to retrofit), money as `Int` paise, weight as `Int` grams
- Module boundary lint rule (ADR-010) wired into `apps/api/src/modules/*`
- Seed script: one warehouse (ADR-015), one admin user, default ₹/kg rate, **8–10 demo products with variants and stock** (enough to actually shop from)
- Basic CI: lint, typecheck, test, `prisma migrate diff` check (ADR-013)
- `docker-compose.yml` (Postgres + Redis), `.env.example`, `.gitignore`

**Done when:** `pnpm install` + `prisma migrate dev` + seed script all succeed; demo products are queryable in `prisma studio`.

---

## Day 2 — Auth (API + UI together) — ADR-018

- `AuthCredential` table (`method: 'password'`, extensible for OTP later)
- API: register, login, refresh, logout — bcrypt + JWT access/refresh, refresh token in httpOnly secure cookie
- RBAC middleware (`customer`/`admin`)
- UI: register + login pages in `apps/web`, wired to the endpoints above — real forms, real validation via `packages/validation`, real error states, not placeholders
- One protected route (e.g. "My Account" stub) to prove the cookie/JWT flow works in an actual browser, not just in tests

**Done when:** a person can register, log in, land on the protected route, refresh, and log out — in the browser.

---

## Day 3 — Catalogue + Cart (API + UI together) — ADR-011

- API: product listing (basic filters — category only, skip advanced search/sort for now), product detail
- UI: listing page, product detail page (variant selection, weight-based price display)
- API: cart (add/update/remove item), server-side recalculation of weight → price → subtotal on every read, guest `cart_id` cookie + merge-on-login with stock revalidation (ADR-011)
- UI: cart page showing product, variant, weight, rate, price, subtotal — matching original brief §"Cart" fields

**Done when:** a guest can browse, add items to cart, and see a cart total that was computed server-side (verify by tampering with a client value and confirming the server ignores it).

---

## Day 4 — Checkout, Inventory, Order Creation (API + UI together)

- UI: checkout page — guest or logged-in, mobile number, email, address, pincode, state
- API: checkout endpoint — inventory reservation via `SELECT ... FOR UPDATE` inside the checkout transaction (ADR-015, correctness non-negotiable), order creation with price/tax snapshot (original brief §6), GST calculated with a placeholder rate explicitly flagged in `DECISIONS_PENDING.md` as needing client/accounting confirmation, order state machine (`PENDING_PAYMENT` → ...)
- Coupons: skip entirely this week (deferred, not stubbed)

**Done when:** a checkout attempt correctly reserves stock (verify: two near-simultaneous checkouts on a stock=1 item — only one succeeds), and the order row has a full price/tax snapshot independent of current product state.

---

## Day 5 — Payments (Razorpay test mode + COD) + Order Confirmation

- Razorpay: Orders API integration, Razorpay Checkout on the client, webhook handler verifying `X-Razorpay-Signature`, unique constraint on `(provider, event_id)` for dedup (ADR-014) — order moves to `CONFIRMED` only after webhook-verified capture, never from the client redirect alone
- COD: order moves straight to `CONFIRMED` at checkout, no gateway step, clearly marked `payment_method: COD`
- UI: order confirmation page, minimal "My Orders" list (status only, no returns/refunds UI yet)

**Done when (Week 1 Definition of Done — full slice):**
- A person can complete: register → login → browse seeded products → add to cart → checkout → pay via Razorpay **test mode** → see a confirmed order
- Same flow works end-to-end with COD instead of Razorpay
- Duplicate webhook delivery does not double-confirm or double-charge an order (test this explicitly — resend the same webhook payload)
- Concurrent checkout on a stock=1 item — only one order succeeds, the other gets a clean out-of-stock response
- Zero TypeScript errors, zero module-boundary violations, `security-guidance` plugin clean on the diff

---

## Explicitly Out of Scope This Week

Returns/refunds, reviews, wishlist, coupons, admin product-management UI, SEO (sitemap/structured data/OG), observability/logging infra, full notification system, search/filter refinement beyond basic category filtering, multi-warehouse logic. These resume in the original Week 2–4 breakdown once the walking skeleton is confirmed working.