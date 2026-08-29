import type { Metadata } from "next";
import { OrderConfirmation } from "@/features/orders/components/OrderConfirmation";

/** Week 2 Day 9 — one customer's own order, never indexable content. */
export const metadata: Metadata = { title: "Order Confirmed", robots: { index: false, follow: false } };

export default async function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <OrderConfirmation orderId={id} />
    </main>
  );
}
