import { OrderDetail } from "@/features/orders/components/OrderDetail";

export default async function AccountOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <OrderDetail orderId={id} />
    </main>
  );
}
