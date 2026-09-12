"use client";

import { useEffect } from "react";

/**
 * Lands on `/#loved-by-customers` / `/#curated-collections` (hamburger menu
 * links) reliably. The browser's own fragment-scroll-on-load turned out
 * flaky here — confirmed live, reproducing intermittently regardless of
 * whether the navigation came from a plain `<a>` or an explicit
 * `window.location.href` assignment — so this takes scrolling into its own
 * hands instead of trusting that timing. Runs once per homepage mount;
 * `requestAnimationFrame` gives below-the-fold client components (the promo
 * carousel, product rails) one paint to finish sizing before it measures the
 * target. `scroll-margin-top` on the target section (see `ProductRail`/
 * `FeaturedCollections`) keeps this clear of the sticky header the same way
 * it would for native fragment scrolling.
 */
export function ScrollToHashOnLoad() {
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const id = hash.slice(1);

    const raf = requestAnimationFrame(() => {
      document.getElementById(id)?.scrollIntoView({ block: "start" });
    });

    return () => cancelAnimationFrame(raf);
  }, []);

  return null;
}
