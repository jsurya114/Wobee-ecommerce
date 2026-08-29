# Admin Order View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a real, working admin order-management feature (staff login, order list/detail, full status-transition actions including a refund-triggering cancel), scaffolded so next week's product-management/inventory/settings/staff features slot into the same admin shell without restructuring.

**Architecture:** Backend follows this codebase's existing modular-monolith/Clean-Architecture convention exactly — new use-cases live in the module that owns the table they write to, cross-module calls go through directly-imported sibling-module use-case singletons (never new port/adapter files unless the interface itself needs to vary). Frontend mirrors `apps/web`'s `features/*` convention. See the spec for the full module-dependency-cycle reasoning.

**Tech Stack:** Express + Prisma (apps/api), Next.js App Router + React 19 (apps/admin), Zod (packages/validation), Vitest + Supertest (integration tests).

**Spec:** `docs/superpowers/specs/2026-08-26-admin-order-view-design.md`

## Global Constraints

- Every module's `infrastructure/` is the ONLY place in that module allowed to import `@woobe/database`/`@prisma/client` (ADR-010, enforced by `apps/api/.dependency-cruiser.cjs`) — `refunds` reads/writes `Payment` ONLY through `payments`' exported use-cases, never direct Prisma access to a table it doesn't own.
- `orders` must never import from `payments.module.ts` or `refunds` importing `payments.module.ts` — would recreate the cycle `orders → refunds → payments → orders` (payments already imports orders). `refunds` calls two narrow use-cases exported from `payments.module.ts`; that is the only edge between them.
- All money is `Int` paise, all weight is `Int` grams (existing convention, unchanged).
- Every order-transition use-case takes `actor: { id: string; role: Role }` and writes an `AdminAuditLog` entry.
- `admin_refresh_token` cookie: `httpOnly: true`, `secure: env.NODE_ENV === "production"`, `signed: true`, `path: "/api/v1/admin"`, `sameSite: "strict"` (deliberately stricter than the customer cookie's `"lax"` — see spec §4.6).
- Customer-initiated return/exchange flow (`Return` entity, its own UI) is explicitly OUT of scope — do not build it.
- No new `packages/ui` primitives (no Table/Select component) — admin list/filter UI uses plain semantic HTML + Tailwind directly in feature components, consistent with this app's "hand-authored, no kit" convention.

---

## Task 1: Schema migration — Order fields + AdminAuditLog

**Files:**
- Modify: `packages/database/prisma/schema.prisma`
- Create: migration via `prisma migrate dev` (auto-named)

**Interfaces:**
- Produces: `Order.trackingNumber/carrier/shippedAt/deliveredAt/cancelledAt/cancellationReason` (all nullable), `AdminAuditLog` model.

- [ ] **Step 1: Add fields to the `Order` model**

In `packages/database/prisma/schema.prisma`, inside `model Order { ... }`, add after the existing `exchangeOfOrderId String?` line:

```prisma
  trackingNumber     String?
  carrier            String?
  shippedAt          DateTime?
  deliveredAt        DateTime?
  cancelledAt        DateTime?
  cancellationReason String?
```

- [ ] **Step 2: Add the `AdminAuditLog` model**

Add this new model anywhere after `model Order { ... }` closes (e.g. right after `model OrderItem`):

```prisma
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

- [ ] **Step 3: Add the back-relation on `User`**

In `model User { ... }`, add a relation field alongside its other relations (e.g. near `orders Order[]` if present):

```prisma
  adminAuditLogs AdminAuditLog[]
```

- [ ] **Step 4: Generate and apply the migration**

Run: `set -a; source /Users/jasilm/Desktop/WOOBE/.env; set +a; pnpm --filter @woobe/database run migrate:dev -- --name add_order_fulfillment_fields_and_audit_log`

Expected: a new migration folder under `packages/database/prisma/migrations/`, applied cleanly, pure `ALTER TABLE ... ADD COLUMN` + `CREATE TABLE` (expand-only, no data loss prompt).

- [ ] **Step 5: Regenerate the Prisma client**

Run: `pnpm db:generate`

Expected: succeeds, `packages/database/generated/client` now has `trackingNumber` etc. on `Order` and a new `AdminAuditLog` model.

- [ ] **Step 6: Commit**

```bash
git add packages/database/prisma/schema.prisma packages/database/prisma/migrations
git commit -m "feat(database): add order fulfillment fields and admin audit log table"
```

---

## Task 2: `audit` module (leaf — owns `AdminAuditLog`)

**Files:**
- Create: `apps/api/src/modules/audit/domain/entities/audit-log.entity.ts`
- Create: `apps/api/src/modules/audit/application/ports/audit-log-repository.port.ts`
- Create: `apps/api/src/modules/audit/application/use-cases/record-audit-log.use-case.ts`
- Create: `apps/api/src/modules/audit/infrastructure/repositories/audit-log.repository.ts`
- Create: `apps/api/src/modules/audit/audit.module.ts`
- Modify: `apps/api/src/modules/index.ts`
- Modify: `apps/api/.dependency-cruiser.cjs` (none needed — the existing rule already covers any new module's `infrastructure/` automatically via the `^src/modules/[^/]+/infrastructure/` pattern)

**Interfaces:**
- Produces: `recordAuditLogUseCase.execute(entry, tx?)` — exported from `audit.module.ts`. `entry: { actorId: string; actorRole: Role; action: string; entityType: string; entityId: string; metadata?: unknown }`.

- [ ] **Step 1: Entity**

```typescript
// apps/api/src/modules/audit/domain/entities/audit-log.entity.ts
import type { Role } from "@woobe/types";

export interface AuditLogEntity {
  id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata: unknown;
  createdAt: Date;
}
```

- [ ] **Step 2: Port**

```typescript
// apps/api/src/modules/audit/application/ports/audit-log-repository.port.ts
import type { Role } from "@woobe/types";

export interface CreateAuditLogInput {
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
}

export interface AuditLogRepositoryPort {
  create(input: CreateAuditLogInput, tx?: unknown): Promise<void>;
}
```

- [ ] **Step 3: Use-case**

```typescript
// apps/api/src/modules/audit/application/use-cases/record-audit-log.use-case.ts
import type { CreateAuditLogInput, AuditLogRepositoryPort } from "../ports/audit-log-repository.port";

/**
 * Leaf module (zero dependencies on any other module) so every other
 * module can import this directly without ever creating an import cycle
 * (ADR-025). Called both inside a caller's own DB transaction (atomic with
 * a status change) and standalone (e.g. after an external refund call
 * completes) — `tx` is optional for exactly that reason.
 */
export class RecordAuditLogUseCase {
  constructor(private readonly repository: AuditLogRepositoryPort) {}

  execute(input: CreateAuditLogInput, tx?: unknown): Promise<void> {
    return this.repository.create(input, tx);
  }
}
```

- [ ] **Step 4: Repository (owns `@woobe/database` import for this module)**

```typescript
// apps/api/src/modules/audit/infrastructure/repositories/audit-log.repository.ts
import { Prisma, prisma } from "@woobe/database";
import type { AuditLogRepositoryPort, CreateAuditLogInput } from "../../application/ports/audit-log-repository.port";

type PrismaTx = Prisma.TransactionClient;

/** ADR-010: the only file in the audit module allowed to import @woobe/database. */
export class AuditLogRepository implements AuditLogRepositoryPort {
  async create(input: CreateAuditLogInput, tx?: unknown): Promise<void> {
    const client = (tx as PrismaTx | undefined) ?? prisma;
    await client.adminAuditLog.create({
      data: {
        actorId: input.actorId,
        actorRole: input.actorRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
```

- [ ] **Step 5: Composition root**

```typescript
// apps/api/src/modules/audit/audit.module.ts
// Leaf module (ADR-025) — owns AdminAuditLog, imports nothing from any
// other module. No HTTP surface yet; a future "activity log" viewing page
// mounts here without touching any other module.
import { Router } from "express";
import { RecordAuditLogUseCase } from "./application/use-cases/record-audit-log.use-case";
import { AuditLogRepository } from "./infrastructure/repositories/audit-log.repository";

const auditLogRepository = new AuditLogRepository();

/** Exported for cross-module use — every module that performs a staff-facing write imports this directly. */
export const recordAuditLogUseCase = new RecordAuditLogUseCase(auditLogRepository);

export const router = Router();
```

- [ ] **Step 6: Register the module**

In `apps/api/src/modules/index.ts`, add the import and list entry:

```typescript
import { router as auditRouter } from "./audit/audit.module";
```

Add to the `moduleRouters` array (anywhere, e.g. right after `{ path: "/admin", router: adminRouter }`):

```typescript
  { path: "/audit", router: auditRouter },
```

- [ ] **Step 7: Typecheck and boundary check**

Run: `pnpm --filter @woobe/api run typecheck && pnpm --filter @woobe/api run boundaries:check`

Expected: both pass — zero errors, zero new boundary violations.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/modules/audit apps/api/src/modules/index.ts
git commit -m "feat(api): add leaf audit module for admin activity logging"
```

---

## Task 3: `payments` module — expose refund-lifecycle seams

**Files:**
- Modify: `apps/api/src/modules/payments/application/ports/payment-repository.port.ts`
- Modify: `apps/api/src/modules/payments/infrastructure/repositories/payment.repository.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/get-payment-for-order.use-case.ts`
- Create: `apps/api/src/modules/payments/application/use-cases/mark-payment-refunded.use-case.ts`
- Modify: `apps/api/src/modules/payments/payments.module.ts`
- Test: `apps/api/src/modules/payments/application/use-cases/mark-payment-refunded.use-case.test.ts`

**Interfaces:**
- Consumes: existing `PaymentRepositoryPort.findByOrderId`, `PaymentEntity` (from `../../domain/entities/payment.entity`).
- Produces: `getPaymentForOrderUseCase.execute(orderId): Promise<PaymentEntity | null>`, `markPaymentRefundedUseCase.execute(paymentId, providerRefundId, tx?): Promise<PaymentEntity>` — both exported from `payments.module.ts`. This is the ONLY write path to `Payment.status = "REFUNDED"` anywhere in the codebase.

- [ ] **Step 1: Read `PaymentEntity`'s shape**

Run: `grep -n "" apps/api/src/modules/payments/domain/entities/payment.entity.ts` — confirm the exact field names before writing the use-case (should match `payment.repository.ts`'s `toEntity` mapping already read: `id, orderId, provider, status, amountPaise, razorpayOrderId, razorpayPaymentId, razorpaySignature`).

- [ ] **Step 2: Add `markRefunded` to the port**

In `apps/api/src/modules/payments/application/ports/payment-repository.port.ts`, add this method to the `PaymentRepositoryPort` interface (alongside `create`/`findByOrderId`/`findByRazorpayOrderId`/`update`):

```typescript
  /** The only write path to `status: "REFUNDED"` (ADR-025's split-ownership-by-transition-type — refunds' own module calls this rather than writing Payment directly). */
  markRefunded(paymentId: string, tx?: unknown): Promise<void>;
```

- [ ] **Step 3: Write the failing test for the use-case**

```typescript
// apps/api/src/modules/payments/application/use-cases/mark-payment-refunded.use-case.test.ts
import { describe, expect, it, vi } from "vitest";
import { MarkPaymentRefundedUseCase } from "./mark-payment-refunded.use-case";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";

describe("MarkPaymentRefundedUseCase", () => {
  it("calls the repository's markRefunded with the given payment id", async () => {
    const markRefunded = vi.fn().mockResolvedValue(undefined);
    const repository = { markRefunded } as unknown as PaymentRepositoryPort;
    const useCase = new MarkPaymentRefundedUseCase(repository);

    await useCase.execute("payment-1");

    expect(markRefunded).toHaveBeenCalledWith("payment-1", undefined);
  });
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/payments/application/use-cases/mark-payment-refunded.use-case.test.ts`

Expected: FAIL — `mark-payment-refunded.use-case` module not found.

- [ ] **Step 5: Implement the use-case**

```typescript
// apps/api/src/modules/payments/application/use-cases/mark-payment-refunded.use-case.ts
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";

/**
 * The only write path to Payment.status = "REFUNDED" anywhere in the
 * codebase (ADR-025 split ownership by transition type: `payments` owns
 * every capture-lifecycle write to Payment, and is the sole implementer of
 * this one refund-lifecycle write too — `refunds` calls this rather than
 * touching Payment itself).
 */
export class MarkPaymentRefundedUseCase {
  constructor(private readonly paymentRepository: PaymentRepositoryPort) {}

  execute(paymentId: string, tx?: unknown): Promise<void> {
    return this.paymentRepository.markRefunded(paymentId, tx);
  }
}
```

- [ ] **Step 6: Implement `markRefunded` on the repository**

In `apps/api/src/modules/payments/infrastructure/repositories/payment.repository.ts`, add this method to the `PaymentRepository` class (alongside `create`/`findByOrderId`/`findByRazorpayOrderId`/`update`):

```typescript
  async markRefunded(paymentId: string, tx?: unknown): Promise<void> {
    const client = (tx as PrismaTx | undefined) ?? prisma;
    await client.payment.update({ where: { id: paymentId }, data: { status: "REFUNDED" } });
  }
```

- [ ] **Step 7: Run the test, verify it passes**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/payments/application/use-cases/mark-payment-refunded.use-case.test.ts`

Expected: PASS.

- [ ] **Step 8: Add the read-only wrapper use-case (no test needed — pure pass-through, same shape as `GetOrderForPaymentUseCase`)**

```typescript
// apps/api/src/modules/payments/application/use-cases/get-payment-for-order.use-case.ts
import type { PaymentEntity } from "../../domain/entities/payment.entity";
import type { PaymentRepositoryPort } from "../ports/payment-repository.port";

/** Thin read wrapper — lets `refunds` (and any future module) look up an order's payment without reaching into Payment directly (ADR-010). */
export class GetPaymentForOrderUseCase {
  constructor(private readonly paymentRepository: PaymentRepositoryPort) {}

  execute(orderId: string): Promise<PaymentEntity | null> {
    return this.paymentRepository.findByOrderId(orderId);
  }
}
```

- [ ] **Step 9: Wire both into the composition root**

In `apps/api/src/modules/payments/payments.module.ts`, add the imports:

```typescript
import { GetPaymentForOrderUseCase } from "./application/use-cases/get-payment-for-order.use-case";
import { MarkPaymentRefundedUseCase } from "./application/use-cases/mark-payment-refunded.use-case";
```

And after the existing `const handleRazorpayWebhookUseCase = ...` block, add:

```typescript
/** Exported for cross-module use — `refunds` (ADR-025) reads/writes Payment only through these two, never directly. */
export const getPaymentForOrderUseCase = new GetPaymentForOrderUseCase(paymentRepository);
export const markPaymentRefundedUseCase = new MarkPaymentRefundedUseCase(paymentRepository);
```

- [ ] **Step 10: Typecheck**

Run: `pnpm --filter @woobe/api run typecheck`

Expected: zero errors.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/payments
git commit -m "feat(payments): expose narrow refund-lifecycle seams for the refunds module"
```

---

## Task 4: `refunds` module — build out (pulled forward from Week 4, admin-cancellation path only)

**Files:**
- Create: `apps/api/src/modules/refunds/domain/entities/refund.entity.ts`
- Create: `apps/api/src/modules/refunds/application/ports/payment-reader.port.ts`
- Create: `apps/api/src/modules/refunds/application/ports/payment-refund-writer.port.ts`
- Create: `apps/api/src/modules/refunds/application/ports/razorpay-refund-gateway.port.ts`
- Create: `apps/api/src/modules/refunds/application/ports/refund-repository.port.ts`
- Create: `apps/api/src/modules/refunds/application/use-cases/issue-refund-for-cancelled-order.use-case.ts`
- Create: `apps/api/src/modules/refunds/infrastructure/repositories/refund.repository.ts`
- Create: `apps/api/src/modules/refunds/infrastructure/services/razorpay-refund.service.ts`
- Modify: `apps/api/src/modules/refunds/refunds.module.ts`
- Test: `apps/api/src/modules/refunds/application/use-cases/issue-refund-for-cancelled-order.use-case.test.ts`

**Interfaces:**
- Consumes: `getPaymentForOrderUseCase`, `markPaymentRefundedUseCase` (Task 3, imported from `../payments/payments.module`).
- Produces: `issueRefundForCancelledOrderUseCase.execute(orderId): Promise<{ refundIssued: boolean; reason?: "not-applicable" | "gateway-error"; refundId?: string }>` — exported from `refunds.module.ts`. This is what `orders`' `CancelOrderUseCase` (Task 8) calls.

- [ ] **Step 1: Entity**

```typescript
// apps/api/src/modules/refunds/domain/entities/refund.entity.ts
import type { PaymentMethod, RefundStatus } from "@woobe/types";

export interface RefundEntity {
  id: string;
  orderId: string;
  returnId: string | null;
  provider: PaymentMethod;
  status: RefundStatus;
  amountPaise: number;
  providerRefundId: string | null;
  createdAt: Date;
}
```

`RefundStatus` doesn't exist in `packages/types/src/enums.ts` yet — add it in this same step:

```typescript
// packages/types/src/enums.ts — add near the other enum exports
export const REFUND_STATUS = ["INITIATED", "COMPLETED", "FAILED"] as const;
export type RefundStatus = (typeof REFUND_STATUS)[number];
```

- [ ] **Step 2: Ports**

```typescript
// apps/api/src/modules/refunds/application/ports/payment-reader.port.ts
export interface PaymentForRefundView {
  id: string;
  provider: "RAZORPAY" | "COD";
  status: "CREATED" | "PENDING" | "CAPTURED" | "FAILED" | "REFUNDED";
  amountPaise: number;
  razorpayPaymentId: string | null;
}

/** Narrow read-only dependency on `payments` (ADR-025) — decides purely from the actual payment record, never from the order's own belief about payment method. */
export interface PaymentReaderPort {
  findByOrderId(orderId: string): Promise<PaymentForRefundView | null>;
}
```

```typescript
// apps/api/src/modules/refunds/application/ports/payment-refund-writer.port.ts
/** The one write this module is allowed to trigger on Payment — routed through `payments`' own use-case, never direct Prisma access (ADR-025). */
export interface PaymentRefundWriterPort {
  markRefunded(paymentId: string): Promise<void>;
}
```

```typescript
// apps/api/src/modules/refunds/application/ports/razorpay-refund-gateway.port.ts
export interface RazorpayRefundResult {
  id: string;
  status: string;
}

export interface RazorpayRefundGatewayPort {
  refundPayment(razorpayPaymentId: string, amountPaise: number): Promise<RazorpayRefundResult>;
}
```

```typescript
// apps/api/src/modules/refunds/application/ports/refund-repository.port.ts
import type { RefundEntity } from "../../domain/entities/refund.entity";

export interface CreateRefundInput {
  orderId: string;
  provider: RefundEntity["provider"];
  status: RefundEntity["status"];
  amountPaise: number;
  providerRefundId?: string;
}

export interface RefundRepositoryPort {
  findByOrderId(orderId: string): Promise<RefundEntity | null>;
  create(input: CreateRefundInput): Promise<RefundEntity>;
}
```

- [ ] **Step 3: Write the failing tests for the use-case (all three branches)**

```typescript
// apps/api/src/modules/refunds/application/use-cases/issue-refund-for-cancelled-order.use-case.test.ts
import { describe, expect, it, vi } from "vitest";
import { IssueRefundForCancelledOrderUseCase } from "./issue-refund-for-cancelled-order.use-case";
import type { PaymentReaderPort } from "../ports/payment-reader.port";
import type { PaymentRefundWriterPort } from "../ports/payment-refund-writer.port";
import type { RazorpayRefundGatewayPort } from "../ports/razorpay-refund-gateway.port";
import type { RefundRepositoryPort } from "../ports/refund-repository.port";

function buildUseCase(overrides: {
  payment?: Awaited<ReturnType<PaymentReaderPort["findByOrderId"]>>;
  refundPayment?: RazorpayRefundGatewayPort["refundPayment"];
  existingRefund?: Awaited<ReturnType<RefundRepositoryPort["findByOrderId"]>>;
}) {
  const paymentReader: PaymentReaderPort = { findByOrderId: vi.fn().mockResolvedValue(overrides.payment ?? null) };
  const paymentRefundWriter: PaymentRefundWriterPort = { markRefunded: vi.fn().mockResolvedValue(undefined) };
  const gateway: RazorpayRefundGatewayPort = {
    refundPayment: overrides.refundPayment ?? vi.fn().mockResolvedValue({ id: "rfnd_1", status: "processed" }),
  };
  const refundRepository: RefundRepositoryPort = {
    findByOrderId: vi.fn().mockResolvedValue(overrides.existingRefund ?? null),
    create: vi.fn().mockImplementation(async (input) => ({ id: "refund-db-1", createdAt: new Date(), ...input })),
  };
  const useCase = new IssueRefundForCancelledOrderUseCase(paymentReader, paymentRefundWriter, gateway, refundRepository);
  return { useCase, paymentReader, paymentRefundWriter, gateway, refundRepository };
}

describe("IssueRefundForCancelledOrderUseCase", () => {
  it("issues nothing when there is no payment (or it's COD) — nothing was ever collected pre-delivery", async () => {
    const { useCase, gateway } = buildUseCase({ payment: null });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "not-applicable" });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("issues nothing for a COD payment even though status is CAPTURED", async () => {
    const { useCase, gateway } = buildUseCase({
      payment: { id: "p1", provider: "COD", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: null },
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "not-applicable" });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });

  it("refunds a captured Razorpay payment, writes a COMPLETED Refund row, and marks the Payment refunded", async () => {
    const { useCase, paymentRefundWriter, refundRepository } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: true, refundId: "refund-db-1" });
    expect(refundRepository.create).toHaveBeenCalledWith({
      orderId: "order-1",
      provider: "RAZORPAY",
      status: "COMPLETED",
      amountPaise: 1000,
      providerRefundId: "rfnd_1",
    });
    expect(paymentRefundWriter.markRefunded).toHaveBeenCalledWith("p1");
  });

  it("records a FAILED Refund row and does not throw when the gateway call fails", async () => {
    const { useCase, refundRepository } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
      refundPayment: vi.fn().mockRejectedValue(new Error("Razorpay is not configured")),
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: false, reason: "gateway-error" });
    expect(refundRepository.create).toHaveBeenCalledWith({
      orderId: "order-1",
      provider: "RAZORPAY",
      status: "FAILED",
      amountPaise: 1000,
      providerRefundId: undefined,
    });
  });

  it("is idempotent — skips the gateway entirely when a Refund row already exists for the order", async () => {
    const { useCase, gateway } = buildUseCase({
      payment: { id: "p1", provider: "RAZORPAY", status: "CAPTURED", amountPaise: 1000, razorpayPaymentId: "pay_abc" },
      existingRefund: {
        id: "existing", orderId: "order-1", returnId: null, provider: "RAZORPAY",
        status: "COMPLETED", amountPaise: 1000, providerRefundId: "rfnd_0", createdAt: new Date(),
      },
    });
    const result = await useCase.execute("order-1");
    expect(result).toEqual({ refundIssued: true, refundId: "existing" });
    expect(gateway.refundPayment).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Run it, verify it fails**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/refunds/application/use-cases/issue-refund-for-cancelled-order.use-case.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 5: Implement the use-case**

```typescript
// apps/api/src/modules/refunds/application/use-cases/issue-refund-for-cancelled-order.use-case.ts
import type { PaymentReaderPort } from "../ports/payment-reader.port";
import type { PaymentRefundWriterPort } from "../ports/payment-refund-writer.port";
import type { RazorpayRefundGatewayPort } from "../ports/razorpay-refund-gateway.port";
import type { RefundRepositoryPort } from "../ports/refund-repository.port";

export interface IssueRefundResult {
  refundIssued: boolean;
  reason?: "not-applicable" | "gateway-error";
  refundId?: string;
}

/**
 * Admin-cancellation refund path only (ADR-025) — the full customer-
 * initiated return/exchange request flow stays Week 4 scope. Decides
 * purely from the order's actual Payment record, never from the caller's
 * belief about payment method: a COD order's Payment.status is CAPTURED
 * at confirm time (see ConfirmCodOrderUseCase) even though no real money
 * has moved yet, so checking status alone is not enough — provider must
 * also be RAZORPAY.
 *
 * Never throws on a gateway failure — records a FAILED Refund row for
 * manual follow-up instead, so a broken/unconfigured Razorpay integration
 * (e.g. this repo's current stub keys) never blocks the cancellation
 * itself from completing.
 */
export class IssueRefundForCancelledOrderUseCase {
  constructor(
    private readonly paymentReader: PaymentReaderPort,
    private readonly paymentRefundWriter: PaymentRefundWriterPort,
    private readonly gateway: RazorpayRefundGatewayPort,
    private readonly refundRepository: RefundRepositoryPort,
  ) {}

  async execute(orderId: string): Promise<IssueRefundResult> {
    // Defensive idempotency (belt-and-suspenders) — the real backstop is
    // orders' own conditional status transition, which is what actually
    // prevents this method from being reached twice for the same order.
    const existing = await this.refundRepository.findByOrderId(orderId);
    if (existing) {
      return { refundIssued: existing.status === "COMPLETED", refundId: existing.id };
    }

    const payment = await this.paymentReader.findByOrderId(orderId);
    if (!payment || payment.provider !== "RAZORPAY" || payment.status !== "CAPTURED" || !payment.razorpayPaymentId) {
      return { refundIssued: false, reason: "not-applicable" };
    }

    try {
      const refund = await this.gateway.refundPayment(payment.razorpayPaymentId, payment.amountPaise);
      const created = await this.refundRepository.create({
        orderId,
        provider: "RAZORPAY",
        status: "COMPLETED",
        amountPaise: payment.amountPaise,
        providerRefundId: refund.id,
      });
      await this.paymentRefundWriter.markRefunded(payment.id);
      return { refundIssued: true, refundId: created.id };
    } catch {
      await this.refundRepository.create({
        orderId,
        provider: "RAZORPAY",
        status: "FAILED",
        amountPaise: payment.amountPaise,
      });
      return { refundIssued: false, reason: "gateway-error" };
    }
  }
}
```

- [ ] **Step 6: Run the tests, verify they pass**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/refunds/application/use-cases/issue-refund-for-cancelled-order.use-case.test.ts`

Expected: PASS, all 5 tests.

- [ ] **Step 7: Infrastructure — `RefundRepository`**

```typescript
// apps/api/src/modules/refunds/infrastructure/repositories/refund.repository.ts
import { prisma } from "@woobe/database";
import type { RefundEntity } from "../../domain/entities/refund.entity";
import type { CreateRefundInput, RefundRepositoryPort } from "../../application/ports/refund-repository.port";

/** ADR-010: the only file in this module allowed to import @woobe/database, and only for the Refund table it owns — never Payment (ADR-025). */
export class RefundRepository implements RefundRepositoryPort {
  async findByOrderId(orderId: string): Promise<RefundEntity | null> {
    const refund = await prisma.refund.findFirst({ where: { orderId }, orderBy: { createdAt: "desc" } });
    return refund ? toEntity(refund) : null;
  }

  async create(input: CreateRefundInput): Promise<RefundEntity> {
    const refund = await prisma.refund.create({
      data: {
        orderId: input.orderId,
        provider: input.provider,
        status: input.status,
        amountPaise: input.amountPaise,
        providerRefundId: input.providerRefundId,
      },
    });
    return toEntity(refund);
  }
}

function toEntity(refund: {
  id: string;
  orderId: string;
  returnId: string | null;
  provider: string;
  status: string;
  amountPaise: number;
  providerRefundId: string | null;
  createdAt: Date;
}): RefundEntity {
  return {
    id: refund.id,
    orderId: refund.orderId,
    returnId: refund.returnId,
    provider: refund.provider as RefundEntity["provider"],
    status: refund.status as RefundEntity["status"],
    amountPaise: refund.amountPaise,
    providerRefundId: refund.providerRefundId,
    createdAt: refund.createdAt,
  };
}
```

- [ ] **Step 8: Infrastructure — `RazorpayRefundService`**

```typescript
// apps/api/src/modules/refunds/infrastructure/services/razorpay-refund.service.ts
import Razorpay from "razorpay";
import { env } from "../../../../config/env";
import type { RazorpayRefundGatewayPort, RazorpayRefundResult } from "../../application/ports/razorpay-refund-gateway.port";

/**
 * Independent Razorpay client for the refund-only SDK surface
 * (`client.payments.refund`) — a genuinely different operation than
 * `payments`' RazorpayService (`orders.create`/webhook verification), not
 * a duplication of the same logic. Same stub-key-guard pattern: fails
 * closed with a clear error rather than silently no-op'ing.
 */
export class RazorpayRefundService implements RazorpayRefundGatewayPort {
  private readonly client: Razorpay | null;

  constructor() {
    this.client =
      env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
        ? new Razorpay({ key_id: env.RAZORPAY_KEY_ID, key_secret: env.RAZORPAY_KEY_SECRET })
        : null;
  }

  async refundPayment(razorpayPaymentId: string, amountPaise: number): Promise<RazorpayRefundResult> {
    if (!this.client) {
      throw new Error("Razorpay is not configured (RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET) — see DECISIONS_PENDING.md #4");
    }
    const refund = await this.client.payments.refund(razorpayPaymentId, { amount: amountPaise });
    return { id: refund.id, status: refund.status ?? "processed" };
  }
}
```

- [ ] **Step 9: Composition root**

```typescript
// apps/api/src/modules/refunds/refunds.module.ts
// Composition root for the refunds module (ARCHITECTURE.md §3.2). Owns
// Refund. Pulled forward from Week 4 — admin-cancellation refund path
// only (ADR-025); the full customer-initiated return/exchange request
// flow (Return entity, its own UI) stays Week 4 scope. Reads/writes
// Payment ONLY through payments' own exported use-cases (never direct
// Prisma access to a table this module doesn't own) — split ownership by
// transition type, not a blanket boundary exception.
import { Router } from "express";
import { getPaymentForOrderUseCase, markPaymentRefundedUseCase } from "../payments/payments.module";
import type { PaymentReaderPort } from "./application/ports/payment-reader.port";
import type { PaymentRefundWriterPort } from "./application/ports/payment-refund-writer.port";
import { IssueRefundForCancelledOrderUseCase } from "./application/use-cases/issue-refund-for-cancelled-order.use-case";
import { RefundRepository } from "./infrastructure/repositories/refund.repository";
import { RazorpayRefundService } from "./infrastructure/services/razorpay-refund.service";

const refundRepository = new RefundRepository();
const razorpayRefundService = new RazorpayRefundService();

const paymentReader: PaymentReaderPort = { findByOrderId: (orderId) => getPaymentForOrderUseCase.execute(orderId) };
const paymentRefundWriter: PaymentRefundWriterPort = { markRefunded: (paymentId) => markPaymentRefundedUseCase.execute(paymentId) };

/** Exported for cross-module use — `orders`' CancelOrderUseCase calls this, never `payments` directly (ADR-025). */
export const issueRefundForCancelledOrderUseCase = new IssueRefundForCancelledOrderUseCase(
  paymentReader,
  paymentRefundWriter,
  razorpayRefundService,
  refundRepository,
);

export const router = Router();
```

- [ ] **Step 10: Typecheck and boundary check**

Run: `pnpm --filter @woobe/api run typecheck && pnpm --filter @woobe/api run boundaries:check`

Expected: both pass.

- [ ] **Step 11: Commit**

```bash
git add apps/api/src/modules/refunds packages/types/src/enums.ts
git commit -m "feat(refunds): build out admin-cancellation refund path (pulled forward from Week 4)"
```

---

## Task 5: `orders` — extend the entity and repository for fulfillment fields + admin listing

**Files:**
- Modify: `apps/api/src/modules/orders/domain/entities/order.entity.ts`
- Modify: `apps/api/src/modules/orders/application/ports/order-repository.port.ts`
- Modify: `apps/api/src/modules/orders/infrastructure/repositories/order.repository.ts`

**Interfaces:**
- Produces: `OrderEntity` gains `trackingNumber/carrier/shippedAt/deliveredAt/cancelledAt/cancellationReason`; new `AdminOrderSummaryEntity`; `OrderRepositoryPort.transitionStatus` gains a 5th optional `extraFields` param; new `OrderRepositoryPort.findAllPaginated`.

- [ ] **Step 1: Extend `OrderEntity` and add `AdminOrderSummaryEntity`**

In `apps/api/src/modules/orders/domain/entities/order.entity.ts`, add to `OrderEntity` (after `placedAt: Date;`):

```typescript
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancellationReason: string | null;
```

And add this new interface after `OrderSummaryEntity`:

```typescript
/** Admin order-list row — unlike OrderSummaryEntity (customer's own "My Orders"), includes contact info for search/display and is never scoped by userId. */
export interface AdminOrderSummaryEntity {
  id: string;
  orderNumber: string;
  status: OrderEntity["status"];
  paymentMethod: PaymentMethod;
  contactName: string;
  contactEmail: string;
  totalPaise: number;
  itemCount: number;
  placedAt: Date;
}
```

- [ ] **Step 2: Extend `OrderRepositoryPort`**

In `apps/api/src/modules/orders/application/ports/order-repository.port.ts`, change the `transitionStatus` signature to:

```typescript
  transitionStatus(
    orderId: string,
    from: OrderEntity["status"],
    to: OrderEntity["status"],
    tx: unknown,
    extraFields?: Partial<
      Pick<OrderEntity, "trackingNumber" | "carrier" | "shippedAt" | "deliveredAt" | "cancelledAt" | "cancellationReason">
    >,
  ): Promise<TransitionOrderStatusResult>;
```

And add these two new members to the interface:

```typescript
export interface ListOrdersFilter {
  status?: OrderEntity["status"];
  search?: string;
  page: number;
  pageSize: number;
}

export interface ListOrdersResult {
  items: AdminOrderSummaryEntity[];
  total: number;
}
```

```typescript
  /** Admin order list (ADR-025's admin order view) — no userId filter, unlike findSummariesByUserId. */
  findAllPaginated(filter: ListOrdersFilter): Promise<ListOrdersResult>;
```

(Add the import of `AdminOrderSummaryEntity` alongside the existing `OrderEntity, OrderSummaryEntity` import at the top of the file.)

- [ ] **Step 3: Implement both in `OrderRepository`**

In `apps/api/src/modules/orders/infrastructure/repositories/order.repository.ts`, replace the existing `transitionStatus` method with:

```typescript
  async transitionStatus(
    orderId: string,
    from: OrderEntity["status"],
    to: OrderEntity["status"],
    tx: unknown,
    extraFields?: Partial<
      Pick<OrderEntity, "trackingNumber" | "carrier" | "shippedAt" | "deliveredAt" | "cancelledAt" | "cancellationReason">
    >,
  ): Promise<TransitionOrderStatusResult> {
    const client = tx as PrismaTx;
    const { count } = await client.order.updateMany({
      where: { id: orderId, status: from },
      data: { status: to, ...extraFields },
    });
    const order = await client.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
    return { changed: count > 0, order: toEntity(order) };
  }

  async findAllPaginated(filter: ListOrdersFilter): Promise<ListOrdersResult> {
    const where: Prisma.OrderWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.search
        ? {
            OR: [
              { orderNumber: { contains: filter.search, mode: "insensitive" } },
              { contactEmail: { contains: filter.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        orderBy: { placedAt: "desc" },
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentMethod: true,
          contactName: true,
          contactEmail: true,
          totalPaise: true,
          placedAt: true,
          _count: { select: { items: true } },
        },
      }),
      prisma.order.count({ where }),
    ]);

    return {
      items: orders.map((order) => ({
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentMethod: order.paymentMethod,
        contactName: order.contactName,
        contactEmail: order.contactEmail,
        totalPaise: order.totalPaise,
        itemCount: order._count.items,
        placedAt: order.placedAt,
      })),
      total,
    };
  }
```

Add `ListOrdersFilter, ListOrdersResult` to the existing port-types import at the top of the file, and extend `toEntity`'s return object (at the bottom of the file) with the six new fields:

```typescript
    trackingNumber: order.trackingNumber,
    carrier: order.carrier,
    shippedAt: order.shippedAt,
    deliveredAt: order.deliveredAt,
    cancelledAt: order.cancelledAt,
    cancellationReason: order.cancellationReason,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @woobe/api run typecheck`

Expected: fails at first, listing every call site of `transitionStatus`/`toEntity` that now needs the new fields — this is expected and confirms both are actually used; fix each reported call site by passing through the new `OrderEntity` fields (they already come from Prisma's `order` object, just add them to any other manual entity-construction spot the compiler flags). Re-run until clean.

- [ ] **Step 5: Run the existing orders test suite**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders`

Expected: PASS — `order-number.test.ts` and `orders.integration.test.ts` both still green (this task only adds fields/methods, doesn't change existing behavior).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/orders/domain apps/api/src/modules/orders/application/ports/order-repository.port.ts apps/api/src/modules/orders/infrastructure/repositories/order.repository.ts
git commit -m "feat(orders): extend entity/repository for fulfillment fields and admin listing"
```

---

## Task 6: `orders` — new cross-module ports (inventory release, refund issuer, audit logger)

**Files:**
- Create: `apps/api/src/modules/orders/application/ports/inventory-release.port.ts`
- Create: `apps/api/src/modules/orders/application/ports/refund-issuer.port.ts`
- Create: `apps/api/src/modules/orders/application/ports/audit-logger.port.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`

**Interfaces:**
- Consumes: `releaseReservationUseCase` (inventory module, already exported), `issueRefundForCancelledOrderUseCase` (Task 4), `recordAuditLogUseCase` (Task 2).
- Produces: `inventoryRelease`, `refundIssuer`, `auditLogger` — wired instances available inside `orders.module.ts` for the new use-cases in Tasks 7–10 to receive via constructor injection.

- [ ] **Step 1: Ports**

```typescript
// apps/api/src/modules/orders/application/ports/inventory-release.port.ts
/** Narrow port for this module's dependency on `inventory`'s reservation-release half (ADR-015) — same underlying use-case `payments` already wires into its own, differently-shaped InventoryFinalizationPort (this codebase's established one-port-shape-per-consuming-module convention). */
export interface InventoryReleasePort {
  release(items: { variantId: string; quantity: number }[], tx: unknown): Promise<void>;
}
```

```typescript
// apps/api/src/modules/orders/application/ports/refund-issuer.port.ts
/** Narrow port for this module's dependency on `refunds` (ADR-025) — CancelOrderUseCase's one and only route to triggering a refund; never imports `payments` directly (would recreate the orders→payments→orders cycle). */
export interface RefundIssuerPort {
  issueRefundIfNeeded(orderId: string): Promise<{ refundIssued: boolean }>;
}
```

```typescript
// apps/api/src/modules/orders/application/ports/audit-logger.port.ts
import type { Role } from "@woobe/types";

export interface AuditLogEntry {
  actorId: string;
  actorRole: Role;
  action: string;
  entityType: string;
  entityId: string;
  metadata?: unknown;
}

/** Narrow port for this module's dependency on the leaf `audit` module (ADR-025) — every order-transition use-case writes through this. */
export interface AuditLoggerPort {
  log(entry: AuditLogEntry, tx?: unknown): Promise<void>;
}
```

- [ ] **Step 2: Wire all three in the composition root**

In `apps/api/src/modules/orders/orders.module.ts`, add these imports (alongside the existing cross-module imports):

```typescript
import { recordAuditLogUseCase } from "../audit/audit.module";
import { releaseReservationUseCase } from "../inventory/inventory.module";
import { issueRefundForCancelledOrderUseCase } from "../refunds/refunds.module";
```

(`releaseReservationUseCase` joins the existing `reserveInventoryForCheckoutUseCase` import from the same `"../inventory/inventory.module"` line — combine into one import statement.)

Add the port type imports:

```typescript
import type { AuditLoggerPort } from "./application/ports/audit-logger.port";
import type { InventoryReleasePort } from "./application/ports/inventory-release.port";
import type { RefundIssuerPort } from "./application/ports/refund-issuer.port";
```

And after the existing `const inventoryReservation: InventoryReservationPort = {...}` block, add:

```typescript
const inventoryRelease: InventoryReleasePort = { release: (items, tx) => releaseReservationUseCase.execute(items, tx) };
const refundIssuer: RefundIssuerPort = { issueRefundIfNeeded: (orderId) => issueRefundForCancelledOrderUseCase.execute(orderId) };
const auditLogger: AuditLoggerPort = { log: (entry, tx) => recordAuditLogUseCase.execute(entry, tx) };
```

(These three consts are consumed by Tasks 7–10's use-case constructors, wired further down in this same file in each of those tasks.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @woobe/api run typecheck`

Expected: passes — these three consts aren't consumed by anything yet (Tasks 7–10 do that), so no "unused variable" error only because TypeScript doesn't flag unused top-level `const`s the way it flags unused locals; if the linter does flag it, that's expected and resolves itself once Task 7 consumes `auditLogger`/`inventoryRelease`/`refundIssuer` — leave as-is and proceed.

- [ ] **Step 4: Boundary check**

Run: `pnpm --filter @woobe/api run boundaries:check`

Expected: passes — confirms no `orders → payments` or `orders → admin` edge was accidentally introduced.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders/application/ports apps/api/src/modules/orders/orders.module.ts
git commit -m "feat(orders): wire inventory-release, refund-issuer, and audit-logger ports"
```

---

## Task 7: `orders` — StartProcessingOrderUseCase, ShipOrderUseCase, DeliverOrderUseCase

**Files:**
- Create: `apps/api/src/modules/orders/application/use-cases/start-processing-order.use-case.ts`
- Create: `apps/api/src/modules/orders/application/use-cases/ship-order.use-case.ts`
- Create: `apps/api/src/modules/orders/application/use-cases/deliver-order.use-case.ts`
- Test: `apps/api/src/modules/orders/application/use-cases/start-processing-order.use-case.test.ts`
- Test: `apps/api/src/modules/orders/application/use-cases/ship-order.use-case.test.ts`
- Test: `apps/api/src/modules/orders/application/use-cases/deliver-order.use-case.test.ts`

**Interfaces:**
- Consumes: `OrderRepositoryPort` (Task 5), `AuditLoggerPort` (Task 6), `TransactionPort` (existing).
- Produces: `StartProcessingOrderUseCase.execute(orderId, actor)`, `ShipOrderUseCase.execute(orderId, actor, { trackingNumber, carrier })`, `DeliverOrderUseCase.execute(orderId, actor)` — all return `Promise<TransitionOrderStatusResult>`.

- [ ] **Step 1: Write the failing test for `StartProcessingOrderUseCase`**

```typescript
// apps/api/src/modules/orders/application/use-cases/start-processing-order.use-case.test.ts
import { describe, expect, it, vi } from "vitest";
import { StartProcessingOrderUseCase } from "./start-processing-order.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { TransactionPort } from "../ports/transaction.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "CONFIRMED",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "COD", placedAt: new Date(), items: [],
    trackingNumber: null, carrier: null, shippedAt: null, deliveredAt: null, cancelledAt: null, cancellationReason: null,
    ...overrides,
  };
}

describe("StartProcessingOrderUseCase", () => {
  it("transitions CONFIRMED -> PROCESSING and writes an audit log entry", async () => {
    const confirmed = order();
    const transitioned = order({ status: "PROCESSING" });
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(confirmed),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, order: transitioned }),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };

    const useCase = new StartProcessingOrderUseCase(orderRepository, auditLogger, transaction);
    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });

    expect(result).toEqual({ changed: true, order: transitioned });
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith("order-1", "CONFIRMED", "PROCESSING", "tx");
    expect(auditLogger.log).toHaveBeenCalledWith(
      { actorId: "staff-1", actorRole: "ORDER_PROCESSING_STAFF", action: "ORDER_PROCESSING_STARTED", entityType: "Order", entityId: "order-1" },
      "tx",
    );
  });

  it("rejects starting processing on an order that isn't CONFIRMED", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(order({ status: "PENDING_PAYMENT" })) } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const useCase = new StartProcessingOrderUseCase(orderRepository, auditLogger, transaction);

    await expect(useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" })).rejects.toThrow(
      "Cannot start processing an order in status PENDING_PAYMENT",
    );
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders/application/use-cases/start-processing-order.use-case.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `StartProcessingOrderUseCase`**

```typescript
// apps/api/src/modules/orders/application/use-cases/start-processing-order.use-case.ts
import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

/** `CONFIRMED -> PROCESSING` (architecture.md §4's order state machine) — staff-initiated (ADR-024's order_processing_staff permission). */
export class StartProcessingOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "PROCESSING") {
      return { changed: false, order: existing }; // idempotent no-op
    }
    if (existing.status !== "CONFIRMED") {
      throw new ConflictError(`Cannot start processing an order in status ${existing.status}`);
    }

    return this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, "CONFIRMED", "PROCESSING", tx);
      if (result.changed) {
        await this.auditLogger.log(
          { actorId: actor.id, actorRole: actor.role, action: "ORDER_PROCESSING_STARTED", entityType: "Order", entityId: orderId },
          tx,
        );
      }
      return result;
    });
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders/application/use-cases/start-processing-order.use-case.test.ts`

Expected: PASS, both tests.

- [ ] **Step 5: Write the failing test for `ShipOrderUseCase`**

```typescript
// apps/api/src/modules/orders/application/use-cases/ship-order.use-case.test.ts
import { describe, expect, it, vi } from "vitest";
import { ShipOrderUseCase } from "./ship-order.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { TransactionPort } from "../ports/transaction.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "PROCESSING",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "COD", placedAt: new Date(), items: [],
    trackingNumber: null, carrier: null, shippedAt: null, deliveredAt: null, cancelledAt: null, cancellationReason: null,
    ...overrides,
  };
}

describe("ShipOrderUseCase", () => {
  it("transitions PROCESSING -> SHIPPED with tracking info and writes an audit log entry", async () => {
    const processing = order();
    const shipped = order({ status: "SHIPPED", trackingNumber: "TRK1", carrier: "BlueDart", shippedAt: new Date() });
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(processing),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, order: shipped }),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };

    const useCase = new ShipOrderUseCase(orderRepository, auditLogger, transaction);
    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" }, {
      trackingNumber: "TRK1",
      carrier: "BlueDart",
    });

    expect(result.changed).toBe(true);
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith(
      "order-1", "PROCESSING", "SHIPPED", "tx",
      expect.objectContaining({ trackingNumber: "TRK1", carrier: "BlueDart", shippedAt: expect.any(Date) }),
    );
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: "ORDER_SHIPPED", metadata: { trackingNumber: "TRK1", carrier: "BlueDart" } }),
      "tx",
    );
  });

  it("rejects shipping an order that isn't PROCESSING", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(order({ status: "CONFIRMED" })) } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const useCase = new ShipOrderUseCase(orderRepository, auditLogger, transaction);

    await expect(
      useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" }, { trackingNumber: "T", carrier: "C" }),
    ).rejects.toThrow("Cannot ship an order in status CONFIRMED");
  });
});
```

- [ ] **Step 6: Run it, verify it fails, then implement**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders/application/use-cases/ship-order.use-case.test.ts` — expect FAIL (module not found).

```typescript
// apps/api/src/modules/orders/application/use-cases/ship-order.use-case.ts
import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

export interface ShipOrderInput {
  trackingNumber: string;
  carrier: string;
}

/** `PROCESSING -> SHIPPED` (architecture.md §4) — captures tracking info in the same conditional write as the status change. */
export class ShipOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }, input: ShipOrderInput): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "SHIPPED") {
      return { changed: false, order: existing };
    }
    if (existing.status !== "PROCESSING") {
      throw new ConflictError(`Cannot ship an order in status ${existing.status}`);
    }

    return this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, "PROCESSING", "SHIPPED", tx, {
        trackingNumber: input.trackingNumber,
        carrier: input.carrier,
        shippedAt: new Date(),
      });
      if (result.changed) {
        await this.auditLogger.log(
          { actorId: actor.id, actorRole: actor.role, action: "ORDER_SHIPPED", entityType: "Order", entityId: orderId, metadata: input },
          tx,
        );
      }
      return result;
    });
  }
}
```

Run the test again — expect PASS, both tests.

- [ ] **Step 7: Write the failing test for `DeliverOrderUseCase`, then implement (same shape)**

```typescript
// apps/api/src/modules/orders/application/use-cases/deliver-order.use-case.test.ts
import { describe, expect, it, vi } from "vitest";
import { DeliverOrderUseCase } from "./deliver-order.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { TransactionPort } from "../ports/transaction.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "SHIPPED",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "COD", placedAt: new Date(), items: [],
    trackingNumber: "TRK1", carrier: "BlueDart", shippedAt: new Date(), deliveredAt: null, cancelledAt: null, cancellationReason: null,
    ...overrides,
  };
}

