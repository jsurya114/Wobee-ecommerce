import { NewBannerForm } from "@/features/banners/components/NewBannerForm";

export default function NewBannerPage() {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-display text-xl text-text-primary">New banner</h1>
      <NewBannerForm />
    </div>
  );
}
