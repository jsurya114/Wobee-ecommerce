/**
 * Banner link checks (moved out of banners.schema.ts, 2026-11-03). Kept free
 * of zod on purpose: the storefront homepage carousel imports this directly,
 * so the homepage bundle does not pull in zod through the package barrel.
 */
const PROBE_ORIGIN = "https://woobe.invalid";
// Backslashes, whitespace and control characters are rewritten or stripped by
// browsers' URL parsers ("/\\evil.com" and "/\t/evil.com" both become
// "//evil.com"), so they are never allowed in a banner link at all.
function hasUnsafeLinkChars(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (char === "\\" || /\s/.test(char) || code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

/**
 * True only for a same-site path — decided by actually parsing it the way a
 * browser would, not by string prefix: "/products" stays on-site, while
 * "//evil.com", "/\\evil.com" or "/\t/evil.com" resolve to another host and fail.
 */
export function isSitePath(value: string): boolean {
  if (!value.startsWith("/") || hasUnsafeLinkChars(value)) return false;
  try {
    return new URL(value, PROBE_ORIGIN).origin === PROBE_ORIGIN;
  } catch {
    return false;
  }
}

/** An absolute http(s) URL with no characters a browser would silently rewrite. */
function isAbsoluteHttpUrl(value: string): boolean {
  if (hasUnsafeLinkChars(value)) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:") && url.hostname.length > 0;
  } catch {
    return false;
  }
}

/** A same-site path or an explicit absolute http(s) URL — the only link shapes a banner may point at. */
export function isAllowedBannerLink(value: string): boolean {
  return isSitePath(value) || isAbsoluteHttpUrl(value);
}
