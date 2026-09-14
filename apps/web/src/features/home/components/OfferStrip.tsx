"use client";

import { useEffect, useState } from "react";
import type { HomeOffer } from "../api/home.client";

/**
 * The homepage promotional offer strip (Phase 2, 2026-09-14) — a slim,
 * moving bar at the top of the storefront listing currently active
 * offers. Purely a rendering of `home.activeOffers` (already filtered
 * server-side to isActive + in-schedule — GetHomePageUseCase's own
 * ListActiveOffersForStripUseCase, mirroring `isBannerVisible`'s own "no
 * cron job" rule) — never hardcoded copy, and `[]` renders nothing at all
 * rather than an empty bar.
 *
 * "Moving" is a plain CSS keyframe (globals.css's `offer-strip-marquee`),
 * not a library — the message list is duplicated once so the loop point
 * is seamless, and the whole thing collapses to a static, un-animated row
 * under `prefers-reduced-motion: reduce` (same `window.matchMedia` check
 * PromoCarousel already uses, not a second implementation of that check).
 * Fixed height (`h-9`), so it can never cause layout shift as
 * `home.activeOffers` loads or changes between requests.
 */
export function OfferStrip({ offers }: { offers: HomeOffer[] }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (offers.length === 0) return null;

  const messages = offers.map(formatOfferMessage);
  // Rough reading-speed-scaled duration (not a fixed number) — more offers
  // means a longer track, so the scroll speed stays roughly constant
  // instead of a 1-offer strip and a 10-offer strip taking the same time.
  const durationSeconds = Math.max(15, messages.join(" ").length * 0.12);

  return (
    <div className="flex h-9 items-center overflow-hidden bg-primary text-white" role="region" aria-label="Current offers">
      {reducedMotion ? (
        <p className="w-full truncate px-4 text-center font-body text-xs font-medium sm:text-sm">{messages.join("   ·   ")}</p>
      ) : (
        <div
          className="flex w-max shrink-0 items-center gap-10 whitespace-nowrap motion-reduce:animate-none"
          style={{ animation: `offer-strip-marquee ${durationSeconds}s linear infinite` }}
        >
          {/* Track duplicated exactly once — the keyframe scrolls by -50% of this element's own width, so the second copy lines up seamlessly with the first as it scrolls back into view. */}
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center gap-10 pl-10" aria-hidden={copy === 1}>
              {messages.map((message, i) => (
                <span key={i} className="font-body text-xs font-medium sm:text-sm">
                  {message}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function formatOfferMessage(offer: HomeOffer): string {
  const discount = offer.discountType === "PERCENTAGE" ? `${offer.discountValue}% OFF` : `₹${Math.round(offer.discountValue / 100)} OFF`;
  return `${offer.name} — ${discount}`;
}
