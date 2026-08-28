# Decisions Pending Client/Business Confirmation

Items here are built with an explicit, clearly-labeled placeholder so development isn't blocked. Every placeholder must be swapped for a confirmed value before production launch — grep the codebase for `DECISIONS_PENDING` to find every call site.

| # | Decision | Current placeholder | Where it lives | Needs confirmation from |
|---|---|---|---|---|
| 1 | GST rate applied at checkout | Flat 5% (placeholder — apparel GST commonly 5% or 12% by price slab in India) | `apps/api/src/modules/orders` tax calculation (Day 4) | Client / accounting |
| 2 | Standard shipping fee for carts between 1,000g–1,499g (below the 1,500g free-delivery threshold, ADR-021) | Flat ₹50 (`ShippingRule.standardFeePaise` seed value) — flat vs. weight-tiered not yet decided | `packages/database` seed (`ShippingRule`), `apps/api/src/modules/shipping` | Client |
| 3 | Default ₹/kg pricing rate | ₹1,200/kg demo value (`PricingSetting.defaultRatePerKgPaise` seed) — for seeded demo products only | `packages/database` seed (`PricingSetting`) | Client (real catalogue pricing) |
| 4 | Razorpay test-mode credentials | Stub values in `.env.example` (`RAZORPAY_KEY_ID` etc.) | `.env` (local, gitignored) | User will provide before Week 1 Day 5 |
| 5 | Return window (days after delivery a customer may request a return) | 7 days (constant, `RETURN_WINDOW_DAYS` in `apps/api/src/modules/returns/domain`) — common apparel-return-window default, not a stated business rule | `apps/api/src/modules/returns` (Week 2 Day 6) | Client |

**Rule:** nothing on this list may be silently "finalized" by assumption. When a real value arrives, update the placeholder, remove the row (or mark it resolved with a date + link), and note it in `journal.md`.
