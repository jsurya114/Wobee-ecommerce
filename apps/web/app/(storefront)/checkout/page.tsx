import { CheckoutForm } from "@/features/checkout/components/CheckoutForm";

export default function CheckoutPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <h1 className="mb-6 font-display text-2xl text-text-primary">Checkout</h1>
      <CheckoutForm />
    </main>
  );
}
