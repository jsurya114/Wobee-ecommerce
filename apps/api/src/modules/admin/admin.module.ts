// Composition root for the admin module (ARCHITECTURE.md §3.2). Thin
// permission-gated HTTP gateway ONLY — no business logic, no Prisma access
// of its own. Reuses auth's/orders'/collections'/products'/inventory's
// already-exported use-cases directly, same pattern every other module's
// composition root uses (ADR-025). Week 2 Day 7 (week2 (1).md §16-17) adds
// product/variant/media management and inventory adjustment — apps/admin's
// UI for collections (deferred here since Day 2, see collections.module.ts's
// own doc comment) lands alongside them, since both are part of the same
// "Admin Product Management" surface. Settings and staff management remain
// Week 2-4 scope (architecture.md §6) — see apps/admin's nav-config.ts.
import { Router } from "express";
import {
  getCurrentUserUseCase,
  getCustomerForAdminUseCase,
  listCustomersAdminUseCase,
  loginUserUseCase,
  logoutUserUseCase,
  refreshTokenUseCase,
  setCustomerActiveUseCase,
} from "../auth/auth.module";
import { recordAuditLogUseCase } from "../audit/audit.module";
import {
  createBannerUseCase,
  deleteBannerUseCase,
  getBannerAdminUseCase,
  listBannersAdminUseCase,
  reorderBannersUseCase,
  setBannerActiveUseCase,
  updateBannerUseCase,
} from "../banners/banners.module";
import {
  assignCollectionProductUseCase,
  createCollectionUseCase,
  getCollectionAdminUseCase,
  listCollectionsAdminUseCase,
  removeCollectionProductUseCase,
  reorderCollectionProductsUseCase,
  setCollectionActiveUseCase,
  updateCollectionUseCase,
} from "../collections/collections.module";
import { adjustInventoryUseCase, listInventoryAdminUseCase } from "../inventory/inventory.module";
import { enqueueNotificationUseCase } from "../notifications/notifications.module";
import {
  cancelOrderUseCase,
  deliverOrderUseCase,
  getOrderForAdminUseCase,
  listMyOrdersUseCase,
  listOrdersUseCase,
  shipOrderUseCase,
  startProcessingOrderUseCase,
} from "../orders/orders.module";
import {
  addProductImageUseCase,
  createProductUseCase,
  createProductVariantUseCase,
  getProductAdminUseCase,
  listProductsAdminUseCase,
  removeProductImageUseCase,
  reorderProductImagesUseCase,
  setProductActiveUseCase,
  setProductVariantActiveUseCase,
  updateProductUseCase,
  updateProductVariantUseCase,
} from "../products/products.module";
import { issueRefundForCancelledOrderUseCase } from "../refunds/refunds.module";
import {
  approveReturnUseCase,
  getReturnForAdminUseCase,
  issueRefundForApprovedReturnUseCase,
  listReturnsForAdminUseCase,
  markReturnRefundedUseCase,
  rejectReturnUseCase,
} from "../returns/returns.module";
import { listReviewsAdminUseCase, moderateReviewUseCase } from "../reviews/reviews.module";
import { listAddressesUseCase } from "../users/users.module";
import { GetCustomerDetailUseCase } from "./application/use-cases/get-customer-detail.use-case";
import { CancelOrderWithRefundUseCase } from "./application/use-cases/cancel-order-with-refund.use-case";
import { AdminAuthController } from "./interface/http/admin-auth.controller";
import { createAdminAuthRouter } from "./interface/http/admin-auth.routes";
import { AdminBannersController } from "./interface/http/admin-banners.controller";
import { createAdminBannersRouter } from "./interface/http/admin-banners.routes";
import { AdminCollectionsController } from "./interface/http/admin-collections.controller";
import { createAdminCollectionsRouter } from "./interface/http/admin-collections.routes";
import { AdminCustomersController } from "./interface/http/admin-customers.controller";
import { createAdminCustomersRouter } from "./interface/http/admin-customers.routes";
import { AdminInventoryController } from "./interface/http/admin-inventory.controller";
import { createAdminInventoryRouter } from "./interface/http/admin-inventory.routes";
import { AdminOrdersController } from "./interface/http/admin-orders.controller";
import { createAdminOrdersRouter } from "./interface/http/admin-orders.routes";
import { AdminProductsController } from "./interface/http/admin-products.controller";
import { createAdminProductsRouter } from "./interface/http/admin-products.routes";
import { AdminReturnsController } from "./interface/http/admin-returns.controller";
import { createAdminReturnsRouter } from "./interface/http/admin-returns.routes";
import { AdminReviewsController } from "./interface/http/admin-reviews.controller";
import { createAdminReviewsRouter } from "./interface/http/admin-reviews.routes";

