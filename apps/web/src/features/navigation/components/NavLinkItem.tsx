import Link from "next/link";
import type { ReactNode } from "react";

const LINK_CLASS = "rounded-control px-2 py-2.5 font-body text-sm text-text-primary transition-colors hover:bg-surface-2 hover:text-primary";

export function NavLinkItem({ href, onNavigate, children }: { href: string; onNavigate: () => void; children: ReactNode }) {
  // Homepage section anchors (Loved by Customers / Curated Collections) need
  // a real browser navigation, not Next's client-side <Link> soft nav —
  // confirmed live that a soft nav from a different route doesn't reliably
  // land on the target section. A plain <a> triggers a normal hard
  // navigation; landing precisely on the section itself is handled
  // independently by the homepage's own `ScrollToHashOnLoad` (the browser's
  // native fragment-scroll-on-load proved flaky here regardless of how the
  // navigation was issued, so correctness doesn't depend on it).
  if (href.includes("/#")) {
    return (
      <a href={href} onClick={onNavigate} className={LINK_CLASS}>
        {children}
      </a>
    );
  }

  return (
    <Link href={href} onClick={onNavigate} className={LINK_CLASS}>
      {children}
    </Link>
  );
}
