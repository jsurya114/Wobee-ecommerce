import type { Metadata } from "next";
import { PaymentStatus } from "@/features/payments/components/PaymentStatus";

/** One customer's own in-progress payment, never indexable content — same posture as /order-confirmation. */
export const metadata: Metadata = { title: "Complete Payment", robots: { index: false, follow: false } };

export default async function PaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <PaymentStatus orderId={id} />
    </main>
  );
}
