# Development Rules (non-negotiable)

These are correctness/security rules, not style preferences. A PR that violates one of these does not merge, regardless of schedule pressure. See `project_planning/plan.md` and `project_planning/architecture.md` for the full ADRs these are drawn from.

1. **Never trust the client for price, tax, weight, or stock.** Every price/weight/stock figure used at checkout is computed server-side, inside the transaction, from live Postgres state — never from a client-supplied value, never from cache (ADR-017, ADR-021, `plan.md` §6).
2. **No card, UPI, or bank credential data ever touches Woobe's servers.** Razorpay Checkout (hosted/embedded) handles all sensitive payment input. Woobe stores only Razorpay's returned identifiers (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) (ADR-016).
3. **Payment/order confirmation is webhook-authoritative, never client-redirect-authoritative.** An order moves to `CONFIRMED` only after a signature-verified Razorpay webhook confirms capture (ADR-014).
4. **All money is `Int` paise, all weight is `Int` grams.** Never floats, never strings, in any schema, DTO, or calculation. Convert only at the display boundary (`packages/utils`).
5. **Only a module's own `infrastructure/repositories` file imports that module's Prisma models.** No cross-module direct DB access (ADR-010, enforced by dependency-cruiser in CI).
6. **`apps/web` and `apps/admin` never import `packages/database` or query Postgres directly — not even from Server Components/Server Actions.** All data access goes through `apps/api` over HTTP (ADR-019).
7. **Destructive migrations require an explicit human-reviewed flag, never auto-applied.** See `scripts/check-destructive-migration.mjs` and the CI gate in `.github/workflows/ci.yml` (ADR-013).
8. **No `console.log`, secrets, or PII in logs.** Use the structured logger once it lands (Week 4 observability); until then, no ad-hoc `console.log` left in committed code.
9. **Idempotency on every financially-effectful retry path.** Checkout, webhook processing, and refund confirmation are all safe to receive twice — enforced via unique constraints (`(provider, event_id)` on `webhook_events`, `(couponId, orderId)` on `coupon_redemptions`), not "we just won't send it twice."
