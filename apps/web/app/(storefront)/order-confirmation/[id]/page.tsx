import { OrderConfirmation } from "@/features/orders/components/OrderConfirmation";

export default async function OrderConfirmationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <OrderConfirmation orderId={id} />
    </main>
  );
}
