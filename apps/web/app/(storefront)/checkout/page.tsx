import type { Metadata } from "next";
import { CheckoutForm } from "@/features/checkout/components/CheckoutForm";

/** Week 2 Day 9 — a checkout flow is never a page worth indexing. */
export const metadata: Metadata = { title: "Checkout", robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 font-display text-xl text-text-primary">Checkout</h1>
      <CheckoutForm />
    </main>
  );
}