// Cancellation is the one admin action that spans three modules (orders +
// refunds + audit). `orders` can't compose it itself without recreating the
// orders -> refunds -> payments -> orders cycle, so it's composed here —
// see CancelOrderWithRefundUseCase's own doc comment.
const cancelOrderWithRefundUseCase = new CancelOrderWithRefundUseCase(
  cancelOrderUseCase,
  issueRefundForCancelledOrderUseCase,
  recordAuditLogUseCase,
  enqueueNotificationUseCase,
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
const adminCollectionsController = new AdminCollectionsController(
  listCollectionsAdminUseCase,
  getCollectionAdminUseCase,
  createCollectionUseCase,
  updateCollectionUseCase,
  setCollectionActiveUseCase,
  assignCollectionProductUseCase,
  removeCollectionProductUseCase,
  reorderCollectionProductsUseCase,
);

const adminBannersController = new AdminBannersController(
  listBannersAdminUseCase,
  getBannerAdminUseCase,
  createBannerUseCase,
  updateBannerUseCase,
  setBannerActiveUseCase,
  deleteBannerUseCase,
  reorderBannersUseCase,
);

const adminReviewsController = new AdminReviewsController(listReviewsAdminUseCase, moderateReviewUseCase);
const adminReturnsController = new AdminReturnsController(
  listReturnsForAdminUseCase,
  getReturnForAdminUseCase,
  approveReturnUseCase,
  rejectReturnUseCase,
  issueRefundForApprovedReturnUseCase,
  markReturnRefundedUseCase,
);
const adminProductsController = new AdminProductsController(
  listProductsAdminUseCase,
  getProductAdminUseCase,
  createProductUseCase,
  updateProductUseCase,
  setProductActiveUseCase,
  createProductVariantUseCase,
  updateProductVariantUseCase,
  setProductVariantActiveUseCase,
  addProductImageUseCase,
  removeProductImageUseCase,
  reorderProductImagesUseCase,
);
const adminInventoryController = new AdminInventoryController(listInventoryAdminUseCase, adjustInventoryUseCase);

// Cross-module customer detail (week2 (1).md §19) — same "compose in admin,
// nothing imports it back" reasoning as CancelOrderWithRefundUseCase above,
// see GetCustomerDetailUseCase's own doc comment for why auth specifically
// can't compose this itself (users already imports auth).
const getCustomerDetailUseCase = new GetCustomerDetailUseCase(
  getCustomerForAdminUseCase,
  { listForUser: (userId) => listMyOrdersUseCase.execute(userId) },
  { listForUser: (userId) => listAddressesUseCase.execute(userId) },
);
const adminCustomersController = new AdminCustomersController(listCustomersAdminUseCase, getCustomerDetailUseCase, setCustomerActiveUseCase);

export const router = Router();
router.use("/auth", createAdminAuthRouter(adminAuthController));
router.use("/orders", createAdminOrdersRouter(adminOrdersController));
router.use("/collections", createAdminCollectionsRouter(adminCollectionsController));
router.use("/banners", createAdminBannersRouter(adminBannersController));
router.use("/reviews", createAdminReviewsRouter(adminReviewsController));
router.use("/returns", createAdminReturnsRouter(adminReturnsController));
router.use("/products", createAdminProductsRouter(adminProductsController));
router.use("/inventory", createAdminInventoryRouter(adminInventoryController));
router.use("/customers", createAdminCustomersRouter(adminCustomersController));
