/**
 * The canonical origin for everything SEO (Week 2 Day 9, week2 (1).md §19)
 * — `metadataBase`, canonical `<link>` tags, OpenGraph `url`, `robots.txt`,
 * and `sitemap.xml` all resolve against this. Same "fail fast, don't guess"
 * posture as `lib/api-client.ts`'s own `apiBaseUrl()`.
 */
export function siteUrl(): string {
  const url = process.env.NEXT_PUBLIC_SITE_URL;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SITE_URL is not set — copy apps/web/.env.example to apps/web/.env.local (see comment there).");
  }
  return url;
}

export function absoluteUrl(path: string): string {
  return new URL(path, siteUrl()).toString();
}
