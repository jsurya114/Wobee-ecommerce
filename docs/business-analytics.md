# Business analytics dashboard

The admin dashboard (`apps/admin`, super_admin only) answers the owner's business
questions from **PostgreSQL and first-party storefront events**. Prometheus stays
operational-only (API latency, worker jobs, infrastructure) and is never a source
for business numbers.

- **Endpoint:** `GET /api/v1/admin/analytics/dashboard?range=today|7d|30d|90d|mtd|custom&from=&to=&compare=previous|none`
  — one typed payload (`BusinessDashboard`, `packages/types/src/business-dashboard.ts`), cached ~45 s.
- **Definitions:** every metric is defined once, next to the SQL, in
  `apps/api/src/modules/analytics/domain/metric-definitions.ts`. The admin tooltips quote them.
- **Time:** every day boundary is an Asia/Kolkata calendar day; windows are half-open `[start, end)`.

## What must be configured for the numbers to be meaningful

| Metric | Needs | Where |
|---|---|---|
| Net profit, inventory at cost, revenue margin | Product cost | Admin → Products → a product → **Cost** panel (cost/kg for weight-priced products, per-piece cost per variant for fixed-price). Super_admin only. |
| Conversion funnel, visitors | Storefront tracking | Automatic once the web app is deployed with this release (anonymous session id, honours Do-Not-Track). |
| Payment failure reasons | Razorpay `payment.failed` webhooks | Requires the production webhook to be configured (`RAZORPAY_WEBHOOK_SECRET`). |

Costs are **snapshotted onto each order item at order time** (`OrderItem.unitCostPaiseSnapshot`), so
profit history never changes when a cost is edited later. Orders placed before costs were configured
have no snapshot and are reported as *not covered* — the dashboard shows the coverage % instead of
inventing a cost.

## What the profit figure is — and is not

"Net profit (known costs)" = net sales of cost-covered items − their recorded product cost.
**Not recorded, therefore not included:** payment-gateway fees, courier/shipping cost (and, for the same
reason, shipping revenue), packaging, RTO handling, overheads. Do not describe it as true net profit
until those are captured.

## Deploying

The release adds one **additive** migration (`20260921000000_business_analytics`): new nullable cost
columns, `orders.analyticsSessionId`, the `analytics_events` table and read indexes. The standard SSM
deploy (`RunMigrations=true`) applies it. Deploy the API **before** the storefront so the collector
exists when the new web build starts sending events (a missing collector is harmless — events are
fire-and-forget — but nothing would be recorded).

## Known limitations

- No courier failure reasons or RTO timestamp exist, so RTO is a cohort measure (orders *shipped* in
  the period, by current status) with no failure-reason breakdown.
- Carts store no price, so abandoned-cart value is at **current** prices.
- Bots are not filtered from visitor sessions.
- Inventory value/units are as-of-now (there is no historical stock ledger), so they carry no
  period comparison.
