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
import { recordAuditLogUseCase } from "../audit/audit.module";
import {
  cancelOrderUseCase,
  deliverOrderUseCase,
  getOrderForAdminUseCase,
  listOrdersUseCase,
  shipOrderUseCase,
  startProcessingOrderUseCase,
} from "../orders/orders.module";
import { issueRefundForCancelledOrderUseCase } from "../refunds/refunds.module";
import { CancelOrderWithRefundUseCase } from "./application/use-cases/cancel-order-with-refund.use-case";
import { AdminAuthController } from "./interface/http/admin-auth.controller";
import { createAdminAuthRouter } from "./interface/http/admin-auth.routes";
import { AdminOrdersController } from "./interface/http/admin-orders.controller";
import { createAdminOrdersRouter } from "./interface/http/admin-orders.routes";

// Cancellation is the one admin action that spans three modules (orders +
// refunds + audit). `orders` can't compose it itself without recreating the
// orders -> refunds -> payments -> orders cycle, so it's composed here —
// see CancelOrderWithRefundUseCase's own doc comment.
const cancelOrderWithRefundUseCase = new CancelOrderWithRefundUseCase(
  cancelOrderUseCase,
  issueRefundForCancelledOrderUseCase,
  recordAuditLogUseCase,
);

const adminAuthController = new AdminAuthController(loginUserUseCase, refreshTokenUseCase, logoutUserUseCase, getCurrentUserUseCase);
const adminOrdersController = new AdminOrdersController(
  listOrdersUseCase,
  getOrderForAdminUseCase,
  startProcessingOrderUseCase,
  shipOrderUseCase,
  deliverOrderUseCase,
  cancelOrderWithRefundUseCase,
);

export const router = Router();
router.use("/auth", createAdminAuthRouter(adminAuthController));
router.use("/orders", createAdminOrdersRouter(adminOrdersController));
