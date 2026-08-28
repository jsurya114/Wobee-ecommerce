export interface CouponPreviewLine {
  variantId: string;
  productId: string;
  categoryId: string;
  lineTotalPaise: number;
}

export interface CouponPreviewInput {
  code: string;
  userId: string;
  cartSubtotalPaise: number;
  lines: CouponPreviewLine[];
}

export interface CouponPreviewOutput {
  ok: boolean;
  reason?: string;
  discountPaise: number;
}

/** Narrow port for this module's one dependency on `coupons` (week2 (1).md §9) — wired in cart.module.ts to a one-line pass-through, same pattern every other cross-module port in this codebase uses. */
export interface CouponPreviewPort {
  preview(input: CouponPreviewInput): Promise<CouponPreviewOutput>;
}
