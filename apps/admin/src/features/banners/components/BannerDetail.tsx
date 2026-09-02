"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useAdminBanner } from "../hooks/useAdminBanner";
import { BannerForm } from "./BannerForm";

export function BannerDetail({ bannerId }: { bannerId: string }) {
  const { banner, loading, error, update, setActive } = useAdminBanner(bannerId);
  const [isTogglingActive, setIsTogglingActive] = useState(false);

  if (loading) {
    return <LoadingState />;
  }
  if (error) {
    return <p className="py-12 text-center font-body text-sm text-error">{error}</p>;
  }
  if (!banner) {
    return <p className="py-12 text-center font-body text-sm text-text-secondary">Banner not found.</p>;
  }

  const toggleActive = async () => {
    setIsTogglingActive(true);
    try {
      await setActive(!banner.isActive);
      toast.success(banner.isActive ? "Banner deactivated" : "Banner activated");
    } catch (error_) {
      toast.error(error_ instanceof ApiError ? error_.message : "That didn't work.");
    } finally {
      setIsTogglingActive(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 md:max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl text-text-primary">{banner.title ?? "Untitled banner"}</h1>
        <div className="flex items-center gap-2">
          <Badge variant={banner.isActive ? "success" : "neutral"}>{banner.isActive ? "active" : "inactive"}</Badge>
          <Button variant="secondary" size="sm" isLoading={isTogglingActive} onClick={() => void toggleActive()}>
            {banner.isActive ? "Deactivate" : "Activate"}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <h2 className="mb-3 font-body text-sm font-medium text-text-primary">Details</h2>
        <BannerForm
          // Next's App Router reuses this component instance across /banners/[id1] ->
          // /banners/[id2] navigation — without a key tied to the id, BannerForm's
          // internal useState (image/title/etc.) would keep showing the previous
          // banner's values after `banner` has already updated underneath it.
          key={bannerId}
          initialValues={banner}
          submitLabel="Save changes"
          onSubmit={async (payload) => {
            await update(payload);
            toast.success("Banner updated");
          }}
        />
      </Card>
    </div>
  );
}