describe("DeliverOrderUseCase", () => {
  it("transitions SHIPPED -> DELIVERED and writes an audit log entry", async () => {
    const shipped = order();
    const delivered = order({ status: "DELIVERED", deliveredAt: new Date() });
    const orderRepository = {
      findById: vi.fn().mockResolvedValue(shipped),
      transitionStatus: vi.fn().mockResolvedValue({ changed: true, order: delivered }),
    } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn().mockResolvedValue(undefined) } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };

    const useCase = new DeliverOrderUseCase(orderRepository, auditLogger, transaction);
    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" });

    expect(result.changed).toBe(true);
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith(
      "order-1", "SHIPPED", "DELIVERED", "tx",
      expect.objectContaining({ deliveredAt: expect.any(Date) }),
    );
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ action: "ORDER_DELIVERED" }), "tx");
  });

  it("rejects delivering an order that isn't SHIPPED", async () => {
    const orderRepository = { findById: vi.fn().mockResolvedValue(order({ status: "PROCESSING" })) } as unknown as OrderRepositoryPort;
    const auditLogger = { log: vi.fn() } as unknown as AuditLoggerPort;
    const transaction: TransactionPort = { run: (fn) => fn("tx") };
    const useCase = new DeliverOrderUseCase(orderRepository, auditLogger, transaction);

    await expect(useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" })).rejects.toThrow(
      "Cannot deliver an order in status PROCESSING",
    );
  });
});
```

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders/application/use-cases/deliver-order.use-case.test.ts` — expect FAIL, then implement:

