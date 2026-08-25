import type { Metadata } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import type { ReactNode } from "react";
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${playfairDisplay.variable}`}>
      <body>{children}</body>
    </html>
  );
}
