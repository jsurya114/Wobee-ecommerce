import type { AddCartItemInput, ApplyCouponInput, ChangeCartItemVariantInput, UpdateCartItemInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { UnauthorizedError, ValidationError } from "../../../../shared/errors";
import type { AddItemUseCase } from "../../application/use-cases/add-item.use-case";
import type { ApplyCouponUseCase } from "../../application/use-cases/apply-coupon.use-case";
import type { ChangeItemVariantUseCase } from "../../application/use-cases/change-item-variant.use-case";
import type { GetCartUseCase } from "../../application/use-cases/get-cart.use-case";
import type { GetOrCreateCartUseCase } from "../../application/use-cases/get-or-create-cart.use-case";
import type { MergeGuestCartUseCase } from "../../application/use-cases/merge-guest-cart.use-case";
import type { RemoveCouponUseCase } from "../../application/use-cases/remove-coupon.use-case";
import type { RemoveItemUseCase } from "../../application/use-cases/remove-item.use-case";
import type { UpdateItemQuantityUseCase } from "../../application/use-cases/update-item-quantity.use-case";
import { CART_ID_COOKIE, clearCartIdCookie, setCartIdCookie } from "./cart-cookie";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class CartController {
  constructor(
    private readonly getOrCreateCartUseCase: GetOrCreateCartUseCase,
    private readonly getCartUseCase: GetCartUseCase,
    private readonly addItemUseCase: AddItemUseCase,
    private readonly updateItemQuantityUseCase: UpdateItemQuantityUseCase,
    private readonly changeItemVariantUseCase: ChangeItemVariantUseCase,
    private readonly removeItemUseCase: RemoveItemUseCase,
    private readonly mergeGuestCartUseCase: MergeGuestCartUseCase,
    private readonly applyCouponUseCase: ApplyCouponUseCase,
    private readonly removeCouponUseCase: RemoveCouponUseCase,
  ) {}

  async getCart(req: Request, res: Response): Promise<void> {
    const cartId = await this.resolveCartId(req, res);
    const cart = await this.getCartUseCase.execute(cartId, req.user?.id);
    res.status(200).json(cart);
  }

  async addItem(req: Request, res: Response): Promise<void> {
    const cartId = await this.resolveCartId(req, res);
    const input = req.body as AddCartItemInput;
    await this.addItemUseCase.execute({ cartId, variantId: input.variantId, quantity: input.quantity });
    const cart = await this.getCartUseCase.execute(cartId, req.user?.id);
    res.status(200).json(cart);
  }

  async updateItem(req: Request, res: Response): Promise<void> {
    const cartId = await this.resolveCartId(req, res);
    const itemId = req.params.itemId;
    if (!itemId || typeof itemId !== "string") {
      throw new ValidationError("Cart item id is required");
    }
    const input = req.body as UpdateCartItemInput;
    await this.updateItemQuantityUseCase.execute({ cartId, itemId, quantity: input.quantity });
    const cart = await this.getCartUseCase.execute(cartId, req.user?.id);
    res.status(200).json(cart);
  }

  async changeItemVariant(req: Request, res: Response): Promise<void> {
    const cartId = await this.resolveCartId(req, res);
    const itemId = req.params.itemId;
    if (!itemId || typeof itemId !== "string") {
      throw new ValidationError("Cart item id is required");
    }
    const input = req.body as ChangeCartItemVariantInput;
    await this.changeItemVariantUseCase.execute({ cartId, itemId, variantId: input.variantId });
    const cart = await this.getCartUseCase.execute(cartId, req.user?.id);
    res.status(200).json(cart);
  }

  async removeItem(req: Request, res: Response): Promise<void> {
    const cartId = await this.resolveCartId(req, res);
    const itemId = req.params.itemId;
    if (!itemId || typeof itemId !== "string") {
      throw new ValidationError("Cart item id is required");
    }
    await this.removeItemUseCase.execute({ cartId, itemId });
    const cart = await this.getCartUseCase.execute(cartId, req.user?.id);
    res.status(200).json(cart);
  }

  async merge(req: Request, res: Response): Promise<void> {
    // authGuard (mounted before this handler in cart.routes.ts) guarantees req.user.
    const guestCartId = req.signedCookies[CART_ID_COOKIE] as string | undefined;
    const { cartId } = await this.mergeGuestCartUseCase.execute({ userId: req.user!.id, guestCartId });
    clearCartIdCookie(res);
    const cart = await this.getCartUseCase.execute(cartId, req.user!.id);
    res.status(200).json(cart);
  }

  /** authGuard-mounted (cart.routes.ts) — coupons require a real account, see Cart.couponCode's own schema comment. */
  async applyCoupon(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError("Log in to use a coupon");
    const cartId = await this.resolveCartId(req, res);
    const input = req.body as ApplyCouponInput;
    await this.applyCouponUseCase.execute(cartId, req.user.id, input.code);
    const cart = await this.getCartUseCase.execute(cartId, req.user.id);
    res.status(200).json(cart);
  }

  async removeCoupon(req: Request, res: Response): Promise<void> {
    if (!req.user) throw new UnauthorizedError("Log in to use a coupon");
    const cartId = await this.resolveCartId(req, res);
    await this.removeCouponUseCase.execute(cartId);
    const cart = await this.getCartUseCase.execute(cartId, req.user.id);
    res.status(200).json(cart);
  }

  /** Shared by every cart route: resolve (or create) the caller's cart, refreshing the guest cookie only when there's no logged-in user. */
  private async resolveCartId(req: Request, res: Response): Promise<string> {
    const guestCartId = req.signedCookies[CART_ID_COOKIE] as string | undefined;
    const { cartId, isGuest } = await this.getOrCreateCartUseCase.execute({ userId: req.user?.id, guestCartId });
    if (isGuest) {
      setCartIdCookie(res, cartId);
    }
    return cartId;
  }
}
