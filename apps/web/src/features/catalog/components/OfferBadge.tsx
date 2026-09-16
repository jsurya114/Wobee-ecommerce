import { formatOfferBadgeLabel } from "../lib/format-offer-badge";

/**
 * The compact "20% OFF" / "₹300 OFF" pill shown next to a price whenever an
 * automatic Offer applies — shared by ProductCard (PLP/rails), PDP
 * (ProductPurchasePanel), and the cart line item (offer-filtering pass,
 * 2026-09-15; previously duplicated per call site). Passed into `PriceTag`'s
 * own `discountBadge` slot, never rendered standalone, so it always shares
 * that primitive's row/wrap behavior.
 *
 * `whitespace-nowrap` is load-bearing: this pill sits inside PLP cards as
 * narrow as ~110px (3-column mobile grid) — without it, a two-word label
 * like "₹300 OFF" could break mid-pill instead of the pill itself simply
 * wrapping to the next line as one atomic unit (PriceTag's row is
 * `flex-wrap`).
 */
export function OfferBadge({ offer }: { offer: { discountType: "PERCENTAGE" | "FIXED_AMOUNT"; discountValue: number } }) {
  return (
    <span className="whitespace-nowrap rounded-pill bg-primary px-1.5 py-0.5 font-body text-[10px] font-semibold leading-none text-white">
      {formatOfferBadgeLabel(offer)}
    </span>
  );
}
