import type { CheckoutInput, ClaimGuestOrderInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import { CART_ID_COOKIE, clearCartIdCookie } from "../../../cart/interface/http/cart-cookie";
import type { CheckoutUseCase } from "../../application/use-cases/checkout.use-case";
import type { ClaimGuestOrderUseCase } from "../../application/use-cases/claim-guest-order.use-case";
import type { GetOrderUseCase } from "../../application/use-cases/get-order.use-case";
import type { ListMyOrdersUseCase } from "../../application/use-cases/list-my-orders.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class OrdersController {
  constructor(
    private readonly checkoutUseCase: CheckoutUseCase,
    private readonly getOrderUseCase: GetOrderUseCase,
    private readonly listMyOrdersUseCase: ListMyOrdersUseCase,
    private readonly claimGuestOrderUseCase: ClaimGuestOrderUseCase,
  ) {}

  async checkout(req: Request, res: Response): Promise<void> {
    const input = req.body as CheckoutInput;
    // optionalAuthGuard (mounted before this handler) sets req.user only when
    // logged in — checkout is guest-or-logged-in either way (Day 4 spec).
    // The guest cart_id cookie is scoped to /api/v1, so it's read directly
    // here rather than reaching into cart's interface layer.
    const guestCartId = req.signedCookies[CART_ID_COOKIE] as string | undefined;

    const order = await this.checkoutUseCase.execute({
      userId: req.user?.id,
      guestCartId,
      contactEmail: input.contactEmail,
      confirmEmail: input.confirmEmail,
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

  async getOrder(req: Request, res: Response): Promise<void> {
    const orderId = req.params.id;
    if (!orderId || typeof orderId !== "string") {
      throw new ValidationError("Order id is required");
    }
    const order = await this.getOrderUseCase.execute(orderId, req.user?.id);
    res.status(200).json(order);
  }

  async listMyOrders(req: Request, res: Response): Promise<void> {
    // authGuard (mounted before this handler) guarantees req.user.
    const orders = await this.listMyOrdersUseCase.execute(req.user!.id);
    res.status(200).json({ orders });
  }

  /** Client-review fix (2026-09-03) — "Add a guest order" (authGuard-only: attaches to the caller's own account, req.user!.id). */
  async claimGuestOrder(req: Request, res: Response): Promise<void> {
    const input = req.body as ClaimGuestOrderInput;
    const order = await this.claimGuestOrderUseCase.execute({
      userId: req.user!.id,
      orderNumber: input.orderNumber,
      contactEmail: input.contactEmail,
    });
    res.status(200).json(order);
  }
}
