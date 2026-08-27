# Admin Order View — Design Spec

**Status:** Approved for implementation
**Date:** 2026-08-26
**Author:** Claude Code, with Jasil

## 1. Context & Goal

`apps/admin` is currently a single placeholder page. The original 4-week
plan (`plan.md` §6, Week 3) calls for a "basic admin order view" — this is
that catch-up item. Per explicit direction, it's being built two ways at
once:

1. **A real, working admin order-management feature** — staff can log in,
   see all orders, open one, and drive it through its lifecycle
   (confirm → processing → shipped → delivered, or cancel).
2. **Scaffolded so next week's much larger admin scope** (product
   management, inventory, business settings, staff management, returns
   review) **slots in without restructuring anything already built.**

This spec covers only the admin order-view slice. It is not a returns/
refunds system, not a product-management UI, and not a settings UI —
those stay Week 2–4 scope per `week1_excecution_prompt.md`'s own exclusion
list. The one piece of Week-4 scope pulled forward is narrow and
explicit: see §4.3.

## 2. Explicitly In Scope

- Staff login (admin-only, all four ADR-024 roles enforced by permission,
  not just authenticated-vs-not)
- Order list: paginated, filterable by status, searchable by order
  number / customer email
- Order detail: full snapshot (contact, shipping address, line items with
  price/tax snapshot, payment method + status, current status)
- Status-transition actions matching the state diagram in
  `architecture.md` §4: `CONFIRMED → PROCESSING → SHIPPED → DELIVERED`,
  and `CONFIRMED|PROCESSING → CANCELLED`
- Shipping a package captures a tracking number + carrier
- Cancelling a paid order triggers a real refund attempt (§4.3) — this is
  the one piece of correctness that cannot be deferred, per the reasoning
  in §4.3
- Every transition writes an audit-log entry (who, what, on which order,
  when)
- An admin dashboard shell (sidebar + top bar) with a nav entry for every
  planned admin section, most of them marked "coming soon"

## 3. Explicitly Out of Scope (unchanged from the Week 1 exclusion list)

- Product-management UI/API, inventory-management UI/API, business
  settings UI/API (ADR-023), staff/role management UI/API — Week 2–4
