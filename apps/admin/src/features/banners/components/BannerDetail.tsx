"use client";

import { LoadingState } from "@/features/shell/components/LoadingState";
import { Badge, Button, Card } from "@woobe/ui";
import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { useSaveAndRedirect } from "@/lib/use-save-and-redirect";
import { useAdminBanner } from "../hooks/useAdminBanner";
import { BannerForm } from "./BannerForm";

export function BannerDetail({ bannerId }: { bannerId: string }) {
  const saveAndRedirect = useSaveAndRedirect("/banners");
  const { banner, loading, error, update, setActive } = useAdminBanner(bannerId);
  const [isTogglingActive, setIsTogglingActive] = useState(false);
  // Bumped after every successful same-banner save so BannerForm below remounts (see its `key`) —
  // the update mutation already refreshes the cached `banner` query data correctly, but BannerForm's
  // own local useState fields only initialize from `initialValues` on mount, so without this the form
  // would keep showing pre-save values even though the save genuinely persisted. Same root cause/fix as CouponDetail.
  const [saveGen, setSaveGen] = useState(0);

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
          // `saveGen` also bumps this key after a same-banner save so the form remounts with the fresh values too.
          key={`${bannerId}:${saveGen}`}
          initialValues={banner}
          submitLabel="Save changes"
          onSubmit={(payload) =>
            saveAndRedirect(async () => {
              await update(payload);
              setSaveGen((g) => g + 1);
            })
          }
        />
      </Card>
    </div>
  );
}
