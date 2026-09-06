import { StaffDetail } from "@/features/staff/components/StaffDetail";

export default async function StaffDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffDetail staffId={id} />;
}
