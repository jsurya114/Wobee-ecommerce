import type { Metadata } from "next";
import type { ReactNode } from "react";

/** Week 2 Day 9 (week2 (1).md §19) — every /account/* page is one customer's own private data, never a page search engines should index. Applies to this whole route segment (profile, addresses, orders, order detail) in one place rather than repeating it per page. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AccountLayout({ children }: { children: ReactNode }) {
  return children;
}