- **The customer-initiated return/exchange flow** (`RETURN_REQUESTED →
  RETURN_APPROVED → REFUND_INITIATED`, its own storefront + admin UI,
  the `Return` entity's full lifecycle) — stays Week 4 scope entirely.
  §4.3 pulls forward only the refund *mechanism* for the narrower
  admin-cancellation case; it does not build the Return entity's request/
  approval workflow.
- A returns/refunds admin review queue — Week 4
- Order search beyond order-number/email exact-ish match (no full-text,
  no date-range filter) — nice-to-have, not blocking
- Split-shipment / multi-package tracking (see §4.1's note on this)
- Admin activity-log *viewing* UI (the audit log is written now; a page
  to browse it is next week's concern)

## 4. Backend Design

### 4.1 Schema changes (one expand-only migration)

```prisma
model Order {
  // ...existing fields unchanged...
  trackingNumber     String?
  carrier            String?
  shippedAt          DateTime?
  deliveredAt        DateTime?
  cancelledAt        DateTime?
  cancellationReason String?
}

model AdminAuditLog {
  id         String   @id @default(uuid())
  actorId    String
  actorRole  Role
  action     String
  entityType String
  entityId   String
  metadata   Json?
  createdAt  DateTime @default(now())

  actor User @relation(fields: [actorId], references: [id])

  @@index([entityType, entityId])
  @@index([actorId])
  @@map("admin_audit_logs")
}
```

**Deliberate decision, flagged not silent:** tracking info lives directly
on `Order` rather than a separate `Shipment` entity. Reasonable for
single-warehouse, single-package fulfillment (the only kind this app
does). Forecloses split-shipment without a later migration — call this
out explicitly in the PR description, don't let it read as an oversight.

### 4.2 New module: `audit` (leaf, zero dependencies)

`apps/api/src/modules/audit/` — owns `AdminAuditLog`. Deliberately has no
dependency on any other module (not even `admin`) so that `orders`, and
later every other module, can import its use-case directly without ever
creating an import cycle.

- `domain/entities/audit-log.entity.ts`
- `application/use-cases/record-audit-log.use-case.ts` — `execute(entry: { actorId, actorRole, action, entityType, entityId, metadata? }, tx?)`
- `infrastructure/repositories/audit-log.repository.ts` — the only file here allowed to import `@woobe/database`
- `audit.module.ts` — exports `recordAuditLogUseCase`, `router` (empty `Router()` for now — a future "activity log" page mounts here without touching any other module)

### 4.3 Cancellation-triggers-refund (the one non-deferrable piece)

**Why this can't wait:** `CONFIRMED` means a Razorpay payment was already
webhook-verified and captured (ADR-014), or a COD order's accounting
entry was recorded. If admin cancellation only released inventory, a
customer who paid via Razorpay would have paid for a cancelled order with
no automatic path to get the money back. That's a real-money correctness
bug, not a nice-to-have.

**Module-cycle constraint that shapes this:** `payments` already imports
`orders`' use-cases (to confirm/fail orders on webhook events). If
`orders` imported anything from `payments` (directly, or transitively via
`refunds` → `payments`), that's a circular module dependency
(`orders → refunds → payments → orders`). Resolution:

- **`refunds` module gets built out now** (pulled forward from Week 4,
  *only* this path — see §3's explicit scope note), owning `Refund`.
  It does **not** import `payments`' module internals or reach into
  `Payment` via open Prisma access. Instead, `payments` exposes exactly
  two narrow, single-purpose seams that `refunds` calls through
  `payments.module.ts` (same direct-import-of-a-sibling's-exported-
  use-case style already used throughout this codebase — no new port/
  adapter machinery needed):
  - `getPaymentForOrderUseCase.execute(orderId)` — a thin new use-case
    wrapping the already-existing `PaymentRepositoryPort.findByOrderId`.
  - `markPaymentRefundedUseCase.execute(paymentId, providerRefundId, tx)`
    — a new method added to `PaymentRepositoryPort`/`PaymentRepository`
    (`status: "REFUNDED"`), wrapped in an equally thin new use-case. This
    is the **only** write path to `Payment.status = "REFUNDED"` anywhere
    in the codebase.
  - **This is split ownership by transition type, not a blanket
    exception:** `payments` owns every write to `Payment` that belongs to
    the *capture* lifecycle (`CREATED → PENDING → CAPTURED/FAILED`);
    `refunds` triggers the one write that belongs to the *refund*
    lifecycle (`CAPTURED → REFUNDED`), through a method `payments` itself
    exposes and owns the implementation of. `refunds` never imports
    `@woobe/database` for anything except its own `Refund` table. State
    this explicitly in the PR description — same boundary as everywhere
    else in this codebase, just narrower than "whole table," and worth
    spelling out so it doesn't read as a shortcut to whoever reviews it
    in a month.
  - `refunds` gets its own minimal Razorpay client
    (`infrastructure/services/razorpay-refund.service.ts`, same
    stub-key-guard pattern as `payments`' `RazorpayService`) — wraps
    `client.payments.refund(razorpayPaymentId, { amount })`. This one is
    a genuinely different SDK surface than `payments`' `orders.create()`,
    not a duplication of the same logic.
  - `refunds` module: `application/use-cases/issue-refund-for-cancelled-order.use-case.ts`.
    Reads the order's `Payment` via a narrow read port into `payments`
    (`findByOrderId` — already exists on `PaymentRepositoryPort`, exposed
    read-only through `payments.module.ts`, e.g.
    `getPaymentForOrderUseCase`). Decides purely from the payment record,
    not the caller's belief about payment method:
    - No payment row, or `provider !== "RAZORPAY"`, or `status !==
      "CAPTURED"` → no gateway call needed (this is exactly the COD
      case: COD's `Payment.status` is set to `CAPTURED` at order-confirm
      time per `ConfirmCodOrderUseCase`, but no real money has moved yet
      since COD collects cash at delivery — cancelling pre-delivery owes
      nothing back). Returns `{ refundIssued: false, reason: "not-applicable" }`.
    - Otherwise, calls the Razorpay refund client. On success: writes a
      `Refund` row (`status: "COMPLETED"`, `providerRefundId`), calls
      `markPaymentRefundedUseCase`, returns `{ refundIssued: true,
      refundId }`.
    - On gateway failure (including today's stub Razorpay keys — this
      **will** fail in this dev environment, same as the storefront
      "Pay now" retry does): writes a `Refund` row with `status:
      "FAILED"` for manual follow-up, does **not** throw. Returns `{
      refundIssued: false, reason: "gateway-error" }`.
    - Defensive idempotency: checks for an existing `Refund` row for the
      order before calling the gateway (same "soft guard, not airtight
      under true concurrency" pattern already accepted for
      `CreateRazorpayOrderUseCase` in Day 5 — the real idempotency
      backstop is `orders`' own conditional status transition below,
      this is belt-and-suspenders).
  - `refunds.module.ts` exports `issueRefundForCancelledOrderUseCase`.

- **`orders` module** gains `CancelOrderUseCase`:
  - New port `application/ports/refund-issuer.port.ts`:
    `{ issueRefundIfNeeded(orderId): Promise<{ refundIssued: boolean }> }`
    — wired in `orders.module.ts` to `refunds`' exported use-case (new
    edge: `orders → refunds`; `refunds` has no back-edge to `orders` or
    `payments.module.ts`, so no cycle).
  - New port `application/ports/inventory-release.port.ts`:
    `{ release(items, tx): Promise<void> }` — wired to inventory's
    already-exported `releaseReservationUseCase` (same use-case
    `payments` already wires into its own, differently-shaped
    `InventoryFinalizationPort` — this codebase's established
    one-port-shape-per-consuming-module convention, not a new pattern).
  - New port `application/ports/audit-logger.port.ts` — wired to
    `audit`'s `recordAuditLogUseCase`.
  - `execute(orderId, actor: { id, role }, reason?)`:
    1. Guard: current status must be `CONFIRMED` or `PROCESSING` (else
       `ConflictError`).
    2. Conditional transition (`transitionStatus`, extended to also set
       `cancelledAt`/`cancellationReason` — see §4.4) to `CANCELLED`
       inside one transaction, alongside the inventory release — both
       commit together, matching ADR-015's existing pattern.
    3. If `changed: false` (already cancelled/transitioned by a
       concurrent call) → idempotent no-op, skip steps 4–5 entirely
       (this is also what makes the refund's own idempotency mostly
       moot in practice — a second call never gets this far).
    4. Outside the transaction (external HTTP call, never inside a DB
       transaction): call `refundIssuer.issueRefundIfNeeded(orderId)`.
    5. Write the audit-log entry (`action: "ORDER_CANCELLED"`, metadata:
       `{ reason, refundIssued }`) regardless of whether the refund
       attempt succeeded — the audit trail records what was *attempted*,
       not just what fully succeeded.
    6. Return `{ order, refundIssued }` so the admin UI can show "cancelled
       — refund pending, needs manual follow-up" when a gateway call
       failed, rather than a bare success.

### 4.4 Other order-transition use-cases

All three follow the same shape — conditional `transitionStatus`, one
DB transaction, then an audit-log write — and all take `actor: { id,
role }`:

- `StartProcessingOrderUseCase` — `CONFIRMED → PROCESSING`. Audit action
  `ORDER_PROCESSING_STARTED`.
- `ShipOrderUseCase(orderId, actor, { trackingNumber, carrier })` —
  `PROCESSING → SHIPPED`, sets `trackingNumber`/`carrier`/`shippedAt`.
  Audit action `ORDER_SHIPPED`, metadata includes tracking info.
- `DeliverOrderUseCase` — `SHIPPED → DELIVERED`, sets `deliveredAt`.
  Audit action `ORDER_DELIVERED`.

`OrderRepositoryPort.transitionStatus` gains a fifth, optional parameter:
`extraFields?: Partial<Pick<OrderEntity, "trackingNumber" | "carrier" | "shippedAt" | "deliveredAt" | "cancelledAt" | "cancellationReason">>`,
merged into the same conditional `updateMany`'s `data` — still one atomic
conditional write, not a second query.

Also add: `ListOrdersUseCase` (admin-scoped — no `userId` filter, takes
`{ status?, search?, page, pageSize }`, returns `{ items, total }`) and
`GetOrderForAdminUseCase` (same shape as the existing `GetOrderUseCase`
minus its ownership check — kept as a separate use-case rather than
adding an "admin bypass" flag to the customer-facing one, so that one's
security invariant stays simple and untouched).

### 4.5 `admin` module (currently an empty placeholder)

Stays a thin, permission-gated HTTP gateway — no business logic of its
own, no Prisma access. Its stale placeholder comment ("Built out: Week 1
Day 5... Full admin dashboard is Week 2-4 scope") gets corrected to
reflect what's actually here now.

**Auth** (`interface/http/admin-auth.{controller,routes}.ts`) — reuses
`auth` module's already-role-agnostic use-cases directly (imported from
`auth.module.ts`, exactly how `orders.module.ts` already imports from
`cart`/`pricing`/`inventory`/`shipping`):
- `POST /api/v1/admin/auth/login` — calls `loginUserUseCase`; if the
  resulting role is `CUSTOMER`, discard the tokens and respond
  `403 Forbidden` ("Not a staff account") rather than issuing an admin
  session.
- `POST /api/v1/admin/auth/refresh`, `POST /api/v1/admin/auth/logout`,
  `GET /api/v1/admin/auth/me` — same shape as the customer routes, reading/
  writing the **admin-specific cookie** (§4.6) instead of `refresh_token`.

**Orders** (`interface/http/admin-orders.{controller,routes}.ts`) — every
route behind `authGuard` + `requirePermission(PERMISSIONS.MANAGE_ORDERS)`
(already excludes `CUSTOMER` and `PRODUCT_MANAGEMENT_STAFF` for free):

| Method | Path | Use-case |
|---|---|---|
| GET | `/api/v1/admin/orders` | `ListOrdersUseCase` |
| GET | `/api/v1/admin/orders/:id` | `GetOrderForAdminUseCase` |
| POST | `/api/v1/admin/orders/:id/processing` | `StartProcessingOrderUseCase` |
| POST | `/api/v1/admin/orders/:id/ship` | `ShipOrderUseCase` |
| POST | `/api/v1/admin/orders/:id/deliver` | `DeliverOrderUseCase` |
| POST | `/api/v1/admin/orders/:id/cancel` | `CancelOrderUseCase` |

`admin.module.ts` also registers itself in `modules/index.ts`'s list
(already does), and the new `audit` module gets added there too at
`/api/v1/audit` (empty router today, ready for next week).

### 4.6 Admin session cookie

New constant `ADMIN_REFRESH_TOKEN_COOKIE = "admin_refresh_token"`,
scoped to path `/api/v1/admin` — never sent to `/api/v1/auth/*`, and
never collides with the storefront's `refresh_token` even in the same
browser.

Matches the customer cookie's `httpOnly: true`, `secure: env.NODE_ENV
=== "production"`, `signed: true` exactly (confirmed against
`refresh-cookie.ts` — this is really how the existing cookie is
configured). One deliberate difference: `sameSite: "strict"` instead of
the customer cookie's `"lax"` — justified by the admin session's higher
privilege (order cancellation, refunds) and the fact that admin has no
legitimate cross-site entry point the way a payment-gateway redirect
back to the storefront might. Does not change the customer cookie at
all. Flag both facts explicitly in the PR description: the customer
cookie is actually `lax` (not `strict`, despite that being the
assumption going in), and the new admin cookie is deliberately stricter
than it, not matching it exactly.

### 4.7 Validation schemas (`packages/validation`)

- `admin/order.schema.ts`: `shipOrderSchema { trackingNumber: string().min(1), carrier: string().min(1) }`, `cancelOrderSchema { reason: string().optional() }`. Login reuses the existing `loginSchema` as-is.

### 4.8 Seed script

Adds two more users alongside the existing `super_admin`
(`admin@woobe.in`), same dev-only password convention:
- `orders@woobe.in` — `ORDER_PROCESSING_STAFF`
- `catalog@woobe.in` — `PRODUCT_MANAGEMENT_STAFF`

Lets RBAC boundaries actually be exercised in the browser (e.g.
confirming `catalog@woobe.in` gets a 403 on every `/admin/orders`
route), not just verified by reading `permissions.ts`.

### 4.9 Module dependency graph after this change

```
audit         (leaf: only Prisma)
auth          (leaf: only Prisma)
inventory     (leaf: only Prisma)
payments  →   orders   (existing, unchanged)
orders    →   audit, refunds, cart, pricing, inventory, shipping
refunds   →   payments (two narrow, single-purpose use-cases only), audit
admin     →   auth, orders, audit
```

No cycle: `admin` is the only thing that imports `orders`, `orders`
never imports `admin` or `payments`, and `refunds`' one edge into
`payments` is a single exported method, not a re-entry into `orders`.

## 5. Frontend Design (`apps/admin`)

Mirrors `apps/web`'s `features/*` convention exactly
(`architecture.md` §4.2 already specifies this for `apps/admin`).

```
apps/admin/
├── app/
│   ├── login/page.tsx                       # routing only
│   ├── (dashboard)/
│   │   ├── layout.tsx                       # shell: sidebar + top bar, session guard
│   │   ├── page.tsx                         # redirects to /orders (no dashboard-home scope creep)
│   │   └── orders/
│   │       ├── page.tsx                     # list
│   │       └── [id]/page.tsx                # detail
│   └── layout.tsx
├── features/
│   ├── auth/
│   │   ├── api/admin-auth.client.ts
│   │   ├── hooks/useAdminAuth.tsx           # AdminAuthProvider, mirrors apps/web's useAuth exactly
│   │   └── components/LoginForm.tsx
│   ├── order-management/
│   │   ├── api/admin-orders.client.ts
│   │   ├── hooks/useAdminOrders.ts, useAdminOrder.ts
│   │   └── components/
│   │       ├── OrdersTable.tsx
│   │       ├── OrderFilters.tsx             # status dropdown, search box
│   │       ├── OrderDetail.tsx
│   │       ├── OrderStatusActions.tsx       # buttons gated by current status + permission
│   │       └── OrderTimeline.tsx
│   └── shell/
│       ├── nav-config.ts                    # the extensibility hook — see below
│       └── components/{Sidebar,TopBar}.tsx
└── lib/api-client.ts                        # identical shape to apps/web's, NEXT_PUBLIC_ADMIN_API_URL
```

**`nav-config.ts` is the concrete answer to "build it so more is clearly
coming":**

```ts
export const ADMIN_NAV: { label: string; href: string; status: "live" | "coming-soon"; permission: Permission }[] = [
  { label: "Orders",   href: "/orders",     status: "live",        permission: "MANAGE_ORDERS" },
  { label: "Products", href: "/products",   status: "coming-soon", permission: "MANAGE_CATALOG" },
  { label: "Inventory",href: "/inventory",  status: "coming-soon", permission: "MANAGE_INVENTORY" },
  { label: "Settings", href: "/settings",   status: "coming-soon", permission: "MANAGE_SETTINGS" },
  { label: "Staff",    href: "/staff",      status: "coming-soon", permission: "MANAGE_STAFF" },
  { label: "Returns",  href: "/returns",    status: "coming-soon", permission: "MANAGE_ORDERS" },
];
```

`Sidebar` renders every entry the logged-in user's role has permission
for; `coming-soon` entries render disabled with a small badge instead of
being hidden, so staff can see the shape of what's coming. Next week's
work becomes: build the feature folder, add the route, flip one line
here — not touch the shell.

**Session guard:** `(dashboard)/layout.tsx` mirrors `apps/web`'s
account-page guard pattern — redirect to `/login` if
`useAdminAuth().status === "unauthenticated"` once the silent-refresh
attempt settles (`status !== "loading"`).

**Order detail actions:** `OrderStatusActions` shows only the button(s)
legal for the order's current status (`Mark as Processing` only when
`CONFIRMED`, etc.), disabled entirely if the logged-in role lacks
`MANAGE_ORDERS` (defense in depth — the API already enforces this, but a
staff member without the permission shouldn't see a live-looking button
that 403s). "Ship" opens a small inline form for tracking number +
carrier before submitting. "Cancel" opens a confirmation with an
optional reason field, and the response's `refundIssued` flag drives
whether the success toast says "Order cancelled" or "Order cancelled —
refund needs manual follow-up."

## 6. Testing Plan

- Unit: the four transition use-cases' legal/illegal transition guards;
  `IssueRefundForCancelledOrderUseCase`'s three branches (no-payment/COD,
  successful Razorpay refund, gateway failure).
- Integration (`apps/api`, real Postgres): admin login rejects a
  `CUSTOMER` account; `MANAGE_ORDERS`-gated routes 403 for
  `product_management_staff`; full cancel-a-Razorpay-paid-order flow
  writes a `Refund` row and an `AdminAuditLog` row in the same test (with
  a stubbed/mocked Razorpay client for the success case, since real
  Razorpay isn't reachable in CI either); COD cancellation confirms no
  gateway call happens.
- Manual/browser (`chrome-devtools-mcp`): log in as each of the three
  staff-capable roles, confirm nav + route access matches
  `nav-config.ts`; walk one order through every status; cancel a
  Razorpay order and confirm the honest "refund needs manual follow-up"
  state shows (since this dev environment's Razorpay keys are still
  stubs — this will genuinely exercise the gateway-failure branch, not
  the success one).

## 7. PR Description Must Explicitly State

1. Tracking info lives on `Order`, not a `Shipment` entity — deliberate
   simplification for single-package fulfillment, forecloses
   split-shipment without a later migration.
2. `refunds`/`payments` split ownership of `Payment` writes by
   transition type (capture-lifecycle vs. refund-lifecycle) — not a
   blanket exception to the "one module per table" rule.
3. This pulls forward only the admin-cancellation refund path. The full
   customer-initiated return/exchange request flow (`Return` entity,
   `RETURN_REQUESTED → RETURN_APPROVED`, its own UI) is **not** built by
   this change and stays Week 4 scope.
4. The customer `refresh_token` cookie is `sameSite: "lax"` (confirmed
   against the actual code, not assumed) — the new `admin_refresh_token`
   is deliberately stricter (`"strict"`), not matched to it.
5. `AdminAuditLog` did not previously exist anywhere in the schema —
   this change adds it from scratch, it is not "already there and just
   unused."
