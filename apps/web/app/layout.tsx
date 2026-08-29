import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/providers";
import { siteUrl } from "@/lib/site-url";
import "./globals.css";

// project_planning/woobe_ui_design_plan.md §4 — display serif + body sans, variable weight, Google Fonts.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

const SITE_NAME = "Woobe";
const DEFAULT_TITLE = "Woobe — Fashion, by weight.";
const DEFAULT_DESCRIPTION = "Transparent, weight-based fashion pricing. Every piece shows its weight, its rate per kilo, and the exact price that follows.";

/**
 * Week 2 Day 9 (week2 (1).md §19) — the root-level defaults every page
 * inherits unless it sets its own via `generateMetadata` (product/
 * collection detail, the products listing). `metadataBase` is what makes
 * every other page's relative OG image/canonical URL resolve to a real
 * absolute one instead of Next silently warning and falling back to
 * `http://localhost:3000` regardless of environment.
 */
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: { default: DEFAULT_TITLE, template: `%s — ${SITE_NAME}` },
  description: DEFAULT_DESCRIPTION,
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: DEFAULT_TITLE, description: DEFAULT_DESCRIPTION },
  // Explicit, not just "whatever the default happens to be" — every indexable
  // page (home, products, product/collection detail) is allowed; account/
  // cart/checkout override this to noindex on their own pages, see those
  // layouts/pages.
  robots: { index: true, follow: true },
};

// `viewportFit: "cover"` is what makes `env(safe-area-inset-*)` resolve to
// a real value on notch/home-indicator devices instead of always 0 — needed
// for BottomNav and anything pinned above it (see lib/layout-constants.ts)
// to clear the home indicator instead of sitting under/behind it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfairDisplay.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
