import { UnprocessableEntityError } from "../../../../shared/errors";
import type { CartRepositoryPort } from "../ports/cart-repository.port";
import type { CouponPreviewPort } from "../ports/coupon-preview.port";
import { GetCartUseCase } from "./get-cart.use-case";

/**
 * week2 (1).md §9's "Validate coupon" step, triggered by the cart page's
 * own "Apply coupon" action. Reuses GetCartUseCase to get the current live
 * cart contents (any previously-applied code's own validity doesn't matter
 * here — it's about to be overwritten either way) rather than re-deriving
 * weight/price/stock a second time. Only stores the code on the cart row
 * if it actually validates — an invalid code is never silently saved
 * (Cart.couponCode would otherwise show something the customer was just
 * told didn't work).
 */
export class ApplyCouponUseCase {
  constructor(
    private readonly cartRepository: CartRepositoryPort,
    private readonly getCartUseCase: GetCartUseCase,
    private readonly couponPreview: CouponPreviewPort,
  ) {}

  async execute(cartId: string, userId: string, code: string): Promise<void> {
    const cart = await this.getCartUseCase.execute(cartId, userId);
    if (cart.items.length === 0) {
      throw new UnprocessableEntityError("Your bag is empty");
    }

    const preview = await this.couponPreview.preview({
      code,
      userId,
      cartSubtotalPaise: cart.totalPaise,
      lines: cart.items.map((line) => ({ variantId: line.variantId, productId: line.productId, categoryId: line.categoryId, lineTotalPaise: line.subtotalPaise })),
    });

    if (!preview.ok) {
      throw new UnprocessableEntityError(preview.reason ?? "This coupon can't be applied");
    }

    await this.cartRepository.setCouponCode(cartId, code);
  }
}
