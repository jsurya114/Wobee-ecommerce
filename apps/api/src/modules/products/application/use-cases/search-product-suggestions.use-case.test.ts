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

  it("trims the query and passes it to the repository as name words, with the fixed cap", async () => {
    const { useCase, productRepository } = build([{ id: "p1" }]);
    await useCase.execute("  scarf  ");
    expect(productRepository.searchSuggestions).toHaveBeenCalledWith(
      { nameTerms: ["scarf"], colorTerms: [], sizeValues: [], fabricTerms: [], fitTerms: [] },
      MAX_SUGGESTIONS,
    );
  });

  it("parses colour, size, fabric and fit out of a natural-language query", async () => {
    const { useCase, productRepository } = build();
    await useCase.execute("rose cotton kurti with relaxed fit small size");
    expect(productRepository.searchSuggestions).toHaveBeenCalledWith(
      { nameTerms: ["kurti"], colorTerms: ["rose"], sizeValues: ["S"], fabricTerms: ["cotton"], fitTerms: ["relaxed"] },
      MAX_SUGGESTIONS,
    );
  });

  it("falls back to the plain query when only filler words are left", async () => {
    const { useCase, productRepository } = build();
    await useCase.execute("with the");
    expect(productRepository.searchSuggestions).toHaveBeenCalledWith(
      { nameTerms: ["with the"], colorTerms: [], sizeValues: [], fabricTerms: [], fitTerms: [] },
      MAX_SUGGESTIONS,
    );
  });

  it("recognises the admin's presets when a vocabulary reader is given", async () => {
    const productRepository = { searchSuggestions: vi.fn().mockResolvedValue([]) } as unknown as ProductRepositoryPort;
    const useCase = new SearchProductSuggestionsUseCase(productRepository, { get: async () => ({ fabrics: ["Mulmul"] }) });
    await useCase.execute("mulmul kurti");
    expect(productRepository.searchSuggestions).toHaveBeenCalledWith(
      { nameTerms: ["kurti"], colorTerms: [], sizeValues: [], fabricTerms: ["mulmul"], fitTerms: [] },
      MAX_SUGGESTIONS,
    );
  });

  it("returns the repository's rows unchanged", async () => {
    const rows = [
      { id: "p1", slug: "silk-scarf", name: "Silk Scarf", minPricePaiseCache: 7200, primaryImage: null },
    ];
    const { useCase } = build(rows);
    expect(await useCase.execute("scarf")).toEqual(rows);
  });
});
