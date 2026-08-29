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
// Deliberate scope call, flagged prominently: no admin coupon-management
// endpoints this week — unlike every other Week 2 module (reviews,
// collections, media), week2 (1).md §9 has no "Admin:" subsection at all,
// the one structural signal in the plan that this is intentional, not an
// oversight. Coupons are created via `packages/database`'s seed script for
// now; the full customer-facing validate -> apply -> checkout-redeem
// pipeline below is real, tested, and fully wired regardless.
import { Router } from "express";
import { PreviewCouponUseCase } from "./application/use-cases/preview-coupon.use-case";
import { RedeemCouponUseCase } from "./application/use-cases/redeem-coupon.use-case";
import { CouponRepository } from "./infrastructure/repositories/coupon.repository";

const couponRepository = new CouponRepository();

/** Exported for `cart`'s ApplyCouponUseCase and GetCartUseCase (Week 2 Day 5). */
export const previewCouponUseCase = new PreviewCouponUseCase(couponRepository);
/** Exported for `orders`' CheckoutUseCase — called inside its own Unit-of-Work transaction. */
export const redeemCouponUseCase = new RedeemCouponUseCase(couponRepository);

export const router = Router();
