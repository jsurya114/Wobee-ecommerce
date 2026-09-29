import type { ProductSuggestionEntity } from "../../domain/entities/product.entity";
import { parseSearchQuery, toMatchTerms } from "../../domain/parse-search-query";
import type { ProductRepositoryPort } from "../ports/product-repository.port";
import type { SearchVocabularyReaderPort } from "../ports/search-vocabulary-reader.port";

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
 *
 * Smart search (2026-09-29): the query is parsed into name words plus any
 * colour / size / fabric / fit it mentions; products matching all of them
 * come first, then looser matches fill the remaining slots. A query with
 * nothing searchable after parsing (only filler words) keeps the old plain
 * name match.
 */
export class SearchProductSuggestionsUseCase {
  constructor(
    private readonly productRepository: ProductRepositoryPort,
    private readonly searchVocabularyReader?: SearchVocabularyReaderPort,
  ) {}

  async execute(query: string): Promise<ProductSuggestionEntity[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_SUGGESTION_QUERY_LENGTH) return [];
    const extras = this.searchVocabularyReader ? await this.searchVocabularyReader.get() : undefined;
    const terms = toMatchTerms(parseSearchQuery(trimmed, extras));
    const searchable = terms.nameTerms.length + terms.colorTerms.length + terms.sizeValues.length + terms.fabricTerms.length + terms.fitTerms.length > 0;
    return this.productRepository.searchSuggestions(
      searchable ? terms : { nameTerms: [trimmed], colorTerms: [], sizeValues: [], fabricTerms: [], fitTerms: [] },
      MAX_SUGGESTIONS,
    );
  }
}
