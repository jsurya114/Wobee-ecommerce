import type { Router } from "express";
import { router as adminRouter } from "./admin/admin.module";
import { router as authRouter } from "./auth/auth.module";
import { router as cartRouter } from "./cart/cart.module";
import { router as categoriesRouter } from "./categories/categories.module";
import { router as collectionsRouter } from "./collections/collections.module";
import { router as couponsRouter } from "./coupons/coupons.module";
import { router as inventoryRouter } from "./inventory/inventory.module";
import { router as notificationsRouter } from "./notifications/notifications.module";
import { router as ordersRouter } from "./orders/orders.module";
import { router as paymentsRouter } from "./payments/payments.module";
import { router as pricingRouter } from "./pricing/pricing.module";
import { router as productsRouter } from "./products/products.module";
import { router as refundsRouter } from "./refunds/refunds.module";
import { router as returnsRouter } from "./returns/returns.module";
import { router as reviewsRouter } from "./reviews/reviews.module";
import { router as shippingRouter } from "./shipping/shipping.module";
import { router as wishlistRouter } from "./wishlist/wishlist.module";

/**
 * Every module mounts here, at /api/v1/<path> (see app.ts). Add a new
 * module by creating <name>/<name>.module.ts (exporting `router`) and
 * registering it below — nowhere else needs to know about it.
 */
export const moduleRouters: { path: string; router: Router }[] = [
  { path: "/auth", router: authRouter },
  { path: "/products", router: productsRouter },
  { path: "/categories", router: categoriesRouter },
  { path: "/collections", router: collectionsRouter },
  { path: "/pricing", router: pricingRouter },
  { path: "/inventory", router: inventoryRouter },
  { path: "/cart", router: cartRouter },
  { path: "/wishlist", router: wishlistRouter },
  { path: "/coupons", router: couponsRouter },
  { path: "/orders", router: ordersRouter },
  { path: "/payments", router: paymentsRouter },
  { path: "/shipping", router: shippingRouter },
  { path: "/reviews", router: reviewsRouter },
  { path: "/returns", router: returnsRouter },
  { path: "/refunds", router: refundsRouter },
  { path: "/notifications", router: notificationsRouter },
  { path: "/admin", router: adminRouter },
];
