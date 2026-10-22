import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ListProductsFilter, ProductRepositoryPort } from "../../application/ports/product-repository.port";
import { CachedProductRepository } from "./cached-product-repository";

// vi.hoisted: vi.mock is hoisted above the imports, so the spy it closes over must be too.
const { cacheAside } = vi.hoisted(() => ({
  cacheAside: vi.fn((_key: string, _ttl: number, load: () => Promise<unknown>) => load()),
}));
vi.mock("../../../../shared/cache/catalog-cache", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../../../shared/cache/catalog-cache")>()),
  cacheAside: (key: string, ttl: number, load: () => Promise<unknown>) => cacheAside(key, ttl, load),
  bumpCatalogCacheVersion: vi.fn(),
}));

const BASE: ListProductsFilter = { sort: "price_desc", page: 1, limit: 24 };

describe("CachedProductRepository.findMany cache keys (2026-09-30)", () => {
  let repository: CachedProductRepository;
  beforeEach(() => {
    cacheAside.mockClear();
    const inner = { findMany: vi.fn().mockResolvedValue({ products: [], total: 0 }) };
    repository = new CachedProductRepository(inner as unknown as ProductRepositoryPort);
  });
  const keyFor = async (filter: ListProductsFilter) => {
    await repository.findMany(filter);
    return cacheAside.mock.calls.at(-1)![0];
  };

  it("never shares an entry between two budgets", async () => {
    const stock = { inStockVariantIds: ["v1", "v2"] };
    expect(await keyFor({ ...BASE, ...stock, maxPricePaise: 29_900 })).not.toBe(await keyFor({ ...BASE, ...stock, maxPricePaise: 49_900 }));
    expect(await keyFor({ ...BASE, ...stock, maxPricePaise: 29_900 })).not.toBe(await keyFor({ ...BASE, ...stock }));
  });

  it("caches in-stock listings per live stock set — a sell-out or restock is a new key, same set is a hit", async () => {
    const filter = { ...BASE, maxPricePaise: 29_900 };
    const before = await keyFor({ ...filter, inStockVariantIds: ["v1", "v2"] });
    expect(await keyFor({ ...filter, inStockVariantIds: ["v2", "v1"] })).toBe(before);
    expect(await keyFor({ ...filter, inStockVariantIds: ["v1"] })).not.toBe(before);
    expect(await keyFor({ ...filter, inStockVariantIds: ["v1", "v2", "v3"] })).not.toBe(before);
  });
});
