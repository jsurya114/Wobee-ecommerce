import { ArrowRight } from "lucide-react";
import Link from "next/link";

/**
 * Homepage hero (woobe_ui_design_plan.md §8.1) — headline + tagline + CTA
 * on the brand background. No rotating/video slides this pass — those need
 * real photography/video assets that don't exist yet (scope decision: focused
 * homepage, real data only, see the UI styling plan).
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-primary-tint/70 via-background to-background px-4 pb-14 pt-16 text-center sm:px-6 sm:pt-24">
      <p className="font-body text-xs font-medium uppercase tracking-[0.2em] text-primary">Fashion, by weight</p>
      <h1 className="mx-auto mt-3 max-w-4xl text-balance font-display text-4xl leading-tight text-text-primary sm:text-5xl">
        Priced by what it&apos;s made of, not what it&apos;s marked up to.
      </h1>
      <p className="mx-auto mt-4 max-w-2xl text-pretty font-body text-base text-text-secondary">
        Every piece shows its weight, its rate per kilo, and the exact price that follows — no guesswork, no markup games.
      </p>
      <Link
        href="/products"
        className="mt-8 inline-flex h-12 items-center gap-2 rounded-control bg-primary px-6 font-body text-base font-medium text-white transition-colors hover:bg-primary-hover"
      >
        Shop new drops
        <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}
