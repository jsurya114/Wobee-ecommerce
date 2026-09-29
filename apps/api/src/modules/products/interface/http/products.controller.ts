import type { ProductListQuery, ProductSuggestionQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { GetProductBySlugUseCase } from "../../application/use-cases/get-product-by-slug.use-case";
import type { GetRelatedProductsUseCase } from "../../application/use-cases/get-related-products.use-case";
import type { ListProductsUseCase } from "../../application/use-cases/list-products.use-case";
import type { SearchProductSuggestionsUseCase } from "../../application/use-cases/search-product-suggestions.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class ProductsController {
  constructor(
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly getProductBySlugUseCase: GetProductBySlugUseCase,
    private readonly searchProductSuggestionsUseCase: SearchProductSuggestionsUseCase,
    private readonly getRelatedProductsUseCase: GetRelatedProductsUseCase,
  ) {}

  async suggestions(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ProductSuggestionQuery;
    const suggestions = await this.searchProductSuggestionsUseCase.execute(query.q);
    res.status(200).json({ suggestions });
  }

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ProductListQuery;
    const result = await this.listProductsUseCase.execute({
      categorySlug: query.category,
      collectionSlug: query.collection,
      q: query.q,
      sizes: query.size,
      colors: query.color,
      // The storefront never lists sold-out products (2026-09-30): a product
      // appears only while at least one active variant has live stock, same
      // rule the `inStock` filter always applied. The PDP (getBySlug) and the
      // wishlist still show a sold-out product. `query.inStock` is still
      // accepted — it's simply always satisfied now.
      inStockOnly: true,
      minPricePaise: query.minPrice,
      maxPricePaise: query.maxPrice,
      onOffer: query.onOffer,
      offerId: query.offerId,
      pricingMode: query.pricingMode,
      sort: query.sort,
      page: query.page,
      limit: query.limit,
    });
    res.status(200).json(result);
  }

  async getBySlug(req: Request, res: Response): Promise<void> {
    const slug = req.params.slug;
    if (!slug || typeof slug !== "string") {
      throw new ValidationError("Product slug is required");
    }
    const product = await this.getProductBySlugUseCase.execute(slug);
    res.status(200).json({ product });
  }

  async related(req: Request, res: Response): Promise<void> {
    const slug = req.params.slug;
    if (!slug || typeof slug !== "string") {
      throw new ValidationError("Product slug is required");
    }
    const products = await this.getRelatedProductsUseCase.execute(slug);
    res.status(200).json({ products });
  }
}