```typescript
// apps/api/src/modules/orders/application/use-cases/deliver-order.use-case.ts
import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { OrderRepositoryPort, TransitionOrderStatusResult } from "../ports/order-repository.port";
import type { TransactionPort } from "../ports/transaction.port";

/** `SHIPPED -> DELIVERED` (architecture.md §4) — end of the happy-path lifecycle. */
export class DeliverOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }): Promise<TransitionOrderStatusResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "DELIVERED") {
      return { changed: false, order: existing };
    }
    if (existing.status !== "SHIPPED") {
      throw new ConflictError(`Cannot deliver an order in status ${existing.status}`);
    }

    return this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, "SHIPPED", "DELIVERED", tx, { deliveredAt: new Date() });
      if (result.changed) {
        await this.auditLogger.log(
          { actorId: actor.id, actorRole: actor.role, action: "ORDER_DELIVERED", entityType: "Order", entityId: orderId },
          tx,
        );
      }
      return result;
    });
  }
}
```

Run the test again — expect PASS, both tests.

- [ ] **Step 8: Run the full orders test suite and typecheck**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders && pnpm --filter @woobe/api run typecheck`

Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add apps/api/src/modules/orders/application/use-cases/start-processing-order.use-case.ts \
        apps/api/src/modules/orders/application/use-cases/ship-order.use-case.ts \
        apps/api/src/modules/orders/application/use-cases/deliver-order.use-case.ts \
        apps/api/src/modules/orders/application/use-cases/*.test.ts
git commit -m "feat(orders): add start-processing, ship, and deliver use-cases"
```

---

## Task 8: `orders` — CancelOrderUseCase (transition + inventory release + refund trigger + audit)

**Files:**
- Create: `apps/api/src/modules/orders/application/use-cases/cancel-order.use-case.ts`
- Test: `apps/api/src/modules/orders/application/use-cases/cancel-order.use-case.test.ts`

