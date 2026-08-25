import { MyOrdersList } from "@/features/orders/components/MyOrdersList";

export default function MyOrdersPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-2xl text-text-primary">My orders</h1>
      <MyOrdersList />
    </main>
  );
}
