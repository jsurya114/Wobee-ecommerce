import { NewBannerForm } from "@/features/banners/components/NewBannerForm";
import { PageHeader } from "@/features/shell/components/PageHeader";

export default function NewBannerPage() {
  return (
    <div className="flex flex-col gap-4">
      <PageHeader back={{ href: "/banners", label: "Banners" }} title="New banner" />
      <NewBannerForm />
    </div>
  );
}