**Interfaces:**
- Consumes: `OrderRepositoryPort`, `InventoryReleasePort`, `RefundIssuerPort`, `AuditLoggerPort`, `TransactionPort` (all from Tasks 5–6).
- Produces: `CancelOrderUseCase.execute(orderId, actor, reason?): Promise<{ order: OrderEntity; refundIssued: boolean }>`.

- [ ] **Step 1: Write the failing tests (legal transition + refund success, illegal transition, idempotent no-op)**

```typescript
// apps/api/src/modules/orders/application/use-cases/cancel-order.use-case.test.ts
import { describe, expect, it, vi } from "vitest";
import { CancelOrderUseCase } from "./cancel-order.use-case";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { InventoryReleasePort } from "../ports/inventory-release.port";
import type { RefundIssuerPort } from "../ports/refund-issuer.port";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { TransactionPort } from "../ports/transaction.port";

function order(overrides: Partial<OrderEntity> = {}): OrderEntity {
  return {
    id: "order-1", orderNumber: "WOOBE-1", userId: null, status: "CONFIRMED",
    contactName: "A", contactPhone: "1", contactEmail: "a@a.com",
    shippingSnapshot: { fullName: "A", phone: "1", line1: "L1", city: "C", state: "S", pincode: "1" },
    subtotalPaise: 100, discountPaise: 0, shippingFeePaise: 0, taxPaise: 0, totalPaise: 100, totalWeightGrams: 100,
    paymentMethod: "RAZORPAY", placedAt: new Date(),
    items: [{ id: "item-1", variantId: "variant-1", productNameSnapshot: "P", skuSnapshot: "SKU", color: "Red", size: "M", weightGrams: 100, unitRatePerKgPaise: 1000, unitPricePaise: 100, quantity: 2, lineTotalPaise: 200, taxAmountPaise: 10 }],
    trackingNumber: null, carrier: null, shippedAt: null, deliveredAt: null, cancelledAt: null, cancellationReason: null,
    ...overrides,
  };
}

function buildUseCase(overrides: { findByIdResult?: OrderEntity; transitionChanged?: boolean; refundIssued?: boolean } = {}) {
  const confirmed = overrides.findByIdResult ?? order();
  const cancelled = order({ status: "CANCELLED", cancelledAt: new Date(), cancellationReason: "Customer request" });
  const orderRepository = {
    findById: vi.fn().mockResolvedValue(confirmed),
    transitionStatus: vi.fn().mockResolvedValue({ changed: overrides.transitionChanged ?? true, order: cancelled }),
  } as unknown as OrderRepositoryPort;
  const inventoryRelease: InventoryReleasePort = { release: vi.fn().mockResolvedValue(undefined) };
  const refundIssuer: RefundIssuerPort = { issueRefundIfNeeded: vi.fn().mockResolvedValue({ refundIssued: overrides.refundIssued ?? true }) };
  const auditLogger: AuditLoggerPort = { log: vi.fn().mockResolvedValue(undefined) };
  const transaction: TransactionPort = { run: (fn) => fn("tx") };
  const useCase = new CancelOrderUseCase(orderRepository, inventoryRelease, refundIssuer, auditLogger, transaction);
  return { useCase, orderRepository, inventoryRelease, refundIssuer, auditLogger };
}

describe("CancelOrderUseCase", () => {
  it("cancels a CONFIRMED order, releases inventory, triggers a refund, and logs it", async () => {
    const { useCase, orderRepository, inventoryRelease, refundIssuer, auditLogger } = buildUseCase();

    const result = await useCase.execute("order-1", { id: "staff-1", role: "ORDER_PROCESSING_STAFF" }, "Customer request");

    expect(result.refundIssued).toBe(true);
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith(
      "order-1", "CONFIRMED", "CANCELLED", "tx",
      expect.objectContaining({ cancelledAt: expect.any(Date), cancellationReason: "Customer request" }),
    );
    expect(inventoryRelease.release).toHaveBeenCalledWith([{ variantId: "variant-1", quantity: 2 }], "tx");
    expect(refundIssuer.issueRefundIfNeeded).toHaveBeenCalledWith("order-1");
    expect(auditLogger.log).toHaveBeenCalledWith({
      actorId: "staff-1", actorRole: "ORDER_PROCESSING_STAFF", action: "ORDER_CANCELLED",
      entityType: "Order", entityId: "order-1", metadata: { reason: "Customer request", refundIssued: true },
    });
  });

  it("also allows cancelling a PROCESSING order", async () => {
    const { useCase, orderRepository } = buildUseCase({ findByIdResult: order({ status: "PROCESSING" }) });
    await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });
    expect(orderRepository.transitionStatus).toHaveBeenCalledWith("order-1", "PROCESSING", "CANCELLED", "tx", expect.anything());
  });

  it("rejects cancelling an order that is already SHIPPED", async () => {
    const { useCase } = buildUseCase({ findByIdResult: order({ status: "SHIPPED" }) });
    await expect(useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" })).rejects.toThrow(
      "Cannot cancel an order in status SHIPPED",
    );
  });

  it("is idempotent — a concurrent cancel that already won skips inventory release and refund entirely", async () => {
    const { useCase, inventoryRelease, refundIssuer, auditLogger } = buildUseCase({ transitionChanged: false });
    const result = await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });
    expect(result.refundIssued).toBe(false);
    expect(inventoryRelease.release).not.toHaveBeenCalled();
    expect(refundIssuer.issueRefundIfNeeded).not.toHaveBeenCalled();
    expect(auditLogger.log).not.toHaveBeenCalled();
  });

  it("still reports the order as cancelled even when the refund attempt fails", async () => {
    const { useCase, auditLogger } = buildUseCase({ refundIssued: false });
    const result = await useCase.execute("order-1", { id: "s", role: "ORDER_PROCESSING_STAFF" });
    expect(result.refundIssued).toBe(false);
    expect(result.order.status).toBe("CANCELLED"); // cancellation itself still succeeded
    expect(auditLogger.log).toHaveBeenCalledWith(expect.objectContaining({ metadata: { reason: undefined, refundIssued: false } }));
  });
});
```

- [ ] **Step 2: Run it, verify it fails**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders/application/use-cases/cancel-order.use-case.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `CancelOrderUseCase`**

```typescript
// apps/api/src/modules/orders/application/use-cases/cancel-order.use-case.ts
import type { Role } from "@woobe/types";
import { ConflictError, NotFoundError } from "../../../../shared/errors";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { AuditLoggerPort } from "../ports/audit-logger.port";
import type { InventoryReleasePort } from "../ports/inventory-release.port";
import type { OrderRepositoryPort } from "../ports/order-repository.port";
import type { RefundIssuerPort } from "../ports/refund-issuer.port";
import type { TransactionPort } from "../ports/transaction.port";

export interface CancelOrderResult {
  order: OrderEntity;
  refundIssued: boolean;
}

/**
 * `CONFIRMED`/`PROCESSING` -> `CANCELLED` (architecture.md §4's
 * pre-shipment-only cancellation). `CONFIRMED` means a payment was already
 * webhook-verified and captured (ADR-014) or a COD accounting entry was
 * recorded — cancelling without repaying would leave the customer having
 * paid for a cancelled order, so this always attempts a refund (ADR-025),
 * never just releases inventory.
 *
 * The refund call is external I/O and deliberately happens OUTSIDE the DB
 * transaction (after it commits) — the order is CANCELLED and its stock
 * released atomically first, then the refund is attempted. A refund
 * gateway failure never blocks or rolls back the cancellation itself; it
 * shows up as `refundIssued: false` for the caller to surface honestly
 * (e.g. "cancelled — refund needs manual follow-up").
 */
export class CancelOrderUseCase {
  constructor(
    private readonly orderRepository: OrderRepositoryPort,
    private readonly inventoryRelease: InventoryReleasePort,
    private readonly refundIssuer: RefundIssuerPort,
    private readonly auditLogger: AuditLoggerPort,
    private readonly transaction: TransactionPort,
  ) {}

  async execute(orderId: string, actor: { id: string; role: Role }, reason?: string): Promise<CancelOrderResult> {
    const existing = await this.orderRepository.findById(orderId);
    if (!existing) {
      throw new NotFoundError("Order not found");
    }
    if (existing.status === "CANCELLED") {
      return { order: existing, refundIssued: false }; // idempotent no-op
    }
    if (existing.status !== "CONFIRMED" && existing.status !== "PROCESSING") {
      throw new ConflictError(`Cannot cancel an order in status ${existing.status}`);
    }
    const fromStatus = existing.status;

    const { changed, order } = await this.transaction.run(async (tx) => {
      const result = await this.orderRepository.transitionStatus(orderId, fromStatus, "CANCELLED", tx, {
        cancelledAt: new Date(),
        cancellationReason: reason ?? null,
      });
      if (result.changed) {
        await this.inventoryRelease.release(
          result.order.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
          tx,
        );
      }
      return result;
    });

    if (!changed) {
      return { order, refundIssued: false }; // a concurrent cancel already won — don't double-release or double-refund
    }

    const { refundIssued } = await this.refundIssuer.issueRefundIfNeeded(orderId);

    await this.auditLogger.log({
      actorId: actor.id,
      actorRole: actor.role,
      action: "ORDER_CANCELLED",
      entityType: "Order",
      entityId: orderId,
      metadata: { reason, refundIssued },
    });

    return { order, refundIssued };
  }
}
```

- [ ] **Step 4: Run it, verify it passes**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders/application/use-cases/cancel-order.use-case.test.ts`

Expected: PASS, all 5 tests.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @woobe/api run typecheck`

Expected: zero errors.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/modules/orders/application/use-cases/cancel-order.use-case.ts apps/api/src/modules/orders/application/use-cases/cancel-order.use-case.test.ts
git commit -m "feat(orders): add CancelOrderUseCase with refund-on-cancel"
```

---

## Task 9: `orders` — ListOrdersUseCase, GetOrderForAdminUseCase, and final `orders.module.ts` wiring

**Files:**
- Create: `apps/api/src/modules/orders/application/use-cases/list-orders.use-case.ts`
- Create: `apps/api/src/modules/orders/application/use-cases/get-order-for-admin.use-case.ts`
- Modify: `apps/api/src/modules/orders/orders.module.ts`

**Interfaces:**
- Produces (all exported from `orders.module.ts`, consumed by the `admin` module in Tasks 12–13): `startProcessingOrderUseCase`, `shipOrderUseCase`, `deliverOrderUseCase`, `cancelOrderUseCase`, `listOrdersUseCase`, `getOrderForAdminUseCase`.

- [ ] **Step 1: `ListOrdersUseCase` (thin pass-through, no test needed — same shape as `ListMyOrdersUseCase`)**

```typescript
// apps/api/src/modules/orders/application/use-cases/list-orders.use-case.ts
import type { ListOrdersFilter, ListOrdersResult, OrderRepositoryPort } from "../ports/order-repository.port";

/** Admin order list — no userId scoping, unlike ListMyOrdersUseCase (ADR-025's admin order view). */
export class ListOrdersUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  execute(filter: ListOrdersFilter): Promise<ListOrdersResult> {
    return this.orderRepository.findAllPaginated(filter);
  }
}
```

- [ ] **Step 2: `GetOrderForAdminUseCase` (no test needed — thin, same shape as `GetOrderUseCase` minus its ownership check)**

```typescript
// apps/api/src/modules/orders/application/use-cases/get-order-for-admin.use-case.ts
import { NotFoundError } from "../../../../shared/errors";
import type { OrderEntity } from "../../domain/entities/order.entity";
import type { OrderRepositoryPort } from "../ports/order-repository.port";

/** Admin order lookup — no ownership check (unlike GetOrderUseCase, which is customer-facing and must keep that invariant simple and untouched). */
export class GetOrderForAdminUseCase {
  constructor(private readonly orderRepository: OrderRepositoryPort) {}

  async execute(orderId: string): Promise<OrderEntity> {
    const order = await this.orderRepository.findById(orderId);
    if (!order) {
      throw new NotFoundError("Order not found");
    }
    return order;
  }
}
```

- [ ] **Step 3: Wire all six new use-cases into `orders.module.ts`**

Add these imports (alongside the existing use-case imports):

```typescript
import { CancelOrderUseCase } from "./application/use-cases/cancel-order.use-case";
import { DeliverOrderUseCase } from "./application/use-cases/deliver-order.use-case";
import { GetOrderForAdminUseCase } from "./application/use-cases/get-order-for-admin.use-case";
import { ListOrdersUseCase } from "./application/use-cases/list-orders.use-case";
import { ShipOrderUseCase } from "./application/use-cases/ship-order.use-case";
import { StartProcessingOrderUseCase } from "./application/use-cases/start-processing-order.use-case";
```

After the existing `export const getOrderForPaymentUseCase = ...` line, add:

```typescript
/** Exported for cross-module use — `admin`'s HTTP layer (ADR-025) calls these directly, same pattern as payments' Day 5 exports above. */
export const startProcessingOrderUseCase = new StartProcessingOrderUseCase(orderRepository, auditLogger, transactionRunner);
export const shipOrderUseCase = new ShipOrderUseCase(orderRepository, auditLogger, transactionRunner);
export const deliverOrderUseCase = new DeliverOrderUseCase(orderRepository, auditLogger, transactionRunner);
export const cancelOrderUseCase = new CancelOrderUseCase(orderRepository, inventoryRelease, refundIssuer, auditLogger, transactionRunner);
export const listOrdersUseCase = new ListOrdersUseCase(orderRepository);
export const getOrderForAdminUseCase = new GetOrderForAdminUseCase(orderRepository);
```

- [ ] **Step 4: Run the full orders test suite, typecheck, and boundary check**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/orders && pnpm --filter @woobe/api run typecheck && pnpm --filter @woobe/api run boundaries:check`

Expected: all green — this confirms `inventoryRelease`, `refundIssuer`, and `auditLogger` (wired in Task 6, unused until now) are finally consumed with matching types.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/orders
git commit -m "feat(orders): export admin order-management use-cases"
```

---

## Task 10: `packages/validation` — admin order-action schemas

**Files:**
- Create: `packages/validation/src/admin.schema.ts`
- Modify: `packages/validation/src/index.ts`

**Interfaces:**
- Produces: `shipOrderSchema`, `ShipOrderInput`; `cancelOrderSchema`, `CancelOrderInput`.

- [ ] **Step 1: Write the schemas**

```typescript
// packages/validation/src/admin.schema.ts
import { z } from "zod";

/** Single source of truth (ADR-020) for the admin order-action request shapes — used by apps/admin's forms and apps/api's `validate` middleware. */

export const shipOrderSchema = z.object({
  trackingNumber: z.string().trim().min(1, "Tracking number is required"),
  carrier: z.string().trim().min(1, "Carrier is required"),
});
export type ShipOrderInput = z.infer<typeof shipOrderSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
```

- [ ] **Step 2: Export from the package index**

In `packages/validation/src/index.ts`, add:

```typescript
export * from "./admin.schema";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @woobe/validation run typecheck`

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add packages/validation/src/admin.schema.ts packages/validation/src/index.ts
git commit -m "feat(validation): add admin order-action schemas"
```

---

## Task 11: `auth` module exports + admin refresh-cookie

**Files:**
- Modify: `apps/api/src/modules/auth/auth.module.ts`
- Create: `apps/api/src/modules/admin/interface/http/admin-refresh-cookie.ts`

**Interfaces:**
- Produces: `auth.module.ts` now exports `loginUserUseCase`, `refreshTokenUseCase`, `logoutUserUseCase`, `getCurrentUserUseCase` (in addition to `router`). `ADMIN_REFRESH_TOKEN_COOKIE`, `setAdminRefreshTokenCookie`, `clearAdminRefreshTokenCookie`.

- [ ] **Step 1: Export the four use-case instances from `auth.module.ts`**

In `apps/api/src/modules/auth/auth.module.ts`, change these four `const` declarations to `export const` (they're already constructed there — this is a visibility change only, no behavior change):

```typescript
export const registerUserUseCase = new RegisterUserUseCase(authRepository, bcryptService, jwtService, refreshTokenService);
export const loginUserUseCase = new LoginUserUseCase(authRepository, bcryptService, jwtService, refreshTokenService);
export const refreshTokenUseCase = new RefreshTokenUseCase(authRepository, jwtService, refreshTokenService);
export const logoutUserUseCase = new LogoutUserUseCase(authRepository, refreshTokenService);
export const getCurrentUserUseCase = new GetCurrentUserUseCase(authRepository);
```

Add a one-line doc comment above them: `/** Exported for cross-module use — the admin module (ADR-025) reuses these directly for staff login, same pattern as orders/payments' own exports. */`

- [ ] **Step 2: Create the admin cookie helper**

```typescript
// apps/api/src/modules/admin/interface/http/admin-refresh-cookie.ts
import type { Response } from "express";
import { env } from "../../../../config/env";

export const ADMIN_REFRESH_TOKEN_COOKIE = "admin_refresh_token";

/**
 * Deliberately a SEPARATE cookie from the customer `refresh_token`
 * (ADR-025 §4.6) — both are httpOnly/secure/signed identically, but this
 * one is scoped to `/api/v1/admin` (never sent to `/api/v1/auth/*`, never
 * collides with a customer session in the same browser) and uses
 * `sameSite: "strict"` rather than the customer cookie's `"lax"` —
 * deliberately stricter, justified by the higher-privilege admin session
 * (order cancellation, refunds) having no legitimate cross-site entry
 * point the way a payment-gateway redirect back to the storefront might.
 */
export function setAdminRefreshTokenCookie(res: Response, rawToken: string, expiresAt: Date): void {
  res.cookie(ADMIN_REFRESH_TOKEN_COOKIE, rawToken, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    signed: true,
    path: "/api/v1/admin",
    expires: expiresAt,
  });
}

