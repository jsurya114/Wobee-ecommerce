"use client";

import { Card } from "@woobe/ui";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAdminAuth } from "@/features/auth/hooks/useAdminAuth";
import * as bannersApi from "../api/admin-banners.client";
import { BannerForm } from "./BannerForm";

export function NewBannerForm() {
  const router = useRouter();
  const { accessToken } = useAdminAuth();

  return (
    <Card className="max-w-xl p-4">
      <BannerForm
        submitLabel="Create banner"
        onSubmit={async (payload) => {
          if (!accessToken) return;
          const result = await bannersApi.createBanner(payload, accessToken);
          toast.success("Banner created");
          router.push(`/banners/${result.banner.id}`);
        }}
      />
    </Card>
  );
}
