import Link from "next/link";
import type { ComponentProps } from "react";
import { NewsletterSignup } from "./NewsletterSignup";

function InstagramIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" aria-hidden="true" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function FacebookIcon(props: ComponentProps<"svg">) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M13.5 21v-8h2.5l.5-3h-3V8.25C13.5 7.4 13.8 7 15 7h1.5V4.3C16.2 4.2 15.1 4 13.9 4 11.4 4 10 5.5 10 8v2H7.5v3H10v8h3.5z" />
    </svg>
  );
}

/**
 * Storefront footer. Desktop/laptop only (`hidden md:block`) — on mobile the
 * fixed BottomNav already owns the bottom of the screen and would sit on top
 * of it. Internal links point only at routes that exist today; standalone
 * legal / help pages get linked in here when they're built.
 */
const COLUMNS: { heading: string; links: { label: string; href: string }[] }[] = [
  {
    heading: "Shop",
    links: [
      { label: "All products", href: "/products" },
      { label: "Wishlist", href: "/wishlist" },
      { label: "Bag", href: "/cart" },
    ],
  },
  {
    heading: "Account",
    links: [
      { label: "My account", href: "/account" },
      { label: "My orders", href: "/account/orders" },
      { label: "Addresses", href: "/account/addresses" },
    ],
  },
  {
    heading: "Help",
    links: [
      { label: "Contact us", href: "mailto:hello@woobe.in" },
      { label: "Track your order", href: "/account/orders" },
      { label: "Shipping & returns", href: "/account/orders" },
    ],
  },
];

const SOCIAL = [
  { label: "Instagram", href: "https://instagram.com", Icon: InstagramIcon },
  { label: "Facebook", href: "https://facebook.com", Icon: FacebookIcon },
];

export function SiteFooter() {
  return (
    <footer className="hidden border-t border-border bg-background md:block">
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap justify-between gap-12">
          <div className="max-w-sm">
            <Link href="/" className="font-display text-xl text-primary">
              Woobe
            </Link>
            <p className="mt-2 font-body text-sm text-text-secondary">
              Considered pieces for everyday wear — made in India.
            </p>

            <p className="mt-6 mb-2 font-body text-sm font-medium text-text-primary">Get 10% off your first order</p>
            <NewsletterSignup />

            <div className="mt-6 flex gap-3">
              {SOCIAL.map(({ label, href, Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={label}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-text-secondary transition-colors hover:border-primary hover:text-primary"
                >
                  <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </a>
              ))}
            </div>
          </div>

          <nav className="flex flex-wrap gap-12 font-body text-sm">
            {COLUMNS.map((column) => (
              <div key={column.heading}>
                <p className="mb-3 font-medium text-text-primary">{column.heading}</p>
                <ul className="space-y-2">
                  {column.links.map((link) => (
                    <li key={`${column.heading}-${link.label}`}>
                      <Link href={link.href} className="text-text-secondary transition-colors hover:text-primary">
                        {link.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-12 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 font-body text-xs text-text-secondary">
          <p>© {new Date().getFullYear()} Woobe. All rights reserved.</p>
          <p>Prices in INR · Secure checkout</p>
        </div>
      </div>
    </footer>
  );
}
