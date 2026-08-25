import type { ProductListQuery } from "@woobe/validation";
import type { Request, Response } from "express";
import { ValidationError } from "../../../../shared/errors";
import type { GetProductBySlugUseCase } from "../../application/use-cases/get-product-by-slug.use-case";
import type { ListProductsUseCase } from "../../application/use-cases/list-products.use-case";

/** Controllers stay thin — parse request, call use-case, map result to response. */
export class ProductsController {
  constructor(
    private readonly listProductsUseCase: ListProductsUseCase,
    private readonly getProductBySlugUseCase: GetProductBySlugUseCase,
  ) {}

  async list(req: Request, res: Response): Promise<void> {
    const query = req.query as unknown as ProductListQuery;
    const result = await this.listProductsUseCase.execute({
      categorySlug: query.category,
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
