import { Gem, Headphones, ShieldCheck, Sparkles, Truck } from "lucide-react";
import type { ReactNode } from "react";

const TRUST = [
  { icon: ShieldCheck, label: "Secure Shopping", note: "Your data is 100% protected" },
  { icon: Truck, label: "Free Shipping", note: "On orders above ₹999" },
  { icon: Gem, label: "Premium Quality", note: "Handpicked for you" },
  { icon: Headphones, label: "Customer Support", note: "We're here to help" },
] as const;

/**
 * Brand-side panel — hidden below `lg`. Background image comes from the
 * caller (`/login` and `/register` pass different photos from `public/`);
 * a soft scrim + a frosted card keep the overlaid copy readable whatever
 * sits behind it.
 */
function BrandPanel({ src }: { src: string }) {
  return (
    <aside className="relative hidden overflow-hidden bg-primary-tint lg:flex lg:flex-col lg:items-center lg:justify-center lg:px-12">
      {/* Plain <img> matches this repo's convention (see ProductCard). */}
      <img
        src={src}
        alt="A boutique rail of dresses in blush, rose and cream, beside a handbag and dried flowers"
        loading="eager"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-background/25" />
      <div className="relative z-10 rounded-card bg-background/70 px-9 py-8 text-center shadow-card backdrop-blur-sm">
        <p className="font-display text-4xl tracking-[0.15em] text-primary">WOOBE</p>
        <p className="mt-2 font-body text-xs font-medium uppercase tracking-[0.35em] text-text-secondary">Women&apos;s Boutique</p>
        <span className="my-7 flex items-center justify-center gap-3 text-primary">
          <span className="h-px w-10 bg-primary/40" />
          <Sparkles className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
          <span className="h-px w-10 bg-primary/40" />
        </span>
        <p className="font-display text-2xl text-text-primary">Elevate Your Style</p>
        <p className="mx-auto mt-3 max-w-xs font-body text-sm text-text-secondary">Premium quality. Timeless fashion. Made for you.</p>
      </div>
    </aside>
  );
}

function AuthTrustRow() {
  return (
    <section className="border-t border-border bg-surface px-4 py-8 sm:px-6">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 sm:grid-cols-4">
        {TRUST.map(({ icon: Icon, label, note }) => (
          <div key={label} className="flex flex-col items-center gap-1.5 text-center">
            <Icon className="h-6 w-6 text-primary" strokeWidth={1.75} aria-hidden="true" />
            <p className="font-body text-sm font-medium text-text-primary">{label}</p>
            <p className="font-body text-xs text-text-secondary">{note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

/** Presentational shell shared by /login and /register — split panel on `lg`, single centred column below it, trust row underneath. No auth logic. */
export function AuthShell({ children, image = "/auth-hero.jpg" }: { children: ReactNode; image?: string }) {
  return (
    <main>
      <div className="grid lg:min-h-[36rem] lg:grid-cols-2">
        <BrandPanel src={image} />
        <div className="flex items-center justify-center px-4 py-12 sm:px-6">
          <div className="w-full max-w-md">{children}</div>
        </div>
      </div>
      <AuthTrustRow />
    </main>
  );
}
