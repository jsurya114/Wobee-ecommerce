import { Suspense } from "react";
import { HelpSupportPage } from "@/features/support/components/HelpSupportPage";

export default function AccountHelpPage() {
  return (
    <Suspense>
      <HelpSupportPage />
    </Suspense>
  );
}
