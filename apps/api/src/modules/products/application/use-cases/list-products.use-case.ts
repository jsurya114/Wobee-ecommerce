import { NotFoundError } from "../../../../shared/errors";
import type { ProductSummaryEntity } from "../../domain/entities/product.entity";
import type { CategoryReaderPort } from "../ports/category-reader.port";
import type { ProductRepositoryPort } from "../ports/product-repository.port";

export interface ListProductsInput {
  categorySlug?: string;
  page: number;
  limit: number;
}

export interface ListProductsResult {
  products: ProductSummaryEntity[];
  page: number;
  limit: number;
  total: number;
}

export class ListProductsUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly categoryReader: CategoryReaderPort,
  ) {}

  async execute(input: ListProductsInput): Promise<ListProductsResult> {
    let categoryId: string | undefined;
    if (input.categorySlug) {
      const resolved = await this.categoryReader.findIdBySlug(input.categorySlug);
      if (!resolved) {
        throw new NotFoundError(`Unknown category: ${input.categorySlug}`);
      }
      categoryId = resolved;
    }

    const { products, total } = await this.productRepository.findMany({
      categoryId,
      page: input.page,
      limit: input.limit,
    });

    return { products, page: input.page, limit: input.limit, total };
  }
}
