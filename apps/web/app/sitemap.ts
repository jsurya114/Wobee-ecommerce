import type { MetadataRoute } from "next";
import { listCategories } from "@/features/catalog/api/categories.client";
import { listCollections } from "@/features/catalog/api/collections.client";
import { listProducts } from "@/features/catalog/api/products.client";
import { siteUrl } from "@/lib/site-url";

// `force-dynamic` (ADR-026, same rule the homepage's own `page.tsx` already
// follows): this file fetches live catalogue/collection data, which needs
// apps/api reachable — true only by coincidence during a local `next
// build` (if a dev server happens to still be running) and reliably false
// in CI (confirmed by reproducing the exact "fetch failed / ECONNREFUSED"
// build failure with the API stopped, before adding this line). Rendered
// live per-request instead, same as `/`, `/products`, and every other page
// that reads real data.
export const dynamic = "force-dynamic";

// Bounded, same "revisit only past a real scale trigger" posture ADR-012
// already applies to catalogue search — 500 product URLs is comfortably
// past this catalogue's actual size (10 seeded products) with room to grow
// before this needs a paginated/split sitemap (the standard next step past
// a single sitemap.xml, per the sitemap protocol's own 50k-URL cap).
const MAX_PRODUCT_URLS = 500;
const PAGE_SIZE = 50; // productListQuerySchema's own max page size.

async function fetchAllProductSlugs(): Promise<{ slug: string }[]> {
  const slugs: { slug: string }[] = [];
  let page = 1;
  for (;;) {
    const result = await listProducts({ page, limit: PAGE_SIZE, sort: "newest" });
    slugs.push(...result.products.map((p) => ({ slug: p.slug })));
    if (slugs.length >= result.total || slugs.length >= MAX_PRODUCT_URLS || result.products.length === 0) break;
    page += 1;
  }
  return slugs.slice(0, MAX_PRODUCT_URLS);
}

/** Week 2 Day 9 (week2 (1).md §19) — real catalogue data only, no invented URLs. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const [{ categories }, { collections }, products] = await Promise.all([listCategories(), listCollections(), fetchAllProductSlugs()]);

  const staticEntries: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: "daily", priority: 1 },
    { url: `${base}/products`, changeFrequency: "daily", priority: 0.9 },
  ];

  const categoryEntries: MetadataRoute.Sitemap = categories.map((category) => ({
    url: `${base}/products?category=${encodeURIComponent(category.slug)}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const collectionEntries: MetadataRoute.Sitemap = collections.map((collection) => ({
    url: `${base}/collections/${collection.slug}`,
    changeFrequency: "daily",
    priority: 0.7,
  }));

  const productEntries: MetadataRoute.Sitemap = products.map((product) => ({
    url: `${base}/products/${product.slug}`,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticEntries, ...categoryEntries, ...collectionEntries, ...productEntries];
}
