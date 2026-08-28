import { Badge } from "@woobe/ui";
import { ReviewsSection } from "@/features/reviews/components/ReviewsSection";
import { WishlistButton } from "@/features/wishlist/components/WishlistButton";
import type { ProductDetail as ProductDetailData } from "../api/products.client";
import { ProductPurchasePanel } from "./ProductPurchasePanel";

export function ProductDetail({ product }: { product: ProductDetailData }) {
  const primaryImage = product.images[0];

  return (
    <div>
      <div className="grid gap-8 md:grid-cols-2 md:gap-12">
        <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-primary-tint/40">
          {primaryImage ? (
            <img src={primaryImage.url} alt={primaryImage.altText} className="h-full w-full object-cover" />
          ) : null}
          <WishlistButton productId={product.id} className="absolute right-3 top-3" />
        </div>

        <div className="flex flex-col gap-6">
          <div>
            <Badge variant="outline" className="mb-3">
              {product.category.name}
            </Badge>
            <h1 className="font-display text-3xl leading-tight text-text-primary">{product.name}</h1>
            {product.description ? <p className="mt-3 font-body text-sm text-text-secondary">{product.description}</p> : null}
          </div>

          <ProductPurchasePanel product={product} />
        </div>
      </div>

      <ReviewsSection productId={product.id} />
    </div>
  );
}
