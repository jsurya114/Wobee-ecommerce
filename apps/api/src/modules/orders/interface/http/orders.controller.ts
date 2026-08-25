import type { CheckoutInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { CART_ID_COOKIE, clearCartIdCookie } from "../../../cart/interface/http/cart-cookie";
import type { CheckoutUseCase } from "../../application/use-cases/checkout.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class OrdersController {
  constructor(private readonly checkoutUseCase: CheckoutUseCase) {}

  async checkout(req: Request, res: Response): Promise<void> {
    const input = req.body as CheckoutInput;
    // optionalAuthGuard (mounted before this handler) sets req.user only when
    // logged in — checkout is guest-or-logged-in either way (Day 4 spec).
    // The guest cart_id cookie is scoped to /api/v1/cart, so it's read
    // directly here rather than reaching into cart's interface layer.
    const guestCartId = req.signedCookies[CART_ID_COOKIE] as string | undefined;

    const order = await this.checkoutUseCase.execute({
      userId: req.user?.id,
      guestCartId,
      contactEmail: input.contactEmail,
      address: input.address,
      paymentMethod: input.paymentMethod,
    });

    // The just-converted cart is no longer ACTIVE, so a stale cart_id cookie
    // would just cause the next resolve to silently create a fresh one
    // anyway — clearing it here (guests only) avoids carrying it around pointlessly.
    if (guestCartId) {
      clearCartIdCookie(res);
    }

    res.status(201).json(order);
  }
}
