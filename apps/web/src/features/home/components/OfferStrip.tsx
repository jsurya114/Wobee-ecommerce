"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatOfferBadgeLabel } from "@/features/catalog/lib/format-offer-badge";
import type { HomeOffer } from "../api/home.client";

/**
 * The homepage promotional offer strip (Phase 2, 2026-09-14; redesigned
 * offer merchandising pass, 2026-09-15 — the original version's large
 * inter-message gaps and generic ticker feel were reported directly against
 * a mobile screenshot). Purely a rendering of `home.activeOffers` (already
 * filtered + deterministically ordered server-side — priority DESC, then
 * createdAt DESC, see `ListActiveOffersForStripUseCase`) — never hardcoded
 * copy, and `[]` renders nothing at all rather than an empty bar.
 *
 * SEAMLESS LOOP, why it's mathematically exact: the track renders the exact
 * same message list TWICE, back to back (`[0, 1].map`), and the CSS keyframe
 * (`offer-strip-marquee`, globals.css) translates the whole track by exactly
 * `-50%` of ITS OWN width — i.e. exactly the width of one copy. At the
 * instant the animation completes one cycle, copy 1 (now sitting where copy
 * 0 started) is pixel-identical to where copy 0 was at t=0, so the keyframe
 * restarting (`infinite`) is visually indistinguishable from the animation
 * simply continuing — there is no discrete "reset" frame to see, regardless
 * of how many offers are in the list or how long their names are (the
 * technique never depends on N, only on the two copies being identical).
 *
 * Rhythm comes from a compact "✦" separator after every message (never a
 * bare width gap) — every child in the animated track shares one `gap-3`
 * flex rhythm (message → separator → message → …, including across the
 * copy-0/copy-1 seam), so there's no double-wide gap at the loop point
 * either. Each message is a real link to that offer's own filtered listing
 * (`/products?offerId=`, offer merchandising pass) — never a dead ticker.
 *
 * Collapses to a static, wrapped, un-animated row under
 * `prefers-reduced-motion: reduce` (same `window.matchMedia` check
 * PromoCarousel already uses) — the copy is identical either way, motion is
 * never the only way to read it. Fixed height (`h-9`), so it can never
 * cause layout shift as `home.activeOffers` loads or changes between
 * requests.
 */
export function OfferStrip({ offers }: { offers: HomeOffer[] }) {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  if (offers.length === 0) return null;

  // Rough reading-speed-scaled duration (not a fixed number) — more/longer
  // offer names means a longer track, so scroll speed stays roughly
  // constant instead of a 1-offer strip and a 5-offer strip taking the same
  // time to complete a cycle.
  const totalLength = offers.map((offer) => `${offer.name} — ${formatOfferBadgeLabel(offer)}`).join(" ").length;
  const durationSeconds = Math.max(15, totalLength * 0.12);

  return (
    <div className="flex h-9 items-center overflow-hidden bg-primary text-white" role="region" aria-label="Current offers">
      {reducedMotion ? (
        <div className="flex w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5">
          {offers.map((offer, i) => (
            <span key={offer.id} className="flex items-center gap-3">
              {i > 0 ? (
                <span aria-hidden="true" className="text-[10px] text-white/50">
                  ✦
                </span>
              ) : null}
              <OfferMessage offer={offer} />
            </span>
          ))}
        </div>
      ) : (
        <div
          className="flex w-max shrink-0 items-center gap-3 whitespace-nowrap motion-reduce:animate-none"
          style={{ animation: `offer-strip-marquee ${durationSeconds}s linear infinite` }}
        >
          {/* Track duplicated exactly once — see the component's own doc comment for why the keyframe's -50% translate makes this loop seamless regardless of content length. */}
          {[0, 1].map((copy) => (
            <div key={copy} className="flex shrink-0 items-center gap-3" aria-hidden={copy === 1}>
              {offers.map((offer) => (
                <span key={offer.id} className="flex shrink-0 items-center gap-3">
                  <OfferMessage offer={offer} tabIndex={copy === 1 ? -1 : undefined} />
                  <span aria-hidden="true" className="text-[10px] text-white/50">
                    ✦
                  </span>
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * One offer's compact promotional copy — "CHRISTMAS SALE — 20% OFF" — built
 * from real Offer data via the SAME discount-label formatter every card/PDP
 * badge already uses (`formatOfferBadgeLabel`), never a second "X% OFF"
 * string builder. Links to that offer's own filtered listing (offer
 * merchandising pass, 2026-09-15) — `tabIndex={-1}` on the hidden duplicate
 * copy keeps keyboard users from tabbing into invisible content.
 */
function OfferMessage({ offer, tabIndex }: { offer: HomeOffer; tabIndex?: number }) {
  return (
    <Link
      href={`/products?offerId=${offer.id}`}
      tabIndex={tabIndex}
      className="font-body text-[11px] font-semibold uppercase tracking-wide hover:underline sm:text-xs"
    >
      {offer.name} <span className="font-normal text-white/85">— {formatOfferBadgeLabel(offer)}</span>
    </Link>
  );
}
