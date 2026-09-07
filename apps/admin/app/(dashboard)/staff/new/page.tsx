import { NewStaffForm } from "@/features/staff/components/NewStaffForm";

export default function NewStaffPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">Create staff</h1>
      <NewStaffForm />
    </div>
  );
}
