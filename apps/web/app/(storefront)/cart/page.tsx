import { CartPageContent } from "@/features/cart/components/CartPageContent";

export default function CartPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-2xl text-text-primary">Your bag</h1>
      <CartPageContent />
    </main>
  );
}
