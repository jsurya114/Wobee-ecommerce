/**
 * Client-review fix (2026-09-03) — every seed-era product/category/banner
 * image was written as a path relative to `apps/web`'s own `public/`
 * directory (e.g. `/imgs/cat-tops.jpg`): correct when `apps/web` renders
 * it (same origin), broken when `apps/admin` does (a different origin/
 * port — confirmed live: every seeded image showed as a broken `<img>` in
 * every admin screen that renders one). A real admin-uploaded image (via
 * the media-upload endpoint) is already an absolute URL from the API's own
 * `/uploads` mount and passes through here unchanged.
 *
 * Resolves a relative path against `NEXT_PUBLIC_SITE_URL` — the
 * storefront's own public origin, the same env var `apps/web` already
 * uses for its own canonical-URL purposes (mirrored into `apps/admin`'s
 * env rather than inventing a new name).
 */
export function resolveImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//.test(url)) return url;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) return url; // No configured storefront origin — leave as-is rather than guess one.

  return `${siteUrl.replace(/\/$/, "")}${url.startsWith("/") ? "" : "/"}${url}`;
}