export function clearAdminRefreshTokenCookie(res: Response): void {
  res.clearCookie(ADMIN_REFRESH_TOKEN_COOKIE, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "strict",
    signed: true,
    path: "/api/v1/admin",
  });
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @woobe/api run typecheck`

Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/auth/auth.module.ts apps/api/src/modules/admin/interface/http/admin-refresh-cookie.ts
git commit -m "feat(auth): export use-case singletons for cross-module reuse; add admin refresh cookie"
```

---

## Task 12: `admin` module — staff auth (login/refresh/logout/me)

**Files:**
- Create: `apps/api/src/modules/admin/interface/http/admin-auth.controller.ts`
- Create: `apps/api/src/modules/admin/interface/http/admin-auth.routes.ts`

**Interfaces:**
- Consumes: `loginUserUseCase`, `refreshTokenUseCase`, `logoutUserUseCase`, `getCurrentUserUseCase` (Task 11), `ADMIN_REFRESH_TOKEN_COOKIE`/`setAdminRefreshTokenCookie`/`clearAdminRefreshTokenCookie` (Task 11).
- Produces: `createAdminAuthRouter(controller)` — mounted by `admin.module.ts` (Task 13) at `/auth`, giving `/api/v1/admin/auth/{login,refresh,logout,me}`.

- [ ] **Step 1: Controller**

```typescript
// apps/api/src/modules/admin/interface/http/admin-auth.controller.ts
import type { LoginInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ForbiddenError, UnauthorizedError } from "../../../../shared/errors";
import type { GetCurrentUserUseCase } from "../../../auth/application/use-cases/get-current-user.use-case";
import type { LoginUserUseCase } from "../../../auth/application/use-cases/login-user.use-case";
import type { LogoutUserUseCase } from "../../../auth/application/use-cases/logout-user.use-case";
import type { RefreshTokenUseCase } from "../../../auth/application/use-cases/refresh-token.use-case";
import { ADMIN_REFRESH_TOKEN_COOKIE, clearAdminRefreshTokenCookie, setAdminRefreshTokenCookie } from "./admin-refresh-cookie";

/**
 * Staff-only login surface (ADR-025) — reuses auth's already role-agnostic
 * use-cases directly (same direct-import-of-a-sibling's-exported-use-case
 * style this codebase already uses throughout), but issues a SEPARATE
 * cookie (admin-refresh-cookie.ts) and rejects a CUSTOMER role outright
 * rather than ever handing a customer an admin session.
 */
export class AdminAuthController {
  constructor(
    private readonly loginUserUseCase: LoginUserUseCase,
    private readonly refreshTokenUseCase: RefreshTokenUseCase,
    private readonly logoutUserUseCase: LogoutUserUseCase,
    private readonly getCurrentUserUseCase: GetCurrentUserUseCase,
  ) {}

  async login(req: Request, res: Response): Promise<void> {
    const input = req.body as LoginInput;
    const { user, accessToken, refreshToken, refreshTokenExpiresAt } = await this.loginUserUseCase.execute(input);

    if (user.role === "CUSTOMER") {
      // Invalidate the refresh token this login already minted rather than
      // leaving an unused-but-valid one sitting in the DB.
      await this.logoutUserUseCase.execute(refreshToken);
      throw new ForbiddenError("Not a staff account");
    }

    setAdminRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(200).json({ user: toPublicUser(user), accessToken });
  }

  async refresh(req: Request, res: Response): Promise<void> {
    const rawToken = req.signedCookies[ADMIN_REFRESH_TOKEN_COOKIE] as string | undefined;
    if (!rawToken) {
      throw new UnauthorizedError("No admin refresh token cookie");
    }
    const { accessToken, refreshToken, refreshTokenExpiresAt } = await this.refreshTokenUseCase.execute(rawToken);
    setAdminRefreshTokenCookie(res, refreshToken, refreshTokenExpiresAt);
    res.status(200).json({ accessToken });
  }

  async logout(req: Request, res: Response): Promise<void> {
    const rawToken = req.signedCookies[ADMIN_REFRESH_TOKEN_COOKIE] as string | undefined;
    await this.logoutUserUseCase.execute(rawToken);
    clearAdminRefreshTokenCookie(res);
    res.status(204).send();
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await this.getCurrentUserUseCase.execute(req.user!.id);
    res.status(200).json({ user: toPublicUser(user) });
  }
}

function toPublicUser(user: { id: string; email: string; name: string; role: string; phone: string | null }) {
  return { id: user.id, email: user.email, name: user.name, role: user.role, phone: user.phone };
}
```

- [ ] **Step 2: Routes**

```typescript
// apps/api/src/modules/admin/interface/http/admin-auth.routes.ts
import { loginSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { validate } from "../../../../middleware/validate";
import type { AdminAuthController } from "./admin-auth.controller";

export function createAdminAuthRouter(controller: AdminAuthController): Router {
  const router = Router();

  router.post("/login", validate(loginSchema), asyncHandler((req, res) => controller.login(req, res)));
  router.post("/refresh", asyncHandler((req, res) => controller.refresh(req, res)));
  router.post("/logout", asyncHandler((req, res) => controller.logout(req, res)));
  router.get("/me", authGuard, asyncHandler((req, res) => controller.me(req, res)));

  return router;
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @woobe/api run typecheck`

