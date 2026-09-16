"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatOfferBadgeLabel } from "@/features/catalog/lib/format-offer-badge";
import type { HomeOffer } from "../api/home.client";

/** Constant scroll speed (2026-09-16) — the strip's duration is derived FROM this, never the other way round, so pace stays identical whether the container is a phone or an ultra-wide monitor. */
const PX_PER_SECOND = 45;
/**
 * Repeats rendered before the real measurement below corrects it — just a
 * safe-looking first paint (SSR has no layout to measure), picked large
 * enough that a single short offer still roughly fills a very wide desktop
 * bar instead of visibly stopping partway across. Real value is set by
 * `useIsomorphicLayoutEffect` before the browser's first paint, so this
 * never actually shows.
 */
const INITIAL_COPIES = 8;

/** Avoids the "useLayoutEffect does nothing on the server" warning under SSR — behaves exactly like useLayoutEffect once hydrated in the browser, which is what the width measurement below needs (synchronous, pre-paint). */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/**
 * The storefront's promotional offer marquee (Phase 2, 2026-09-14;
 * redesigned offer merchandising pass, 2026-09-15; moved sitewide, above
 * `SiteHeader` in the shared layout, 2026-09-16; edge-to-edge coverage +
 * constant-speed rewrite, 2026-09-16). Purely a rendering of
 * `home.activeOffers` (already filtered + deterministically ordered
 * server-side — priority DESC, then createdAt DESC, see
 * `ListActiveOffersForStripUseCase`) — never hardcoded copy, and `[]`
 * renders nothing at all rather than an empty bar.
 *
 * COVERAGE, why "exactly two copies" (the original implementation) wasn't
 * enough: with few/short offers, one full pass through `offers` can be far
 * narrower than the strip itself (e.g. ~216px of text on a 2000px-wide
 * desktop bar). Two copies of that is still only ~433px — most of the bar
 * sat empty background color, and the message visibly "popped in" rather
 * than flowing continuously off the right edge. Fixed by measuring, after
 * mount, exactly how wide one pass through `offers` renders as
 * (`periodWidth`, off the hidden `measureRef` element) against the visible
 * strip's own width (`container.clientWidth`), and repeating `offers`
 * enough times (`copies`) that `copies * periodWidth` alone already exceeds
 * the strip's width. Re-measured on resize (`ResizeObserver`) and once
 * fonts finish loading (font metrics change `periodWidth` without firing a
 * resize). Re-derives on `offers` changing too.
 *
 * SEAMLESS LOOP, why it's mathematically exact regardless of `copies`: the
 * track renders `offers` repeated `copies * 2` times (not `copies`) as ONE
 * FLAT flex row — deliberately not nested copy-wrapper divs. Every item
 * (message + "✦" separator) carries its own trailing `pr-3` instead of
 * relying on a parent flex `gap`, so the spacing rhythm is identical
 * between every adjacent pair, including every seam between repeats. That
 * makes the first `copies` repeats (the "coverage" half) and the second
 * `copies` repeats pixel-identical in width, so the CSS keyframe
 * (`offer-strip-marquee`, globals.css) translating the track by exactly
 * `-50%` of its own width lands EXACTLY on the second half's start — i.e.
 * the loop restarts on content that's pixel-identical to t=0, so there's no
 * discrete "reset" frame to see. (2026-09-16 fix: an earlier version nested
 * two copy-divs, each with its own `gap-3`, PLUS the same `gap-3` on the
 * outer track between those two divs — `2N` items sharing only `2N - 1`
 * gaps, so `-50%` landed half a gap short every cycle. That read as a
 * stutter, distinct from the coverage gap above.)
 *
 * Each message is a real link to that offer's own filtered listing
 * (`/products?offerId=`, offer merchandising pass) — never a dead ticker.
 * Only the very first, genuinely-visible pass through `offers` stays in the
 * accessibility tree / tab order (`isDuplicate` below) — every repeat past
 * that, coverage or loop, is `aria-hidden` + `tabIndex={-1}`.
 *
 * Speed: `PX_PER_SECOND` is the one constant — duration is derived from it
 * (`(copies * periodWidth) / PX_PER_SECOND`), never a fixed number of
 * seconds, so pace reads the same regardless of viewport width or how many
 * offers are active. (An earlier version guessed duration from character
 * count with a 15s floor; that floor alone made a single short offer crawl
 * — see git history if that reasoning is ever needed again.)
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
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [copies, setCopies] = useState(INITIAL_COPIES);
  const [durationSeconds, setDurationSeconds] = useState(20);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useIsomorphicLayoutEffect(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure || reducedMotion || offers.length === 0) return;

    function recalculate() {
      if (!container || !measure) return;
      const periodWidth = measure.scrollWidth;
      const containerWidth = container.clientWidth;
      if (periodWidth === 0) return;
      // +1 beyond the ceil so containerWidth landing exactly on a multiple
      // of periodWidth still leaves a full extra pass hanging off the right
      // edge — that overhang is exactly what's visible sliding in as the
      // track scrolls, instead of the coverage edge lining up with the
      // viewport edge and looking like it "just barely" fills it.
      const neededCopies = Math.max(2, Math.ceil(containerWidth / periodWidth) + 1);
      setCopies(neededCopies);
      setDurationSeconds(Math.max(4, (neededCopies * periodWidth) / PX_PER_SECOND));
    }

    recalculate();
    const observer = new ResizeObserver(recalculate);
    observer.observe(container);
    document.fonts?.ready?.then(recalculate).catch(() => {});
    return () => observer.disconnect();
  }, [offers, reducedMotion]);

  if (offers.length === 0) return null;

  return (
    <div ref={containerRef} className="flex h-9 items-center overflow-hidden bg-primary text-white" role="region" aria-label="Current offers">
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
        <>
          {/* Hidden probe — exists purely so the layout effect can measure `periodWidth` (the width of exactly one pass through `offers`). Absolutely positioned so it never affects the visible strip's height/layout. */}
          <div
            ref={measureRef}
            aria-hidden="true"
            className="invisible absolute left-0 top-0 flex shrink-0 items-center whitespace-nowrap"
          >
            {offers.map((offer) => (
              <span key={offer.id} className="flex shrink-0 items-center gap-3 pr-3">
                <OfferMessage offer={offer} tabIndex={-1} />
                <span aria-hidden="true" className="text-[10px] text-white/50">
                  ✦
                </span>
              </span>
            ))}
          </div>
          <div
            className="flex w-max shrink-0 items-center whitespace-nowrap motion-reduce:animate-none"
            style={{ animation: `offer-strip-marquee ${durationSeconds}s linear infinite` }}
          >
            {/* `copies * 2` flat repeats of `offers` — see the component doc comment for why doubling (not just `copies`) is what makes -50% an exact loop, and why `copies` itself (not a fixed 2) is what fills the strip edge-to-edge instead of leaving a visible gap. */}
            {Array.from({ length: copies * 2 }, (_, copyIndex) => copyIndex).flatMap((copyIndex) =>
              offers.map((offer, offerIndex) => {
                const index = copyIndex * offers.length + offerIndex;
                const isDuplicate = index >= offers.length;
                return (
                  <span
                    key={`${offer.id}-${index}`}
                    className="flex shrink-0 items-center gap-3 pr-3"
                    aria-hidden={isDuplicate}
                  >
                    <OfferMessage offer={offer} tabIndex={isDuplicate ? -1 : undefined} />
                    <span aria-hidden="true" className="text-[10px] text-white/50">
                      ✦
                    </span>
                  </span>
                );
              }),
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * One offer's compact promotional copy — "CHRISTMAS SALE — 20% OFF" — built
 * from real Offer data via the SAME discount-label formatter every card/PDP
 * badge already uses (`formatOfferBadgeLabel`), never a second "X% OFF"
 * string builder. Links to that offer's own filtered listing (offer
 * merchandising pass, 2026-09-15) — `tabIndex={-1}` on every hidden
 * duplicate/coverage copy keeps keyboard users from tabbing into invisible
 * or redundant content.
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
