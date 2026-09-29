import { NewStaffForm } from "@/features/staff/components/NewStaffForm";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function NewStaffPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/staff", label: "Staff" }} title="Create staff" />
      <NewStaffForm />
    </div>
  );
}
