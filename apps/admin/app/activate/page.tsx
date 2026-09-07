import { Suspense } from "react";
import { ActivateStaffForm } from "@/features/staff/components/ActivateStaffForm";

export default function ActivateStaffPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6">
      <div className="text-center">
        <h1 className="font-display text-2xl text-text-primary">Activate your account</h1>
        <p className="mt-1 font-body text-sm text-text-secondary">Enter the code emailed to you and choose a password.</p>
      </div>
      <Suspense>
        <ActivateStaffForm />
      </Suspense>
    </main>
  );
}
