import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/providers";
import "./globals.css";

// project_planning/woobe_ui_design_plan.md §4 — display serif + body sans, variable weight, Google Fonts.
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const playfairDisplay = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-playfair",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Woobe — Fashion, by weight.",
  description: "Transparent, weight-based fashion pricing.",
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
