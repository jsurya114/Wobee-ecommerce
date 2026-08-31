import { Badge } from "@woobe/ui";
import { ReviewsSection } from "@/features/reviews/components/ReviewsSection";
import type { ProductDetail as ProductDetailData, ProductSummary } from "../api/products.client";
import { SelectedVariantProvider } from "../hooks/useSelectedVariant";
import { ProductGallery } from "./ProductGallery";
import { ProductPurchasePanel } from "./ProductPurchasePanel";
import { RelatedProducts } from "./RelatedProducts";

/**
 * PDP (redesign spec §F) — a two-column layout: gallery (thumbnail strip +
 * swipeable main image) on the left, and the product hierarchy on the
 * right: category → name (the one place Playfair is used besides the
 * wordmark) → description → the purchase panel (price + weight·rate + "how
 * this price works" + variants + CTA + details + delivery). Reviews, then
 * "Related Products", follow below.
 */
export function ProductDetail({
  product,
  relatedProducts,
}: {
  product: ProductDetailData;
  relatedProducts: ProductSummary[];
}) {
  return (
    <div>
      <SelectedVariantProvider variants={product.variants}>
        <div className="grid gap-6 md:grid-cols-2 md:gap-10 lg:gap-12">
          <ProductGallery images={product.images} productId={product.id} productName={product.name} />

          <div className="flex flex-col gap-5">
            <div>
              <Badge variant="outline" className="mb-2.5">
                {product.category.name}
              </Badge>
              <h1 className="font-display text-2xl leading-tight text-text-primary lg:text-3xl">{product.name}</h1>
              {product.description ? (
                <p className="mt-2 font-body text-sm text-text-secondary">{product.description}</p>
              ) : null}
            </div>

            <ProductPurchasePanel product={product} />
          </div>
        </div>
      </SelectedVariantProvider>

      <ReviewsSection productId={product.id} />

      <RelatedProducts products={relatedProducts} />
    </div>
  );
}
