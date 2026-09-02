import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import type { ReactNode } from "react";
import { Providers } from "@/app/providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "Woobe Admin",
  description: "Woobe internal admin console.",
};

// Never set (found checking the admin side, Week 2 Day 4) — without this,
// a mobile browser has no `<meta name="viewport">` at all and falls back
// to a ~980px desktop-simulation layout width, silently shrinking the
// entire app rather than actually rendering at the device's real width.
// apps/web has had this since Week 1; apps/admin never did.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
