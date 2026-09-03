// Composition root for the coupons module (ARCHITECTURE.md §3.2). Owns
// (ADR-010): Coupon, CouponProduct, CouponCategory, CouponRedemption.
//
// Week 2 Day 5 build-out of the Week 1 placeholder (was a bare `Router()`,
// no routes). No HTTP surface of its own — this module is a leaf, like
// `pricing`: `cart` calls previewCouponUseCase for "Apply coupon" and the
// cart page's live redisplay, `orders` calls redeemCouponUseCase inside its
// own checkout transaction. Both exported for cross-module use, same
// pattern every other module's composition root uses.
//
// 2026-09-03 (client-review): admin coupon management added — the
// module-level comment above used to note this was deliberately deferred
// (coupons were only ever creatable via the seed script); that gap is
// closed below the same way categories/banners/collections expose their
// own admin use-cases for `admin`'s thin HTTP gateway to wire up
// (ADR-025) — no HTTP surface added here, just more exports. The
// customer-facing validate -> apply -> checkout-redeem pipeline is
// completely untouched.
import { Router } from "express";
import { PreviewCouponUseCase } from "./application/use-cases/preview-coupon.use-case";
import { RedeemCouponUseCase } from "./application/use-cases/redeem-coupon.use-case";
import { CreateCouponUseCase } from "./application/use-cases/admin/create-coupon.use-case";
import { DeleteCouponUseCase } from "./application/use-cases/admin/delete-coupon.use-case";
import { GetCouponAdminUseCase } from "./application/use-cases/admin/get-coupon-admin.use-case";
import { ListCouponsAdminUseCase } from "./application/use-cases/admin/list-coupons-admin.use-case";
import { SetCouponActiveUseCase } from "./application/use-cases/admin/set-coupon-active.use-case";
import { UpdateCouponUseCase } from "./application/use-cases/admin/update-coupon.use-case";
import { CouponRepository } from "./infrastructure/repositories/coupon.repository";

const couponRepository = new CouponRepository();

/** Exported for `cart`'s ApplyCouponUseCase and GetCartUseCase (Week 2 Day 5). */
export const previewCouponUseCase = new PreviewCouponUseCase(couponRepository);
/** Exported for `orders`' CheckoutUseCase — called inside its own Unit-of-Work transaction. */
export const redeemCouponUseCase = new RedeemCouponUseCase(couponRepository);

// Exported for the admin module's thin HTTP gateway (ADR-025).
export const listCouponsAdminUseCase = new ListCouponsAdminUseCase(couponRepository);
export const getCouponAdminUseCase = new GetCouponAdminUseCase(couponRepository);
export const createCouponUseCase = new CreateCouponUseCase(couponRepository);
export const updateCouponUseCase = new UpdateCouponUseCase(couponRepository);
export const setCouponActiveUseCase = new SetCouponActiveUseCase(couponRepository);
export const deleteCouponUseCase = new DeleteCouponUseCase(couponRepository);

export const router = Router();
