import { describe, expect, it, vi } from "vitest";
import type { ProductRepositoryPort } from "../ports/product-repository.port";
import { MAX_SUGGESTIONS, MIN_SUGGESTION_QUERY_LENGTH, SearchProductSuggestionsUseCase } from "./search-product-suggestions.use-case";

function build(searchResult: unknown[] = []) {
  const productRepository = {
    searchSuggestions: vi.fn().mockResolvedValue(searchResult),
  } as unknown as ProductRepositoryPort;
  return { useCase: new SearchProductSuggestionsUseCase(productRepository), productRepository };
}

describe("SearchProductSuggestionsUseCase", () => {
  it(`returns [] without hitting the repository for a query shorter than ${MIN_SUGGESTION_QUERY_LENGTH} chars`, async () => {
    const { useCase, productRepository } = build();
    expect(await useCase.execute("a")).toEqual([]);
    expect(await useCase.execute("")).toEqual([]);
    expect(await useCase.execute("   ")).toEqual([]); // whitespace-only after trim
    expect(productRepository.searchSuggestions).not.toHaveBeenCalled();
  });

  it("trims the query and passes it to the repository with the fixed cap", async () => {
    const { useCase, productRepository } = build([{ id: "p1" }]);
    await useCase.execute("  scarf  ");
    expect(productRepository.searchSuggestions).toHaveBeenCalledWith("scarf", MAX_SUGGESTIONS);
  });

  it("returns the repository's rows unchanged", async () => {
    const rows = [
      { id: "p1", slug: "silk-scarf", name: "Silk Scarf", minPricePaiseCache: 7200, primaryImage: null },
    ];
    const { useCase } = build(rows);
    expect(await useCase.execute("scarf")).toEqual(rows);
  });
});
