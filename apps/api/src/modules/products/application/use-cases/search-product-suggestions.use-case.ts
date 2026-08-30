import type { ProductSuggestionEntity } from "../../domain/entities/product.entity";
import type { ProductRepositoryPort } from "../ports/product-repository.port";

/** Below this many characters a query is too noisy to suggest against — return nothing rather than the whole catalogue. Mirrored client-side. */
export const MIN_SUGGESTION_QUERY_LENGTH = 2;
/** Hard cap on suggestion rows — a typeahead list, not a results page. */
export const MAX_SUGGESTIONS = 6;

/**
 * Typeahead for the search box (redesign). A separate responsibility from
 * `ListProductsUseCase` (SRP): no facets, no pagination, no pricing
 * projection, a small fixed cap — just enough to render a suggestion row and
 * let the shopper jump straight to a product. Submitting the search still
 * goes to the full `/products?q=` listing, unchanged.
 */
export class SearchProductSuggestionsUseCase {
  constructor(private readonly productRepository: ProductRepositoryPort) {}

  async execute(query: string): Promise<ProductSuggestionEntity[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SUGGESTION_QUERY_LENGTH) return [];
    return this.productRepository.searchSuggestions(trimmed, MAX_SUGGESTIONS);
  }
}
