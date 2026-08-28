import { CustomerDetail } from "@/features/customers/components/CustomerDetail";

export default async function CustomerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CustomerDetail customerId={id} />;
}
