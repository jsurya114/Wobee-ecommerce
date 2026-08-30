import type { ProductListQuery, ProductSuggestionQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { GetProductBySlugUseCase } from "../../application/use-cases/get-product-by-slug.use-case";
import type { ListProductsUseCase } from "../../application/use-cases/list-products.use-case";
import type { SearchProductSuggestionsUseCase } from "../../application/use-cases/search-product-suggestions.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class ProductsController {
  constructor(
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly getProductBySlugUseCase: GetProductBySlugUseCase,
    private readonly searchProductSuggestionsUseCase: SearchProductSuggestionsUseCase,
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
      inStockOnly: query.inStock,
      minPricePaise: query.minPrice,
      maxPricePaise: query.maxPrice,
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
}