Expected: zero errors (this task's files aren't wired into `admin.module.ts` yet — that's Task 13 — so nothing is reachable yet, but everything must still compile standalone).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/modules/admin/interface/http/admin-auth.controller.ts apps/api/src/modules/admin/interface/http/admin-auth.routes.ts
git commit -m "feat(admin): add staff auth controller and routes"
```

---

## Task 13: `admin` module — order management routes + composition root

**Files:**
- Modify: `packages/validation/src/admin.schema.ts` (add the list-orders query schema)
- Create: `apps/api/src/modules/admin/interface/http/admin-orders.controller.ts`
- Create: `apps/api/src/modules/admin/interface/http/admin-orders.routes.ts`
- Modify: `apps/api/src/modules/admin/admin.module.ts`

**Interfaces:**
- Consumes: `listOrdersUseCase`, `getOrderForAdminUseCase`, `startProcessingOrderUseCase`, `shipOrderUseCase`, `deliverOrderUseCase`, `cancelOrderUseCase` (Task 9), `requirePermission`/`PERMISSIONS.MANAGE_ORDERS` (existing).
- Produces: `admin.module.ts` exports a real `router`, mounted at `/api/v1/admin` per Task 2's `modules/index.ts` entry (already registered — no change needed there).

- [ ] **Step 1: Add the list-orders query schema**

In `packages/validation/src/admin.schema.ts`, add:

```typescript
export const listOrdersQuerySchema = z.object({
  status: z.enum(["PENDING_PAYMENT", "CONFIRMED", "PAYMENT_FAILED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"]).optional(),
  search: z.string().trim().min(1).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;
```

- [ ] **Step 2: Controller**

```typescript
// apps/api/src/modules/admin/interface/http/admin-orders.controller.ts
import type { CancelOrderInput, ListOrdersQuery, ShipOrderInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { CancelOrderUseCase } from "../../../orders/application/use-cases/cancel-order.use-case";
import type { DeliverOrderUseCase } from "../../../orders/application/use-cases/deliver-order.use-case";
import type { GetOrderForAdminUseCase } from "../../../orders/application/use-cases/get-order-for-admin.use-case";
import type { ListOrdersUseCase } from "../../../orders/application/use-cases/list-orders.use-case";
import type { ShipOrderUseCase } from "../../../orders/application/use-cases/ship-order.use-case";
import type { StartProcessingOrderUseCase } from "../../../orders/application/use-cases/start-processing-order.use-case";

export class AdminOrdersController {
  constructor(
    private readonly listOrdersUseCase: ListOrdersUseCase,
    private readonly getOrderForAdminUseCase: GetOrderForAdminUseCase,
    private readonly startProcessingOrderUseCase: StartProcessingOrderUseCase,
    private readonly shipOrderUseCase: ShipOrderUseCase,
    private readonly deliverOrderUseCase: DeliverOrderUseCase,
    private readonly cancelOrderUseCase: CancelOrderUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ListOrdersQuery;
    const result = await this.listOrdersUseCase.execute(query);
    res.status(200).json(result);
  }

  async getOne(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const order = await this.getOrderForAdminUseCase.execute(orderId);
    res.status(200).json(order);
  }

  async startProcessing(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const result = await this.startProcessingOrderUseCase.execute(orderId, req.user!);
    res.status(200).json(result.order);
  }

  async ship(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const input = req.body as ShipOrderInput;
    const result = await this.shipOrderUseCase.execute(orderId, req.user!, input);
    res.status(200).json(result.order);
  }

  async deliver(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const result = await this.deliverOrderUseCase.execute(orderId, req.user!);
    res.status(200).json(result.order);
  }

  async cancel(req: Request, res: Response): Promise<void> {
    const orderId = requireOrderId(req);
    const input = req.body as CancelOrderInput;
    const result = await this.cancelOrderUseCase.execute(orderId, req.user!, input.reason);
    res.status(200).json({ order: result.order, refundIssued: result.refundIssued });
  }
}

function requireOrderId(req: Request): string {
  const orderId = req.params.id;
  if (!orderId || typeof orderId !== "string") {
    throw new ValidationError("Order id is required");
  }
  return orderId;
}
```

(`req.user!` is `AuthenticatedUser` — `{ id: string; role: Role }`, already exactly the `actor` shape every order-transition use-case expects; `authGuard` mounted before every route below guarantees it's set.)

- [ ] **Step 3: Routes**

```typescript
// apps/api/src/modules/admin/interface/http/admin-orders.routes.ts
import { cancelOrderSchema, listOrdersQuerySchema, shipOrderSchema } from "@woobe/validation";
import { Router } from "express";
import { asyncHandler } from "../../../../middleware/async-handler";
import { authGuard } from "../../../../middleware/auth-guard";
import { requirePermission } from "../../../../middleware/rbac-guard";
import { validate } from "../../../../middleware/validate";
import { PERMISSIONS } from "../../../../config/permissions";
import type { AdminOrdersController } from "./admin-orders.controller";

export function createAdminOrdersRouter(controller: AdminOrdersController): Router {
  const router = Router();
  router.use(authGuard, requirePermission(PERMISSIONS.MANAGE_ORDERS));

  router.get("/", validate(listOrdersQuerySchema, "query"), asyncHandler((req, res) => controller.list(req, res)));
  router.get("/:id", asyncHandler((req, res) => controller.getOne(req, res)));
  router.post("/:id/processing", asyncHandler((req, res) => controller.startProcessing(req, res)));
  router.post("/:id/ship", validate(shipOrderSchema), asyncHandler((req, res) => controller.ship(req, res)));
  router.post("/:id/deliver", asyncHandler((req, res) => controller.deliver(req, res)));
  router.post("/:id/cancel", validate(cancelOrderSchema), asyncHandler((req, res) => controller.cancel(req, res)));

  return router;
}
```

- [ ] **Step 4: Composition root**

```typescript
// apps/api/src/modules/admin/admin.module.ts
// Composition root for the admin module (ARCHITECTURE.md §3.2). Thin
// permission-gated HTTP gateway ONLY — no business logic, no Prisma access
// of its own. Reuses auth's and orders' already-exported use-cases
// directly, same pattern every other module's composition root uses
// (ADR-025). Real content as of this change: staff auth + order
// management. Product management, inventory, settings, and staff
// management are Week 2-4 scope (architecture.md §6) — see apps/admin's
// nav-config.ts for how those slot in without touching this file's shape.
import { Router } from "express";
import {
  getCurrentUserUseCase,
  loginUserUseCase,
  logoutUserUseCase,
  refreshTokenUseCase,
} from "../auth/auth.module";
import {
  cancelOrderUseCase,
  deliverOrderUseCase,
  getOrderForAdminUseCase,
  listOrdersUseCase,
  shipOrderUseCase,
  startProcessingOrderUseCase,
} from "../orders/orders.module";
import { AdminAuthController } from "./interface/http/admin-auth.controller";
import { createAdminAuthRouter } from "./interface/http/admin-auth.routes";
import { AdminOrdersController } from "./interface/http/admin-orders.controller";
import { createAdminOrdersRouter } from "./interface/http/admin-orders.routes";

const adminAuthController = new AdminAuthController(loginUserUseCase, refreshTokenUseCase, logoutUserUseCase, getCurrentUserUseCase);
const adminOrdersController = new AdminOrdersController(
  listOrdersUseCase,
  getOrderForAdminUseCase,
  startProcessingOrderUseCase,
  shipOrderUseCase,
  deliverOrderUseCase,
  cancelOrderUseCase,
);

export const router = Router();
router.use("/auth", createAdminAuthRouter(adminAuthController));
router.use("/orders", createAdminOrdersRouter(adminOrdersController));
```

- [ ] **Step 5: Typecheck and boundary check**

Run: `pnpm --filter @woobe/api run typecheck && pnpm --filter @woobe/api run boundaries:check`

Expected: both pass — this is the point where an accidental `orders → admin` or `refunds → admin` edge would surface as a boundary violation; there should be none.

- [ ] **Step 6: Manual smoke test against the real dev API**

With the dev Postgres/Redis running and `pnpm --filter @woobe/api run dev` started, run:

```bash
curl -s -c /tmp/admin-cookies.txt -X POST http://localhost:4000/api/v1/admin/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"admin@woobe.in","password":"Admin@12345"}'
```

Expected: `200`, a JSON body with `user.role: "SUPER_ADMIN"` and an `accessToken`, and `/tmp/admin-cookies.txt` containing an `admin_refresh_token` cookie (not `refresh_token`).

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/v1/admin/orders \
  -H "Authorization: Bearer <accessToken from above>"
```

Expected: `200` (empty `items: []` is fine — no orders exist yet in a fresh DB).

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/modules/admin packages/validation/src/admin.schema.ts
git commit -m "feat(admin): add order-management routes and composition root"
```

---

## Task 14: Seed script — staff demo accounts

**Files:**
- Modify: `packages/database/prisma/seed.ts`

**Interfaces:**
- Produces: two more seeded users — `orders@woobe.in` (`ORDER_PROCESSING_STAFF`) and `catalog@woobe.in` (`PRODUCT_MANAGEMENT_STAFF`), same dev-only password convention as the existing `admin@woobe.in`.

- [ ] **Step 1: Add the two staff users**

In `packages/database/prisma/seed.ts`, right after the existing admin-user block (after the `console.log("  Admin user: ...")` line), add:

```typescript
  // ── Staff demo accounts (ADR-024/025) — lets RBAC boundaries actually be
  // exercised in the browser, not just verified by reading permissions.ts. ──
  const staffPasswordHash = await bcrypt.hash("Staff@12345", 12);
  await prisma.user.upsert({
    where: { email: "orders@woobe.in" },
    update: { role: Role.ORDER_PROCESSING_STAFF },
    create: {
      email: "orders@woobe.in",
      name: "Order Processing Staff",
      role: Role.ORDER_PROCESSING_STAFF,
      authCredentials: { create: { method: AuthMethod.PASSWORD, passwordHash: staffPasswordHash } },
    },
  });
  await prisma.user.upsert({
    where: { email: "catalog@woobe.in" },
    update: { role: Role.PRODUCT_MANAGEMENT_STAFF },
    create: {
      email: "catalog@woobe.in",
      name: "Product Management Staff",
      role: Role.PRODUCT_MANAGEMENT_STAFF,
      authCredentials: { create: { method: AuthMethod.PASSWORD, passwordHash: staffPasswordHash } },
    },
  });
  console.log("  Staff users: orders@woobe.in / catalog@woobe.in — password Staff@12345 (dev only)");
```

- [ ] **Step 2: Re-run the seed script**

Run: `set -a; source /Users/jasilm/Desktop/WOOBE/.env; set +a; pnpm db:seed`

Expected: succeeds, prints the new log line, both staff users exist (verify: `psql -h localhost -p 5433 -U woobe -d woobe_dev -c "select email, role from users;"` shows all three).

- [ ] **Step 3: Commit**

```bash
git add packages/database/prisma/seed.ts
git commit -m "feat(database): seed order-processing and product-management staff demo accounts"
```

---

## Task 15: Integration tests — admin auth, RBAC, and the full cancel-with-refund flow

**Files:**
- Create: `apps/api/src/modules/admin/admin.integration.test.ts`

**Interfaces:**
- Consumes: the real Express app (`createApp()`), the real `woobe_test` Postgres DB (`vitest.config.ts` already points every test run at it — no env manipulation needed), Supertest. Mirrors `orders.integration.test.ts`'s and `payments.integration.test.ts`'s exact fixture-helper shapes (`createTestVariant`, `checkoutAddress`, a `checkoutOrder` helper) rather than reinventing them.

**Note on Razorpay in this test env:** `vitest.config.ts` deliberately leaves `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` unset (see its own comment — no test creates a real Razorpay order over the network). This means `IssueRefundForCancelledOrderUseCase`'s gateway call will always hit the "not configured" throw here, exercising the `gateway-error` branch for real — the `not-applicable` (COD) and `gateway-error` (Razorpay, unconfigured) branches are the two honestly testable at this layer. The `refundIssued: true` success branch is already covered by Task 4's isolated unit test (which mocks the gateway port directly, the appropriate layer for that scenario, consistent with how this test file itself never mocks Razorpay either).

- [ ] **Step 1: Confirm `woobe_test` exists and is migrated**

This session's dev Postgres cluster (Task 1's migration ran against `woobe_dev`) may not have a `woobe_test` database yet. Run:

```bash
export PATH="/opt/homebrew/opt/postgresql@15/bin:$PATH"
psql -h localhost -p 5433 -U jasilm -d postgres -c "CREATE DATABASE woobe_test OWNER woobe;" 2>&1 | grep -v "already exists" || true
DATABASE_URL="postgresql://woobe:woobe_dev_password@localhost:5433/woobe_test?schema=public" pnpm --filter @woobe/database run migrate:deploy
```

Expected: database exists (or already did), all migrations including this plan's Task 1 migration applied cleanly.

- [ ] **Step 2: Write the test file**

```typescript
// apps/api/src/modules/admin/admin.integration.test.ts
import { randomUUID, createHmac } from "node:crypto";
import { prisma } from "@woobe/database";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../../app";

/**
 * Integration tests against the REAL test database — same conventions as
 * orders.integration.test.ts/payments.integration.test.ts (fixture helpers
 * copied from there, not reinvented). Covers ADR-025's "Done when" bar:
 * a CUSTOMER can't log into admin, RBAC actually 403s the wrong staff
 * role, the full order lifecycle writes an AdminAuditLog row per
 * transition, and cancellation triggers (or honestly fails to trigger,
 * per today's unconfigured Razorpay keys) a refund.
 */

const TEST_PREFIX = "admin-order-view-integration";
const WEBHOOK_SECRET = "test-webhook-secret"; // matches vitest.config.ts
const app = createApp();

let categoryId: string;
let warehouseId: string;
const createdProductIds: string[] = [];
const createdVariantIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerEmails: string[] = [];

beforeAll(async () => {
  const category = await prisma.category.findFirstOrThrow({ where: { isActive: true } });
  categoryId = category.id;
  const warehouse = await prisma.warehouse.findFirstOrThrow({ where: { isActive: true } });
  warehouseId = warehouse.id;
});

afterAll(async () => {
  if (createdOrderIds.length > 0) {
    await prisma.adminAuditLog.deleteMany({ where: { entityId: { in: createdOrderIds } } });
    await prisma.refund.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.payment.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await prisma.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdVariantIds.length > 0) {
    await prisma.cartItem.deleteMany({ where: { variantId: { in: createdVariantIds } } });
    await prisma.productVariant.deleteMany({ where: { id: { in: createdVariantIds } } });
  }
  if (createdProductIds.length > 0) {
    await prisma.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdCustomerEmails.length > 0) {
    await prisma.user.deleteMany({ where: { email: { in: createdCustomerEmails } } });
  }
  await prisma.$disconnect();
});

async function createTestVariant(quantityAvailable: number): Promise<{ variantId: string }> {
  const suffix = randomUUID().slice(0, 8);
  const product = await prisma.product.create({
    data: { name: `${TEST_PREFIX} Product ${suffix}`, slug: `${TEST_PREFIX}-${suffix}`, categoryId, isActive: true },
  });
  createdProductIds.push(product.id);

  const variant = await prisma.productVariant.create({
    data: { productId: product.id, sku: `${TEST_PREFIX}-${suffix}`, color: "Black", size: "M", weightGrams: 1200, isActive: true },
  });
  createdVariantIds.push(variant.id);

  await prisma.inventory.create({ data: { variantId: variant.id, warehouseId, quantityAvailable, quantityReserved: 0 } });
  return { variantId: variant.id };
}

const checkoutAddress = {
  fullName: "Test Buyer",
  phone: "9876543210",
  line1: "123 Test Street",
  city: "Bengaluru",
  state: "Karnataka",
  pincode: "560001",
};

async function checkoutOrder(agent: ReturnType<typeof request.agent>, variantId: string, paymentMethod: "COD" | "RAZORPAY") {
  await agent.post("/api/v1/cart/items").send({ variantId, quantity: 1 });
  const res = await agent
    .post("/api/v1/orders/checkout")
    .send({ contactEmail: "buyer@test.woobe.internal", address: checkoutAddress, paymentMethod });
  expect(res.status).toBe(201);
  createdOrderIds.push(res.body.id);
  return res.body as { id: string; totalPaise: number };
}

function signPayload(body: string): string {
  return createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
}

/** Checks out RAZORPAY and drives the order all the way to CONFIRMED with a CAPTURED Payment, exactly like payments.integration.test.ts's own webhook test does. */
async function createConfirmedRazorpayOrder(variantId: string) {
  const agent = request.agent(app);
  const order = await checkoutOrder(agent, variantId, "RAZORPAY");

  const razorpayOrderId = `order_test_${randomUUID().slice(0, 12)}`;
  await prisma.payment.create({
    data: { orderId: order.id, provider: "RAZORPAY", status: "CREATED", amountPaise: order.totalPaise, razorpayOrderId },
  });

  const payload = {
    event: "payment.captured",
    payload: {
      payment: {
        entity: { id: `pay_test_${randomUUID().slice(0, 12)}`, order_id: razorpayOrderId, amount: order.totalPaise, status: "captured" },
      },
    },
  };
  const body = JSON.stringify(payload);
  const webhookRes = await request(app)
    .post("/api/v1/payments/razorpay/webhook")
    .set("X-Razorpay-Signature", signPayload(body))
    .set("X-Razorpay-Event-Id", randomUUID())
    .set("Content-Type", "application/json")
    .send(body);
  expect(webhookRes.status).toBe(200);

  return order;
}

/** Checks out COD and confirms it immediately (no gateway step), exactly like payments.integration.test.ts's own COD test does. */
async function createConfirmedCodOrder(variantId: string) {
  const agent = request.agent(app);
  const order = await checkoutOrder(agent, variantId, "COD");
  const confirmRes = await agent.post("/api/v1/payments/cod/confirm").send({ orderId: order.id });
  expect(confirmRes.status).toBe(200);
  return order;
}

async function registerCustomer(email: string, password: string): Promise<void> {
  await request(app).post("/api/v1/auth/register").send({ name: "Test Customer", email, password });
  createdCustomerEmails.push(email);
}

async function loginAdmin(email: string, password: string): Promise<string> {
  const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.accessToken as string;
}

describe("admin auth", () => {
  it("rejects a CUSTOMER login attempt with 403 and issues no admin cookie", async () => {
    const email = `${TEST_PREFIX}-${randomUUID()}@test.woobe.internal`;
    await registerCustomer(email, "Passw0rd");

    const res = await request(app).post("/api/v1/admin/auth/login").send({ email, password: "Passw0rd" });

    expect(res.status).toBe(403);
    expect(res.headers["set-cookie"]?.join(";") ?? "").not.toContain("admin_refresh_token");
  });

  it("logs in a SUPER_ADMIN and issues an admin_refresh_token cookie (not refresh_token)", async () => {
    const res = await request(app).post("/api/v1/admin/auth/login").send({ email: "admin@woobe.in", password: "Admin@12345" });

    expect(res.status).toBe(200);
    const cookies = res.headers["set-cookie"]?.join(";") ?? "";
    expect(cookies).toContain("admin_refresh_token");
    expect(cookies).not.toContain("refresh_token=");
  });
});

describe("admin orders RBAC", () => {
  it("403s a product_management_staff on every /admin/orders route", async () => {
    const accessToken = await loginAdmin("catalog@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/orders").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(403);
  });

  it("allows an order_processing_staff to list orders", async () => {
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const res = await request(app).get("/api/v1/admin/orders").set("Authorization", `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
  });
});

describe("order lifecycle + audit log", () => {
  it("walks CONFIRMED -> PROCESSING -> SHIPPED -> DELIVERED as order_processing_staff, logging each transition", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedCodOrder(variantId);
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");
    const auth = { Authorization: `Bearer ${accessToken}` };

    const processing = await request(app).post(`/api/v1/admin/orders/${order.id}/processing`).set(auth);
    expect(processing.status).toBe(200);
    expect(processing.body.status).toBe("PROCESSING");

    const shipped = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/ship`)
      .set(auth)
      .send({ trackingNumber: "TRK123", carrier: "BlueDart" });
    expect(shipped.status).toBe(200);
    expect(shipped.body.status).toBe("SHIPPED");
    expect(shipped.body.trackingNumber).toBe("TRK123");

    const delivered = await request(app).post(`/api/v1/admin/orders/${order.id}/deliver`).set(auth);
    expect(delivered.status).toBe(200);
    expect(delivered.body.status).toBe("DELIVERED");
    expect(delivered.body.deliveredAt).not.toBeNull();

    const auditLogs = await prisma.adminAuditLog.findMany({ where: { entityId: order.id }, orderBy: { createdAt: "asc" } });
    expect(auditLogs.map((log) => log.action)).toEqual(["ORDER_PROCESSING_STARTED", "ORDER_SHIPPED", "ORDER_DELIVERED"]);
  });
});

describe("cancellation + refund", () => {
  it("cancelling a CONFIRMED COD order releases inventory and triggers no refund", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedCodOrder(variantId);
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");

    const beforeInventory = await prisma.inventory.findFirstOrThrow({ where: { variantId } });
    expect(beforeInventory.quantityReserved).toBe(0); // COD confirm already finalized the reservation into a deduction

    const res = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({ reason: "test" });

    expect(res.status).toBe(200);
    expect(res.body.refundIssued).toBe(false);
    expect(res.body.order.status).toBe("CANCELLED");

    const refund = await prisma.refund.findFirst({ where: { orderId: order.id } });
    expect(refund).toBeNull();

    const auditLog = await prisma.adminAuditLog.findFirstOrThrow({ where: { entityId: order.id, action: "ORDER_CANCELLED" } });
    expect(auditLog.metadata).toMatchObject({ reason: "test", refundIssued: false });
  });

  it("cancelling a CONFIRMED Razorpay order with today's unconfigured Razorpay keys still cancels the order and records a FAILED refund", async () => {
    const { variantId } = await createTestVariant(3);
    const order = await createConfirmedRazorpayOrder(variantId);
    const accessToken = await loginAdmin("orders@woobe.in", "Staff@12345");

    const res = await request(app)
      .post(`/api/v1/admin/orders/${order.id}/cancel`)
      .set("Authorization", `Bearer ${accessToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.order.status).toBe("CANCELLED");
    expect(res.body.refundIssued).toBe(false); // Razorpay unconfigured in this test env — gateway-error branch

    const refund = await prisma.refund.findFirstOrThrow({ where: { orderId: order.id } });
    expect(refund.status).toBe("FAILED");

    const payment = await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } });
    expect(payment.status).toBe("CAPTURED"); // NOT marked REFUNDED — the gateway call never succeeded
  });
});
```

- [ ] **Step 3: Run the new test file**

Run: `pnpm --filter @woobe/api exec vitest run src/modules/admin/admin.integration.test.ts`

Expected: PASS, all 7 tests.

- [ ] **Step 4: Run the full `apps/api` test suite**

Run: `pnpm --filter @woobe/api run test`

Expected: all green — previous test count plus this file's 7 new tests, nothing else regressed.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/modules/admin/admin.integration.test.ts
git commit -m "test(admin): integration tests for staff auth, RBAC, order lifecycle, and cancel-with-refund"
```

---

## Task 16: Share the `Permission` type; `apps/admin` API client + staff auth (client, hook, login page)

**Files:**
- Modify: `packages/types/src/enums.ts`
- Modify: `apps/api/src/config/permissions.ts`
- Create: `apps/admin/src/lib/api-client.ts`
- Create: `apps/admin/src/features/auth/api/admin-auth.client.ts`
- Create: `apps/admin/src/features/auth/hooks/useAdminAuth.tsx`
- Create: `apps/admin/src/features/auth/components/LoginForm.tsx`
- Create: `apps/admin/app/login/page.tsx`
- Modify: `apps/admin/app/layout.tsx`

**Interfaces:**
- Produces: `Permission` (shared type, `@woobe/types`), `apiFetch` (mirrors `apps/web`'s exactly, pointed at `NEXT_PUBLIC_ADMIN_API_URL`), `AdminAuthProvider`/`useAdminAuth()` (mirrors `apps/web`'s `useAuth` exactly).

- [ ] **Step 1: Move the `Permission` union into `packages/types`**

In `packages/types/src/enums.ts`, add:

```typescript
/// ADR-024's permission vocabulary (apps/api/src/config/permissions.ts owns
/// the role->permission MAP, which is server-only business logic; this
/// union alone is shared so apps/admin can gate nav/buttons the same way
/// (ADR-020) — client-side is a UI convenience, the server route guard is
/// what actually enforces it.
export const PERMISSION = ["MANAGE_SETTINGS", "MANAGE_CATALOG", "MANAGE_INVENTORY", "MANAGE_ORDERS", "MANAGE_STAFF"] as const;
export type Permission = (typeof PERMISSION)[number];
```

In `apps/api/src/config/permissions.ts`, replace the local `Permission` type with an import:

```typescript
import type { Permission } from "@woobe/types";
import { PERMISSION } from "@woobe/types";
```

and change `export const PERMISSIONS = { ... } as const;` to build itself from the shared list instead of redeclaring the string literals — simplest correct change: keep the existing `PERMISSIONS` object literal exactly as-is (it already has the right keys/values), just delete the now-redundant local `export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];` line and rely on the imported one instead. Everything else in the file (`ROLE_PERMISSIONS`, `roleHasPermission`) is unchanged.

- [ ] **Step 2: Typecheck the whole workspace**

Run: `pnpm --filter @woobe/api run typecheck && pnpm --filter @woobe/types run typecheck`

Expected: zero errors — confirms nothing else in `apps/api` depended on `Permission` being locally declared in a way this change breaks.

- [ ] **Step 3: `apps/admin`'s API client — identical shape to `apps/web`'s**

```typescript
// apps/admin/src/lib/api-client.ts
/**
 * The ONLY thing that talks to apps/api (ARCHITECTURE.md §4.2), identical
 * shape to apps/web's own lib/api-client.ts — apps/admin never imports
 * @woobe/database or queries Postgres directly either (ADR-019).
 */

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fieldErrors?: Record<string, string[] | undefined>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function apiBaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_ADMIN_API_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_ADMIN_API_URL is not set — copy apps/admin/.env.example to apps/admin/.env.local.");
  }
  return url;
}

interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  body?: unknown;
  accessToken?: string;
}

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { body, accessToken, headers, ...rest } = options;

  const res = await fetch(`${apiBaseUrl()}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) {
    return undefined as T;
  }

  const data: unknown = await res.json().catch(() => null);

  if (!res.ok) {
    const errorBody = (data as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string[]> } })?.error;
    throw new ApiError(res.status, errorBody?.code ?? "UNKNOWN_ERROR", errorBody?.message ?? "Something went wrong", errorBody?.fieldErrors);
  }

  return data as T;
}
```

- [ ] **Step 4: Staff auth API client**

```typescript
// apps/admin/src/features/auth/api/admin-auth.client.ts
import type { Permission, Role } from "@woobe/types";
import type { LoginInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone: string | null;
}

export interface AdminSession {
  user: AdminUser;
  accessToken: string;
}

export function login(input: LoginInput): Promise<AdminSession> {
  return apiFetch<AdminSession>("/api/v1/admin/auth/login", { method: "POST", body: input });
}

/** Relies on the httpOnly admin_refresh_token cookie (sent via credentials:'include'). */
export function refresh(): Promise<{ accessToken: string }> {
  return apiFetch<{ accessToken: string }>("/api/v1/admin/auth/refresh", { method: "POST" });
}

export function logout(): Promise<void> {
  return apiFetch<void>("/api/v1/admin/auth/logout", { method: "POST" });
}

export function me(accessToken: string): Promise<{ user: AdminUser }> {
  return apiFetch<{ user: AdminUser }>("/api/v1/admin/auth/me", { accessToken });
}

export type { Permission };
```

- [ ] **Step 5: Session hook (identical shape to `apps/web`'s `useAuth`)**

```tsx
// apps/admin/src/features/auth/hooks/useAdminAuth.tsx
"use client";

import type { LoginInput } from "@woobe/validation";
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as adminAuthApi from "../api/admin-auth.client";
import type { AdminUser } from "../api/admin-auth.client";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

interface AdminAuthContextValue {
  user: AdminUser | null;
  accessToken: string | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

/** Mirrors apps/web's AuthProvider exactly (same in-memory-access-token / httpOnly-refresh-cookie split) — see that file's own comment for why. */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { accessToken: freshToken } = await adminAuthApi.refresh();
        const { user: freshUser } = await adminAuthApi.me(freshToken);
        if (cancelled) return;
        setAccessToken(freshToken);
        setUser(freshUser);
        setStatus("authenticated");
      } catch {
        if (!cancelled) setStatus("unauthenticated");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (input: LoginInput) => {
    const session = await adminAuthApi.login(input);
    setAccessToken(session.accessToken);
    setUser(session.user);
    setStatus("authenticated");
  }, []);

  const logout = useCallback(async () => {
    try {
      await adminAuthApi.logout();
    } finally {
      setAccessToken(null);
      setUser(null);
      setStatus("unauthenticated");
    }
  }, []);

  return <AdminAuthContext.Provider value={{ user, accessToken, status, login, logout }}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) {
    throw new Error("useAdminAuth must be used within <AdminAuthProvider>");
  }
  return ctx;
}
```

- [ ] **Step 6: Login form + page**

```tsx
// apps/admin/src/features/auth/components/LoginForm.tsx
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema, type LoginInput } from "@woobe/validation";
import { Button, FormField, Input } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAdminAuth } from "../hooks/useAdminAuth";

export function LoginForm() {
  const router = useRouter();
  const { login } = useAdminAuth();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (input) => {
    try {
      await login(input);
      router.replace("/orders");
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Login failed");
    }
  });

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-4">
      <FormField label="Email" error={errors.email?.message}>
        <Input type="email" {...register("email")} />
      </FormField>
      <FormField label="Password" error={errors.password?.message}>
        <Input type="password" {...register("password")} />
      </FormField>
      <Button type="submit" isLoading={isSubmitting}>
        Log in
      </Button>
    </form>
  );
}
```

```tsx
// apps/admin/app/login/page.tsx
import { LoginForm } from "@/features/auth/components/LoginForm";

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <h1 className="font-display text-2xl text-text-primary">Woobe Admin</h1>
      <LoginForm />
    </main>
  );
}
```

- [ ] **Step 7: Wrap the root layout with `AdminAuthProvider`**

In `apps/admin/app/layout.tsx`, wrap `{children}` with the provider:

```tsx
import { AdminAuthProvider } from "@/features/auth/hooks/useAdminAuth";
// ...
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <AdminAuthProvider>{children}</AdminAuthProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Verify path aliases exist**

Run: `grep -n "\"@/\\*\"" apps/admin/tsconfig.json` — if the `@/*` path alias (used throughout the code above) isn't already configured, add it matching `apps/web/tsconfig.json`'s own `paths` entry exactly.

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @woobe/admin run typecheck`

Expected: zero errors.

- [ ] **Step 10: Manual browser check**

With `apps/api` and `apps/admin` dev servers running, open `http://localhost:3001/login`, log in as `admin@woobe.in` / `Admin@12345`. Expected: redirects to `/orders` (404 is fine/expected — that page doesn't exist until Task 19 — the point of this check is confirming login succeeds and the redirect fires, not that the destination page renders).

- [ ] **Step 11: Commit**

```bash
git add packages/types/src/enums.ts apps/api/src/config/permissions.ts apps/admin/src/lib apps/admin/src/features/auth apps/admin/app/login apps/admin/app/layout.tsx
git commit -m "feat(admin): staff login (API client, session hook, login page)"
```

---

## Task 17: Dashboard shell — nav config, sidebar/top bar, layout guard

**Files:**
- Create: `apps/admin/src/features/shell/nav-config.ts`
- Create: `apps/admin/src/features/shell/components/Sidebar.tsx`
- Create: `apps/admin/src/features/shell/components/TopBar.tsx`
- Create: `apps/admin/app/(dashboard)/layout.tsx`
- Create: `apps/admin/app/(dashboard)/page.tsx`

**Interfaces:**
- Consumes: `useAdminAuth` (Task 16), `Permission` (Task 16, `@woobe/types`).
- Produces: `ADMIN_NAV` (the extensibility hook every future admin section registers into), `<Sidebar>`, `<TopBar>` — composed by `(dashboard)/layout.tsx`, which every future `(dashboard)/<section>/page.tsx` sits under for free.

- [ ] **Step 1: Nav config — the concrete "more is coming" hook**

```typescript
// apps/admin/src/features/shell/nav-config.ts
import type { Permission } from "@woobe/types";

export interface AdminNavEntry {
  label: string;
  href: string;
  status: "live" | "coming-soon";
  permission: Permission;
}

/**
 * Every planned admin section, in one place. A staff member only ever
 * sees entries their role has permission for (see Sidebar.tsx); a
 * `coming-soon` entry renders disabled with a badge rather than being
 * hidden, so the shape of what's coming is visible now. Next week's work
 * is: build the feature folder, add the route, flip one line here — not
 * touch this file's structure or Sidebar/TopBar at all.
 */
export const ADMIN_NAV: AdminNavEntry[] = [
  { label: "Orders", href: "/orders", status: "live", permission: "MANAGE_ORDERS" },
  { label: "Products", href: "/products", status: "coming-soon", permission: "MANAGE_CATALOG" },
  { label: "Inventory", href: "/inventory", status: "coming-soon", permission: "MANAGE_INVENTORY" },
  { label: "Settings", href: "/settings", status: "coming-soon", permission: "MANAGE_SETTINGS" },
  { label: "Staff", href: "/staff", status: "coming-soon", permission: "MANAGE_STAFF" },
  { label: "Returns", href: "/returns", status: "coming-soon", permission: "MANAGE_ORDERS" },
];

/** Mirrors apps/api/src/config/permissions.ts's ROLE_PERMISSIONS map — duplicated here (client-side convenience only, never the actual enforcement) rather than imported, since apps/admin can't reach into apps/api's internals (ADR-019). The server route guard is what actually enforces access; this only decides what to show. */
const ROLE_PERMISSIONS: Record<string, ReadonlySet<Permission>> = {
  CUSTOMER: new Set(),
  SUPER_ADMIN: new Set(["MANAGE_SETTINGS", "MANAGE_CATALOG", "MANAGE_INVENTORY", "MANAGE_ORDERS", "MANAGE_STAFF"]),
  ORDER_PROCESSING_STAFF: new Set(["MANAGE_ORDERS"]),
  PRODUCT_MANAGEMENT_STAFF: new Set(["MANAGE_CATALOG", "MANAGE_INVENTORY"]),
};

export function navEntriesForRole(role: string): AdminNavEntry[] {
  const permissions = ROLE_PERMISSIONS[role] ?? new Set();
  return ADMIN_NAV.filter((entry) => permissions.has(entry.permission));
}
```

- [ ] **Step 2: Sidebar**

```tsx
// apps/admin/src/features/shell/components/Sidebar.tsx
"use client";

import { Badge } from "@woobe/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { navEntriesForRole } from "../nav-config";

export function Sidebar() {
  const { user } = useAdminAuth();
  const pathname = usePathname();
  const entries = navEntriesForRole(user?.role ?? "CUSTOMER");

  return (
    <nav className="flex w-56 shrink-0 flex-col gap-1 border-r border-border p-4">
      {entries.map((entry) => {
        const isActive = pathname.startsWith(entry.href);
        if (entry.status === "coming-soon") {
          return (
            <span
              key={entry.href}
              className="flex items-center justify-between rounded-md px-3 py-2 font-body text-sm text-text-secondary opacity-50"
            >
              {entry.label}
              <Badge variant="neutral">Soon</Badge>
            </span>
          );
        }
        return (
          <Link
            key={entry.href}
            href={entry.href}
            className={`rounded-md px-3 py-2 font-body text-sm ${isActive ? "bg-primary-tint text-primary" : "text-text-primary hover:bg-primary-tint/50"}`}
          >
            {entry.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

- [ ] **Step 3: Top bar**

```tsx
// apps/admin/src/features/shell/components/TopBar.tsx
"use client";

import { Button } from "@woobe/ui";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";

export function TopBar() {
  const { user, logout } = useAdminAuth();
  return (
    <header className="flex items-center justify-between border-b border-border px-6 py-3">
      <span className="font-display text-lg text-text-primary">Woobe Admin</span>
      <div className="flex items-center gap-3">
        <span className="font-body text-sm text-text-secondary">
          {user?.name} · {user?.role.replace(/_/g, " ").toLowerCase()}
        </span>
        <Button variant="secondary" onClick={() => void logout()}>
          Log out
        </Button>
      </div>
    </header>
  );
}
```

- [ ] **Step 4: Dashboard layout with the session guard**

```tsx
// apps/admin/app/(dashboard)/layout.tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { Sidebar } from "@/features/shell/components/Sidebar";
import { TopBar } from "@/features/shell/components/TopBar";

/** Mirrors apps/web's AccountView guard pattern exactly — redirect once the silent-refresh attempt settles, not before. */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { status } = useAdminAuth();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  if (status === "loading") {
    return <p className="p-8 text-center font-body text-text-secondary">Loading…</p>;
  }
  if (status === "unauthenticated") {
    return null; // redirect effect above is already firing
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <TopBar />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Dashboard index redirects to Orders — no dashboard-home scope creep**

```tsx
// apps/admin/app/(dashboard)/page.tsx
import { redirect } from "next/navigation";

export default function DashboardIndexPage() {
  redirect("/orders");
}
```

- [ ] **Step 6: Delete the old placeholder root page — it now conflicts with this route**

`apps/admin/app/(dashboard)/page.tsx` (Step 5) resolves to `/` — Next.js route groups like `(dashboard)` don't add a URL segment. The existing `apps/admin/app/page.tsx` (the Week-1 placeholder — "Basic order view lands Week 1 Day 5...") ALSO resolves to `/`. Left in place, these are two parallel pages resolving to the same path and Next.js will refuse to build ("You cannot have two parallel pages that resolve to the same path"). Delete it:

```bash
rm apps/admin/app/page.tsx
```

- [ ] **Step 7: Typecheck and build**

Run: `pnpm --filter @woobe/admin run typecheck && pnpm --filter @woobe/admin run build`

Expected: both succeed — the build step specifically confirms Step 6 actually resolved the route conflict (typecheck alone wouldn't catch it; it's a Next.js routing-level error, not a TypeScript one). An unresolved `/orders` route is fine at this point (Task 19 creates it).

- [ ] **Step 8: Manual browser check**

Log in at `/login`. Expected: lands on `/orders` (still 404 until Task 19 — that's fine, the point here is confirming the redirect fires without a route-conflict error), sidebar shows "Orders" live and every other section greyed out with a "Soon" badge, top bar shows the logged-in user's name and role, "Log out" works and redirects back to `/login`.

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/features/shell "apps/admin/app/(dashboard)"
git rm apps/admin/app/page.tsx
git commit -m "feat(admin): dashboard shell (sidebar, top bar, session guard, nav config)"
```

---

## Task 18: `apps/admin` order-management API client + hooks

**Files:**
- Create: `apps/admin/src/features/order-management/api/admin-orders.client.ts`
- Create: `apps/admin/src/features/order-management/hooks/useAdminOrders.ts`
- Create: `apps/admin/src/features/order-management/hooks/useAdminOrder.ts`

**Interfaces:**
- Produces: `AdminOrderView`, `AdminOrderSummaryView`; `listOrders(params, accessToken)`, `getOrder(id, accessToken)`, `startProcessing`/`ship`/`deliver`/`cancel` (each `(id, input?, accessToken) => Promise<...>`); `useAdminOrders(filter)`, `useAdminOrder(id)` — both return `{ data, loading, error, refetch }` shape.

- [ ] **Step 1: API client**

```typescript
// apps/admin/src/features/order-management/api/admin-orders.client.ts
import type { OrderStatus, PaymentMethod } from "@woobe/types";
import type { CancelOrderInput, ShipOrderInput } from "@woobe/validation";
import { apiFetch } from "@/lib/api-client";

export interface AdminOrderItemView {
  id: string;
  variantId: string;
  productNameSnapshot: string;
  skuSnapshot: string;
  color: string;
  size: string;
  weightGrams: number;
  unitRatePerKgPaise: number;
  unitPricePaise: number;
  quantity: number;
  lineTotalPaise: number;
  taxAmountPaise: number;
}

export interface AdminOrderView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  shippingSnapshot: { fullName: string; phone: string; line1: string; line2?: string; city: string; state: string; pincode: string };
  subtotalPaise: number;
  discountPaise: number;
  shippingFeePaise: number;
  taxPaise: number;
  totalPaise: number;
  totalWeightGrams: number;
  paymentMethod: PaymentMethod;
  placedAt: string;
  trackingNumber: string | null;
  carrier: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string | null;
  items: AdminOrderItemView[];
}

export interface AdminOrderSummaryView {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  contactName: string;
  contactEmail: string;
  totalPaise: number;
  itemCount: number;
  placedAt: string;
}

export interface ListOrdersParams {
  status?: OrderStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

function toQuery(params: ListOrdersParams): string {
  const query = new URLSearchParams();
  if (params.status) query.set("status", params.status);
  if (params.search) query.set("search", params.search);
  query.set("page", String(params.page ?? 1));
  query.set("pageSize", String(params.pageSize ?? 20));
  return query.toString();
}

export function listOrders(params: ListOrdersParams, accessToken: string): Promise<{ items: AdminOrderSummaryView[]; total: number }> {
  return apiFetch(`/api/v1/admin/orders?${toQuery(params)}`, { accessToken });
}

export function getOrder(id: string, accessToken: string): Promise<AdminOrderView> {
  return apiFetch(`/api/v1/admin/orders/${id}`, { accessToken });
}

export function startProcessing(id: string, accessToken: string): Promise<AdminOrderView> {
  return apiFetch(`/api/v1/admin/orders/${id}/processing`, { method: "POST", accessToken });
}

export function ship(id: string, input: ShipOrderInput, accessToken: string): Promise<AdminOrderView> {
  return apiFetch(`/api/v1/admin/orders/${id}/ship`, { method: "POST", body: input, accessToken });
}

export function deliver(id: string, accessToken: string): Promise<AdminOrderView> {
  return apiFetch(`/api/v1/admin/orders/${id}/deliver`, { method: "POST", accessToken });
}

export function cancel(id: string, input: CancelOrderInput, accessToken: string): Promise<{ order: AdminOrderView; refundIssued: boolean }> {
  return apiFetch(`/api/v1/admin/orders/${id}/cancel`, { method: "POST", body: input, accessToken });
}
```

- [ ] **Step 2: List hook**

```typescript
// apps/admin/src/features/order-management/hooks/useAdminOrders.ts
"use client";

import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as ordersApi from "../api/admin-orders.client";
import type { AdminOrderSummaryView, ListOrdersParams } from "../api/admin-orders.client";

export function useAdminOrders(filter: ListOrdersParams) {
  const { accessToken } = useAdminAuth();
  const [items, setItems] = useState<AdminOrderSummaryView[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const result = await ordersApi.listOrders(filter, accessToken);
      setItems(result.items);
      setTotal(result.total);
    } catch {
      setError("Couldn't load orders.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, filter.status, filter.search, filter.page, filter.pageSize]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { items, total, loading, error, refetch };
}
```

- [ ] **Step 3: Single-order hook (with every action bound to a refetch)**

```typescript
// apps/admin/src/features/order-management/hooks/useAdminOrder.ts
"use client";

import type { CancelOrderInput, ShipOrderInput } from "@woobe/validation";
import { useCallback, useEffect, useState } from "react";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as ordersApi from "../api/admin-orders.client";
import type { AdminOrderView } from "../api/admin-orders.client";

export function useAdminOrder(orderId: string) {
  const { accessToken } = useAdminAuth();
  const [order, setOrder] = useState<AdminOrderView | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastRefundIssued, setLastRefundIssued] = useState<boolean | null>(null);

  const refetch = useCallback(async () => {
    if (!accessToken) return;
    setLoading(true);
    try {
      setOrder(await ordersApi.getOrder(orderId, accessToken));
    } finally {
      setLoading(false);
    }
  }, [orderId, accessToken]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  const requireToken = () => {
    if (!accessToken) throw new Error("Not authenticated");
    return accessToken;
  };

  return {
    order,
    loading,
    lastRefundIssued,
    refetch,
    startProcessing: async () => {
      setOrder(await ordersApi.startProcessing(orderId, requireToken()));
    },
    ship: async (input: ShipOrderInput) => {
      setOrder(await ordersApi.ship(orderId, input, requireToken()));
    },
    deliver: async () => {
      setOrder(await ordersApi.deliver(orderId, requireToken()));
    },
    cancel: async (input: CancelOrderInput) => {
      const result = await ordersApi.cancel(orderId, input, requireToken());
      setOrder(result.order);
      setLastRefundIssued(result.refundIssued);
    },
  };
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @woobe/admin run typecheck`

Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add apps/admin/src/features/order-management/api apps/admin/src/features/order-management/hooks
git commit -m "feat(admin): order-management API client and data hooks"
```

---

## Task 19: Orders list page (table + filters)

**Files:**
- Create: `apps/admin/src/features/order-management/components/OrdersTable.tsx`
- Create: `apps/admin/src/features/order-management/components/OrderFilters.tsx`
- Create: `apps/admin/app/(dashboard)/orders/page.tsx`

**Interfaces:**
- Consumes: `useAdminOrders` (Task 18).
- Produces: the `/orders` route that Task 17's dashboard redirect and Sidebar link both already point to.

- [ ] **Step 1: Filters**

```tsx
// apps/admin/src/features/order-management/components/OrderFilters.tsx
"use client";

import type { OrderStatus } from "@woobe/types";
import { Input } from "@woobe/ui";

const STATUSES: OrderStatus[] = ["PENDING_PAYMENT", "CONFIRMED", "PAYMENT_FAILED", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED"];

export function OrderFilters({
  status,
  search,
  onStatusChange,
  onSearchChange,
}: {
  status: OrderStatus | undefined;
  search: string;
  onStatusChange: (status: OrderStatus | undefined) => void;
  onSearchChange: (search: string) => void;
}) {
  return (
    <div className="flex gap-3">
      <select
        value={status ?? ""}
        onChange={(e) => onStatusChange((e.target.value || undefined) as OrderStatus | undefined)}
        className="rounded-md border border-border bg-surface px-3 py-2 font-body text-sm text-text-primary"
      >
        <option value="">All statuses</option>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
      <Input
        placeholder="Search order number or email"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="max-w-xs"
      />
    </div>
  );
}
```

- [ ] **Step 2: Table**

```tsx
// apps/admin/src/features/order-management/components/OrdersTable.tsx
"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge } from "@woobe/ui";
import Link from "next/link";
import type { AdminOrderSummaryView } from "../api/admin-orders.client";

const STATUS_VARIANT: Record<string, "success" | "error" | "neutral"> = {
  DELIVERED: "success",
  CONFIRMED: "success",
  PAYMENT_FAILED: "error",
  CANCELLED: "error",
};

export function OrdersTable({ items }: { items: AdminOrderSummaryView[] }) {
  if (items.length === 0) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">No orders match these filters.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] border-collapse font-body text-sm">
        <thead>
          <tr className="border-b border-border text-left text-text-secondary">
            <th className="py-2 pr-4">Order</th>
            <th className="py-2 pr-4">Customer</th>
            <th className="py-2 pr-4">Items</th>
            <th className="py-2 pr-4">Total</th>
            <th className="py-2 pr-4">Status</th>
            <th className="py-2 pr-4">Placed</th>
          </tr>
        </thead>
        <tbody>
          {items.map((order) => (
            <tr key={order.id} className="border-b border-border hover:bg-primary-tint/30">
              <td className="py-3 pr-4">
                <Link href={`/orders/${order.id}`} className="text-primary hover:underline">
                  {order.orderNumber}
                </Link>
              </td>
              <td className="py-3 pr-4 text-text-primary">
                {order.contactName}
                <div className="text-xs text-text-secondary">{order.contactEmail}</div>
              </td>
              <td className="py-3 pr-4 text-text-primary">{order.itemCount}</td>
              <td className="py-3 pr-4 text-text-primary">{formatPaiseAsInr(order.totalPaise)}</td>
              <td className="py-3 pr-4">
                <Badge variant={STATUS_VARIANT[order.status] ?? "neutral"}>{order.status.replace(/_/g, " ").toLowerCase()}</Badge>
              </td>
              <td className="py-3 pr-4 text-text-secondary">{new Date(order.placedAt).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Page — routing + filter state only**

```tsx
// apps/admin/app/(dashboard)/orders/page.tsx
"use client";

import type { OrderStatus } from "@woobe/types";
import { useState } from "react";
import { OrderFilters } from "@/features/order-management/components/OrderFilters";
import { OrdersTable } from "@/features/order-management/components/OrdersTable";
import { useAdminOrders } from "@/features/order-management/hooks/useAdminOrders";

export default function OrdersPage() {
  const [status, setStatus] = useState<OrderStatus | undefined>(undefined);
  const [search, setSearch] = useState("");
  const { items, loading, error } = useAdminOrders({ status, search: search || undefined, page: 1, pageSize: 50 });

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">Orders</h1>
      <OrderFilters status={status} search={search} onStatusChange={setStatus} onSearchChange={setSearch} />
      {loading ? (
        <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>
      ) : error ? (
        <p className="py-12 text-center font-body text-sm text-error">{error}</p>
      ) : (
        <OrdersTable items={items} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Confirm `formatPaiseAsInr` is exported from `@woobe/utils`**

Run: `grep -n "formatPaiseAsInr" packages/utils/src/index.ts` — this is already used by `apps/web` (`OrderConfirmation.tsx`), so it should already be exported; if the grep comes back empty, export it from wherever it's actually defined instead of assuming the name.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @woobe/admin run typecheck`

Expected: zero errors.

- [ ] **Step 6: Manual browser check**

Log in as `admin@woobe.in`, land on `/orders`. Expected: table renders (empty state if no orders exist yet — that's fine), status filter and search box both work (verify by placing at least one test order via the storefront first, then filtering by its status and searching its order number).

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/features/order-management/components/OrdersTable.tsx apps/admin/src/features/order-management/components/OrderFilters.tsx apps/admin/app/\(dashboard\)/orders/page.tsx
git commit -m "feat(admin): orders list page with status filter and search"
```

---

## Task 20: Order detail page (status actions + timeline) and final end-to-end verification

**Files:**
- Modify: `apps/admin/src/features/shell/nav-config.ts` (export a reusable `hasPermission` helper)
- Create: `apps/admin/src/features/order-management/components/OrderTimeline.tsx`
- Create: `apps/admin/src/features/order-management/components/OrderStatusActions.tsx`
- Create: `apps/admin/src/features/order-management/components/OrderDetail.tsx`
- Create: `apps/admin/app/(dashboard)/orders/[id]/page.tsx`

**Interfaces:**
- Consumes: `useAdminOrder` (Task 18), `useAdminAuth` (Task 16), `hasPermission` (this task).
- Produces: the `/orders/:id` route that `OrdersTable`'s links (Task 19) already point to. This is the last file in the plan — once it's done, the full spec (§2, "Explicitly In Scope") is implemented.

- [ ] **Step 1: Export a reusable permission check from `nav-config.ts`**

In `apps/admin/src/features/shell/nav-config.ts`, change `const ROLE_PERMISSIONS = ...` to `export const ROLE_PERMISSIONS = ...`, and add:

```typescript
export function hasPermission(role: string | undefined, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role ?? "CUSTOMER"] ?? new Set()).has(permission);
}
```

- [ ] **Step 2: Timeline**

```tsx
// apps/admin/src/features/order-management/components/OrderTimeline.tsx
import { CheckCircle2, Circle, XCircle } from "lucide-react";
import type { AdminOrderView } from "../api/admin-orders.client";

function Step({ label, at, done, failed }: { label: string; at: string | null; done: boolean; failed?: boolean }) {
  const Icon = failed ? XCircle : done ? CheckCircle2 : Circle;
  return (
    <div className="flex items-center gap-3">
      <Icon className={`h-4 w-4 ${failed ? "text-error" : done ? "text-success" : "text-text-secondary"}`} aria-hidden="true" />
      <span className={`font-body text-sm ${done ? "text-text-primary" : "text-text-secondary"}`}>{label}</span>
      {at ? <span className="font-body text-xs text-text-secondary">{new Date(at).toLocaleString()}</span> : null}
    </div>
  );
}

export function OrderTimeline({ order }: { order: AdminOrderView }) {
  if (order.status === "CANCELLED") {
    return (
      <div className="flex flex-col gap-2">
        <Step label="Placed" at={order.placedAt} done />
        <Step label={`Cancelled${order.cancellationReason ? ` — ${order.cancellationReason}` : ""}`} at={order.cancelledAt} done failed />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <Step label="Placed" at={order.placedAt} done />
      <Step label="Confirmed" at={null} done={order.status !== "PENDING_PAYMENT" && order.status !== "PAYMENT_FAILED"} />
      <Step label="Processing" at={null} done={["PROCESSING", "SHIPPED", "DELIVERED"].includes(order.status)} />
      <Step label={order.carrier ? `Shipped via ${order.carrier}` : "Shipped"} at={order.shippedAt} done={["SHIPPED", "DELIVERED"].includes(order.status)} />
      <Step label="Delivered" at={order.deliveredAt} done={order.status === "DELIVERED"} />
    </div>
  );
}
```

- [ ] **Step 3: Status actions — the only status-changing controls in the whole app so far**

```tsx
// apps/admin/src/features/order-management/components/OrderStatusActions.tsx
"use client";

import { Button, Input } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import { ApiError } from "@/lib/api-client";
import { hasPermission } from "@/features/shell/nav-config";
import type { AdminOrderView } from "../api/admin-orders.client";

interface Props {
  order: AdminOrderView;
  onStartProcessing: () => Promise<void>;
  onShip: (input: { trackingNumber: string; carrier: string }) => Promise<void>;
  onDeliver: () => Promise<void>;
  onCancel: (input: { reason?: string }) => Promise<void>;
  lastRefundIssued: boolean | null;
}

export function OrderStatusActions({ order, onStartProcessing, onShip, onDeliver, onCancel, lastRefundIssued }: Props) {
  const { user } = useAdminAuth();
  const [busy, setBusy] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [trackingNumber, setTrackingNumber] = useState("");
  const [carrier, setCarrier] = useState("");
  const [reason, setReason] = useState("");

  if (!hasPermission(user?.role, "MANAGE_ORDERS")) {
    return null; // defense in depth — the API already enforces this; a staff member without the permission shouldn't see a live-looking button that 403s
  }

  const run = async (action: () => Promise<void>, successMessage: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(successMessage);
      setShipping(false);
      setCancelling(false);
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  };

  if (order.status === "CONFIRMED") {
    return (
      <div className="flex gap-2">
        <Button onClick={() => void run(onStartProcessing, "Order moved to processing")} isLoading={busy}>
          Mark as processing
        </Button>
        <Button variant="secondary" onClick={() => setCancelling(true)} disabled={busy}>
          Cancel order
        </Button>
        {cancelling ? renderCancelForm() : null}
      </div>
    );
  }

  if (order.status === "PROCESSING") {
    return (
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <Button onClick={() => setShipping(true)} disabled={busy}>
            Mark as shipped
          </Button>
          <Button variant="secondary" onClick={() => setCancelling(true)} disabled={busy}>
            Cancel order
          </Button>
        </div>
        {shipping ? (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            <Input placeholder="Tracking number" value={trackingNumber} onChange={(e) => setTrackingNumber(e.target.value)} />
            <Input placeholder="Carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
            <Button
              onClick={() => void run(() => onShip({ trackingNumber, carrier }), "Order marked as shipped")}
              isLoading={busy}
              disabled={!trackingNumber || !carrier}
            >
              Confirm shipment
            </Button>
          </div>
        ) : null}
        {cancelling ? renderCancelForm() : null}
      </div>
    );
  }

  if (order.status === "SHIPPED") {
    return (
      <Button onClick={() => void run(onDeliver, "Order marked as delivered")} isLoading={busy}>
        Mark as delivered
      </Button>
    );
  }

  if (lastRefundIssued === false && order.status === "CANCELLED") {
    return <p className="font-body text-sm text-error">Refund needs manual follow-up — the automatic attempt didn't succeed.</p>;
  }

  return null;

  function renderCancelForm() {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-border p-3">
        <Input placeholder="Reason (optional)" value={reason} onChange={(e) => setReason(e.target.value)} />
        <Button variant="secondary" onClick={() => void run(() => onCancel({ reason: reason || undefined }), "Order cancelled")} isLoading={busy}>
          Confirm cancellation
        </Button>
      </div>
    );
  }
}
```

- [ ] **Step 4: Order detail composition**

```tsx
// apps/admin/src/features/order-management/components/OrderDetail.tsx
"use client";

import { formatPaiseAsInr } from "@woobe/utils";
import { Badge, Card } from "@woobe/ui";
import { useAdminOrder } from "../hooks/useAdminOrder";
import { OrderStatusActions } from "./OrderStatusActions";
import { OrderTimeline } from "./OrderTimeline";

export function OrderDetail({ orderId }: { orderId: string }) {
  const { order, loading, startProcessing, ship, deliver, cancel, lastRefundIssued } = useAdminOrder(orderId);

  if (loading) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Loading…</p>;
  }
  if (!order) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Order not found.</p>;
  }

  return (
    <div className="grid gap-6 md:grid-cols-[2fr_1fr]">
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="font-display text-xl text-text-primary">{order.orderNumber}</h1>
          <Badge variant="neutral">{order.status.replace(/_/g, " ").toLowerCase()}</Badge>
        </div>

        <Card className="p-4">
          <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Items</h2>
          <div className="flex flex-col gap-2">
            {order.items.map((item) => (
              <div key={item.id} className="flex justify-between font-body text-sm">
                <span className="text-text-primary">
                  {item.productNameSnapshot} · {item.color} · {item.size} × {item.quantity}
                </span>
                <span className="text-text-primary">{formatPaiseAsInr(item.lineTotalPaise)}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-col gap-1 border-t border-border pt-3 font-body text-sm">
            <div className="flex justify-between text-text-secondary">
              <span>Subtotal</span>
              <span>{formatPaiseAsInr(order.subtotalPaise)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Shipping</span>
              <span>{formatPaiseAsInr(order.shippingFeePaise)}</span>
            </div>
            <div className="flex justify-between text-text-secondary">
              <span>Tax</span>
              <span>{formatPaiseAsInr(order.taxPaise)}</span>
            </div>
            <div className="flex justify-between font-medium text-text-primary">
              <span>Total</span>
              <span>{formatPaiseAsInr(order.totalPaise)}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Contact & shipping</h2>
          <dl className="flex flex-col gap-1 font-body text-sm">
            <div className="flex justify-between"><dt className="text-text-secondary">Name</dt><dd className="text-text-primary">{order.contactName}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Phone</dt><dd className="text-text-primary">{order.contactPhone}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Email</dt><dd className="text-text-primary">{order.contactEmail}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Address</dt><dd className="text-right text-text-primary">{order.shippingSnapshot.line1}, {order.shippingSnapshot.city}, {order.shippingSnapshot.state} {order.shippingSnapshot.pincode}</dd></div>
            <div className="flex justify-between"><dt className="text-text-secondary">Payment method</dt><dd className="text-text-primary">{order.paymentMethod === "COD" ? "Cash on delivery" : "Razorpay"}</dd></div>
          </dl>
        </Card>

        <OrderStatusActions
          order={order}
          onStartProcessing={startProcessing}
          onShip={ship}
          onDeliver={deliver}
          onCancel={cancel}
          lastRefundIssued={lastRefundIssued}
        />
      </div>

      <Card className="h-fit p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Timeline</h2>
        <OrderTimeline order={order} />
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: Page**

```tsx
// apps/admin/app/(dashboard)/orders/[id]/page.tsx
import { OrderDetail } from "@/features/order-management/components/OrderDetail";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <OrderDetail orderId={id} />;
}
```

- [ ] **Step 6: Typecheck and build**

Run: `pnpm --filter @woobe/admin run typecheck && pnpm --filter @woobe/admin run build`

Expected: both succeed.

- [ ] **Step 7: Full end-to-end manual verification (chrome-devtools-mcp)**

With `apps/api` and `apps/admin` dev servers running against the seeded dev DB (Tasks 1–14's migration/seed applied):

1. Place one Razorpay-paid order and one COD order to `CONFIRMED` via the storefront (`apps/web`) first — the admin app has nothing to manage without real orders.
2. Log in to `apps/admin` as `orders@woobe.in` (order-processing staff). Confirm: Orders list shows both orders; every other sidebar entry is greyed out with "Soon".
3. Open the COD order. Walk it through `Mark as processing` → `Mark as shipped` (enter a tracking number + carrier) → `Mark as delivered`. Confirm the timeline updates at each step and the status badge matches.
4. Open the Razorpay order. Click `Cancel order` with a reason. Confirm: order shows `CANCELLED`, and — since this environment's Razorpay keys are still stubs (`DECISIONS_PENDING.md` #4) — the "refund needs manual follow-up" message appears (this is the honest, expected outcome, not a bug; it's exercising `IssueRefundForCancelledOrderUseCase`'s gateway-error branch for real).
5. Log out, log in as `catalog@woobe.in` (product-management staff). Confirm: Orders is greyed out in the sidebar, and navigating directly to `/orders` in the URL bar still shows real data ONLY if the page doesn't itself 403 gracefully — if it renders an error/empty state from the API's 403 rather than a raw crash, that's correct; note the exact behavior either way, since this is the RBAC boundary made visible in the browser, not just asserted in a test.
6. Log out, log in as `admin@woobe.in` (super admin). Confirm: same full access as order-processing staff (SUPER_ADMIN carries `MANAGE_ORDERS` too).

- [ ] **Step 8: Final full-workspace verification**

Run: `pnpm --filter @woobe/api run test && pnpm --filter @woobe/api run lint && pnpm --filter @woobe/api run typecheck && pnpm --filter @woobe/api run boundaries:check && pnpm --filter @woobe/admin run lint && pnpm --filter @woobe/admin run typecheck && pnpm --filter @woobe/admin run build`

Expected: everything green — this is the plan's Definition of Done, matching architecture.md §5's own checklist (zero TS errors, zero boundary violations, tests pass, lint clean, builds clean).

- [ ] **Step 9: Commit**

```bash
git add apps/admin/src/features/shell/nav-config.ts apps/admin/src/features/order-management/components/OrderTimeline.tsx apps/admin/src/features/order-management/components/OrderStatusActions.tsx apps/admin/src/features/order-management/components/OrderDetail.tsx "apps/admin/app/(dashboard)/orders/[id]"
git commit -m "feat(admin): order detail page with status actions, timeline, and refund-failure messaging"
```

---

## PR Description Checklist (from the spec, §7 — copy into the actual PR body)

1. Tracking info lives on `Order`, not a `Shipment` entity — deliberate simplification for single-package fulfillment, forecloses split-shipment without a later migration.
2. `refunds`/`payments` split ownership of `Payment` writes by transition type (capture-lifecycle vs. refund-lifecycle) via `markPaymentRefundedUseCase` — not a blanket exception to the "one module per table" rule.
3. This pulls forward only the admin-cancellation refund path. The full customer-initiated return/exchange request flow (`Return` entity, `RETURN_REQUESTED → RETURN_APPROVED`, its own UI) is **not** built by this change and stays Week 4 scope.
4. The customer `refresh_token` cookie is `sameSite: "lax"` (confirmed against the actual code, not assumed) — the new `admin_refresh_token` is deliberately stricter (`"strict"`), not matched to it.
5. `AdminAuditLog` did not previously exist anywhere in the schema — this change adds it from scratch, it is not "already there and just unused."
