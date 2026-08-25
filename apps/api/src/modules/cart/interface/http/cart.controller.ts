import type { AddCartItemInput, UpdateCartItemInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { AddItemUseCase } from "../../application/use-cases/add-item.use-case";
import type { GetCartUseCase } from "../../application/use-cases/get-cart.use-case";
import type { GetOrCreateCartUseCase } from "../../application/use-cases/get-or-create-cart.use-case";
import type { MergeGuestCartUseCase } from "../../application/use-cases/merge-guest-cart.use-case";
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
    private readonly removeItemUseCase: RemoveItemUseCase,
    private readonly mergeGuestCartUseCase: MergeGuestCartUseCase,
  ) {}

  async getCart(req: Request, res: Response): Promise<void> {
    const cartId = await this.resolveCartId(req, res);
    const cart = await this.getCartUseCase.execute(cartId);
    res.status(200).json(cart);
  }

  async addItem(req: Request, res: Response): Promise<void> {
    const cartId = await this.resolveCartId(req, res);
    const input = req.body as AddCartItemInput;
    await this.addItemUseCase.execute({ cartId, variantId: input.variantId, quantity: input.quantity });
    const cart = await this.getCartUseCase.execute(cartId);
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
    const cart = await this.getCartUseCase.execute(cartId);
    res.status(200).json(cart);
  }

  async removeItem(req: Request, res: Response): Promise<void> {
    const cartId = await this.resolveCartId(req, res);
    const itemId = req.params.itemId;
    if (!itemId || typeof itemId !== "string") {
      throw new ValidationError("Cart item id is required");
    }
    await this.removeItemUseCase.execute({ cartId, itemId });
    const cart = await this.getCartUseCase.execute(cartId);
    res.status(200).json(cart);
  }

  async merge(req: Request, res: Response): Promise<void> {
    // authGuard (mounted before this handler in cart.routes.ts) guarantees req.user.
    const guestCartId = req.signedCookies[CART_ID_COOKIE] as string | undefined;
    const { cartId } = await this.mergeGuestCartUseCase.execute({ userId: req.user!.id, guestCartId });
    clearCartIdCookie(res);
    const cart = await this.getCartUseCase.execute(cartId);
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
