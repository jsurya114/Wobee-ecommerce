import type { ProductDetail as ProductDetailData } from "../api/products.client";
import { ProductPurchasePanel } from "./ProductPurchasePanel";

export function ProductDetail({ product }: { product: ProductDetailData }) {
  const primaryImage = product.images[0];

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="aspect-[4/5] overflow-hidden rounded-card bg-surface">
        {primaryImage ? <img src={primaryImage.url} alt={primaryImage.altText} className="h-full w-full object-cover" /> : null}
      </div>

      <div className="flex flex-col gap-6">
        <div>
          <p className="font-body text-sm text-text-secondary">{product.category.name}</p>
          <h1 className="font-display text-2xl text-text-primary">{product.name}</h1>
          {product.description ? <p className="mt-2 font-body text-sm text-text-secondary">{product.description}</p> : null}
        </div>

        <ProductPurchasePanel product={product} />
      </div>
    </div>
  );
}
