/**
 * THE definitions behind every business-dashboard number (2026-09-21). One
 * place, next to the SQL (../infrastructure/analytics.repository.ts) that
 * implements them — change a definition here first, then there. The admin UI
 * tooltips quote these.
 *
 * MONEY MODEL (from checkout): Order.totalPaise = subtotal + tax + shipping -
 * couponDiscount. Item `lineTotalPaise` is OFFER-adjusted, pre-coupon and
 * EXCLUDES GST; `OrderItem.discountPaise` is the coupon share allocated to the
 * line. Tax is exclusive, so it is reported separately and never sits inside
 * "net sales" or "profit".
 *
 * REALIZED SALE (what "sold" means everywhere below):
 *   - online (Razorpay): order in CONFIRMED / PROCESSING / PACKED / SHIPPED /
 *     DELIVERED AND its payment CAPTURED (or later REFUNDED). Realized at
 *     `placedAt`. (PACKED is included; the legacy SOLD_STATUSES list omitted it,
 *     silently dropping packed orders from revenue.)
 *   - COD: order DELIVERED AND its payment CAPTURED (cash collected). Realized at
 *     `deliveredAt`. A COD order that is merely confirmed/shipped is NOT a sale
 *     yet — it is "COD outstanding".
 *   - never realized: PENDING_PAYMENT, PAYMENT_FAILED, CANCELLED,
 *     RETURNED_TO_ORIGIN.
 * Webhook retries cannot double-count: sales come from `orders`/`payments`
 * (one payment row per order), never from webhook rows.
 *
 * GROSS SALES   = sum(max(basePrice, unitPrice) x qty) — list price, before offers.
 * OFFER DISC.   = sum(OrderItem.offerDiscountPaise) — already inside unit price.
 * COUPON DISC.  = sum(OrderItem.discountPaise).
 * RETURNED VALUE (ex-tax) = for each refunded return item:
 *     (lineTotal - couponShare) x returnedQty / itemQty, attributed to the
 *     period the REFUND was created (INITIATED or COMPLETED; FAILED ignored),
 *     and only for orders that are themselves realized sales.
 * NET SALES     = sum(lineTotal - couponShare) over realized orders in the
 *                 period - returned value in the period. Excludes tax + shipping.
 * REFUNDS (cash)= sum(Refund.amountPaise) in the period on realized orders
 *                 (includes tax/shipping; reported separately from net sales).
 * KG SOLD       = sum(orderItem.weightGrams x qty) / 1000 — the IMMUTABLE
 *                 order-item snapshot, never the variant's current weight —
 *                 minus the weight of refunded returned items.
 * REVENUE / KG  = net sales / kg sold; null when kg sold is 0.
 * AOV           = net sales / realized orders; null when there are none.
 *
 * KNOWN-COST PROFIT: only items carrying a cost snapshot participate.
 *     profit = (net sales of cost-covered items) - (their COGS).
 *   COGS is unitCostPaiseSnapshot x qty; returned goods are NOT credited back
 *   (conservative: assumes they are not resellable). NOT recorded, therefore
 *   excluded and stated in the UI: payment-gateway fees, courier cost,
 *   packaging, RTO handling cost, overheads. Shipping revenue is excluded for
 *   the same reason (its matching courier cost is unknown). Coverage % =
 *   cost-covered net sales / net sales. This is a contribution figure, never
 *   called "true net profit". With coverage 0 the profit is null.
 *
 * DELIVERY / RTO (cohort = orders SHIPPED in the period, i.e. shippedAt):
 *   delivered = now DELIVERED; RTO = now RETURNED_TO_ORIGIN; in transit = still
 *   SHIPPED. RTO rate = RTO / shipped. Delivery success = delivered /
 *   (delivered + RTO) — only orders with a final outcome. No courier failure
 *   reasons or RTO timestamp exist in the data, so none are shown.
 * COD OUTSTANDING (as of now): COD orders CONFIRMED/PROCESSING/PACKED/SHIPPED
 *   whose payment is still PENDING. Delivered-and-collected COD is excluded.
 *
 * PAYMENTS: failed attempts = distinct Razorpay `payment.failed` webhook
 *   events (unique per provider event id) in the period; the reason is
 *   normalised into a fixed set (payment-failure-reason.ts). Failure rate =
 *   failed / (failed + `payment.captured` events) in the period.
 *
 * FUNNEL (SESSION-based, sequential): cohort = anonymous sessions whose
 *   SESSION_STARTED fell in the period. Each later step counts sessions that
 *   also completed every earlier step: viewed a product -> added to cart ->
 *   started checkout -> placed an order that is not PENDING_PAYMENT /
 *   PAYMENT_FAILED / CANCELLED (linked via Order.analyticsSessionId). Steps are
 *   sessions, not people or orders — labelled as such in the UI.
 *
 * ABANDONED CART: an ACTIVE/ABANDONED cart with >= 1 item whose last activity
 *   (latest of cart/cart-item updatedAt) fell in the period and is at least 24 h
 *   old. Rate = abandoned / (abandoned + orders placed in the period — orders
 *   not PENDING_PAYMENT / PAYMENT_FAILED / CANCELLED).
 *   Value = items x CURRENT variant price (carts store no price snapshot).
 *
 * INVENTORY (as of now, not period-scoped): units = sum(quantityAvailable);
 *   kg = units x variant weight; value AT COST = units x unit cost (FIXED:
 *   variant.costPricePaise; WEIGHT_BASED: round(product.costPerKgPaise x
 *   weight/1000)); units without a configured cost are excluded from the value
 *   and counted in the coverage %. Retail value (units x current price) is shown
 *   separately and never called "inventory value". Low stock = sellable
 *   (available - reserved) in (0, LOW_STOCK_THRESHOLD).
 * SELL-THROUGH = units sold in the period (net of returns) /
 *   (units sold + units on hand now).
 *
 * CUSTOMERS: a buyer is identified by userId, else the lowercased order email
 *   (guests). Buyers = distinct identities with a realized order in the period;
 *   new = first-ever realized order fell in the period; returning = the rest;
 *   repeat buyers = >= 2 realized orders in the period.
 *
 * TIME: every day boundary is an Asia/Kolkata calendar day; windows are
 *   [start, end) so nothing double-counts across adjacent periods.
 */
export const ABANDONED_CART_INACTIVITY_HOURS = 24;
export const ABANDONED_CART_INACTIVITY_MS = ABANDONED_CART_INACTIVITY_HOURS * 60 * 60 * 1000;

export const REALIZED_ONLINE_STATUSES = ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "DELIVERED"] as const;
export const COD_OUTSTANDING_STATUSES = ["CONFIRMED", "PROCESSING", "PACKED", "SHIPPED"] as const;
export const FUNNEL_NOT_A_CONVERSION_STATUSES = ["PENDING_PAYMENT", "PAYMENT_FAILED", "CANCELLED"] as const;

/** Profit inclusions/exclusions, surfaced verbatim in the dashboard so the assumptions are never hidden. */
export const PROFIT_INCLUDED = ["Product cost (COGS) recorded at order time", "Discounts and refunds (via net sales)"] as const;
export const PROFIT_EXCLUDED = [
  "Payment-gateway fees",
  "Courier / shipping cost (and shipping revenue)",
  "Packaging and RTO handling cost",
  "Overheads",
] as const;
