import type { AddWishlistItemInput, MoveWishlistItemToCartInput } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { AddWishlistItemUseCase } from "../../application/use-cases/add-wishlist-item.use-case";
import type { CheckWishlistStateUseCase } from "../../application/use-cases/check-wishlist-state.use-case";
import type { GetWishlistUseCase } from "../../application/use-cases/get-wishlist.use-case";
import type { MoveWishlistItemToCartUseCase } from "../../application/use-cases/move-wishlist-item-to-cart.use-case";
import type { RemoveWishlistItemUseCase } from "../../application/use-cases/remove-wishlist-item.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. Every method here is authGuard-mounted (wishlist.routes.ts) — req.user is guaranteed. */
export class WishlistController {
  constructor(
    private readonly getWishlistUseCase: GetWishlistUseCase,
    private readonly addWishlistItemUseCase: AddWishlistItemUseCase,
    private readonly removeWishlistItemUseCase: RemoveWishlistItemUseCase,
    private readonly checkWishlistStateUseCase: CheckWishlistStateUseCase,
    private readonly moveWishlistItemToCartUseCase: MoveWishlistItemToCartUseCase,
  ) {}

  async getWishlist(req: Request, res: Response): Promise<void> {
    const view = await this.getWishlistUseCase.execute(req.user!.id);
    res.status(200).json(view);
  }

  async addItem(req: Request, res: Response): Promise<void> {
    const input = req.body as AddWishlistItemInput;
    const item = await this.addWishlistItemUseCase.execute({
      userId: req.user!.id,
      productId: input.productId,
      variantId: input.variantId,
    });
    res.status(201).json({ item });
  }

  async removeItem(req: Request, res: Response): Promise<void> {
    await this.removeWishlistItemUseCase.execute(req.user!.id, requireItemId(req));
    res.status(204).send();
  }

  async checkState(req: Request, res: Response): Promise<void> {
    const productId = req.params.productId;
    if (!productId || typeof productId !== "string") {
      throw new ValidationError("Product id is required");
    }
    const result = await this.checkWishlistStateUseCase.execute(req.user!.id, productId);
    res.status(200).json(result);
  }

  async moveToCart(req: Request, res: Response): Promise<void> {
    const input = req.body as MoveWishlistItemToCartInput;
    const result = await this.moveWishlistItemToCartUseCase.execute({
      userId: req.user!.id,
      itemId: requireItemId(req),
      quantity: input.quantity,
    });
    res.status(200).json(result);
  }
}

function requireItemId(req: Request): string {
  const itemId = req.params.itemId;
  if (!itemId || typeof itemId !== "string") {
    throw new ValidationError("Wishlist item id is required");
  }
  return itemId;
}
